import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,readFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';

const [tag,commit]=process.argv.slice(2);
assert(process.argv.length===4&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(tag)&&/^[a-f0-9]{40}$/.test(commit),
  'Provide one image tag and a full fixed source commit');
const run=(command,args,options={})=>execFileSync(command,args,{windowsHide:true,maxBuffer:32*1024*1024,...options});
const metadata=JSON.parse(run('docker',['image','inspect',tag],{encoding:'utf8'}))[0];
assert(/^sha256:[a-f0-9]{64}$/.test(metadata.Id));assert.equal(metadata.Config.User,'node');
const program=`const fs=require('fs'),path=require('path'),crypto=require('crypto');
 const assert=require('assert/strict'),root='/app/.skill-runtime-source',files=[];
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const name=path.join(directory,entry.name);assert(!entry.isSymbolicLink(),'Source link rejected');
  if(entry.isDirectory())walk(name);else{assert(entry.isFile());files.push([path.relative(root,name).split(path.sep).join('/'),crypto.createHash('sha256').update(fs.readFileSync(name)).digest('hex')]);}
 }}walk(root);files.sort(([a],[b])=>a.localeCompare(b,'en'));
 for(const name of ['.env','.env.local','.env.production','.env.production.local','.env.development','.env.development.local'])assert(!fs.existsSync('/app/'+name),'Private environment file bundled');
 for(const name of ['backups','tmp','temp','experiments'])assert(!fs.existsSync('/app/'+name),'Private storage root bundled');
 const originals='/app/knowledge';if(fs.existsSync(originals)){
  for(const entry of fs.readdirSync(originals)){assert.equal(entry,'uploads');assert.equal(fs.readdirSync(path.join(originals,entry)).length,0);}
 }
 assert(fs.readdirSync('/app/.next/static').length>0);
 console.log(JSON.stringify({files,buildId:fs.readFileSync('/app/.next/BUILD_ID','utf8').trim(),privateEnvironmentFiles:false,privateStorageFiles:false,staticAssetsPresent:true}));`;
const inventory=JSON.parse(run('docker',['run','--rm','--network','none','--read-only','--entrypoint','node',metadata.Id,'-e',program],{encoding:'utf8'}));
const sourceFiles=run('git',['ls-tree','-r','--name-only',commit,'src'],{encoding:'utf8'}).trim().split('\n')
  .filter(name=>/\.(ts|tsx|js|mjs|cjs|json)$/.test(name));
sourceFiles.push('package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs');sourceFiles.sort();
const actual=new Map(inventory.files);assert.equal(actual.size,sourceFiles.length,'Runtime source inventory differs from fixed Git source');
const batch=run('git',['cat-file','--batch'],{input:sourceFiles.map(name=>`${commit}:${name}\n`).join('')});
const temporaryRoot=resolve('tmp');await mkdir(temporaryRoot,{recursive:true});
const reference=await mkdtemp(join(temporaryRoot,'ma24-web-source-audit-'));
assert(resolve(reference).startsWith(temporaryRoot+sep));
let offset=0,exportEolDifferences=0;
try{
  const archive=join(reference,'source.tar');
  run('git',['archive','--format=tar','--output',archive,commit,'src','package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs']);
  run('tar',['-xf',archive,'-C',reference]);
  for(const name of sourceFiles){
    const end=batch.indexOf(10,offset);assert(end>=offset);
    const header=batch.subarray(offset,end).toString('utf8').split(' ');assert.equal(header[1],'blob');
    const size=Number(header[2]);assert(Number.isSafeInteger(size)&&size>=0);
    const start=end+1,bytes=batch.subarray(start,start+size);assert.equal(bytes.length,size);
    const exported=await readFile(join(reference,name));
    assert.equal(createHash('sha256').update(exported).digest('hex'),actual.get(name),`Runtime source differs from fixed Git export: ${name}`);
    if(!exported.equals(bytes)){
      assert.equal(exported.toString('utf8').replaceAll('\r\n','\n'),bytes.toString('utf8').replaceAll('\r\n','\n'),`Export changes more than EOL: ${name}`);
      exportEolDifferences++;
    }
    assert.equal(batch[start+size],10);offset=start+size+1;
  }
}finally{
  assert(resolve(reference).startsWith(temporaryRoot+sep));await rm(reference,{recursive:true,force:true});
}
assert.equal(offset,batch.length);assert(inventory.buildId);
const manifest=[...actual].sort(([a],[b])=>a.localeCompare(b,'en'));
console.log(JSON.stringify({webImageSourceVerification:'passed',image:tag,imageId:metadata.Id,sourceCommit:commit,
  buildId:inventory.buildId,runtimeSourceFileCount:actual.size,runtimeSourceMatchesFixedGitExport:true,exportEolDifferences,
  runtimeSourceManifestHash:createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  privateEnvironmentFiles:inventory.privateEnvironmentFiles,privateStorageFiles:inventory.privateStorageFiles,
  staticAssetsPresent:inventory.staticAssetsPresent,nonRootReadOnlyNoNetwork:true,productionQualified:false}));
