import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,readFile,symlink,rmdir,unlink,rm} from 'node:fs/promises';
import {dirname,join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const [mode,...extra]=process.argv.slice(2);
assert(extra.length===0&&['--memory-source-locks','--method-catalog-locks','--transport-journal','--prospective-composition','--locked-policy'].includes(mode),
 'Choose exactly one supported disposable database check');
const commit=execFileSync('git',['rev-parse','--verify','HEAD^{commit}'],{cwd:root,encoding:'utf8'}).trim();
assert(/^[a-f0-9]{40}$/.test(commit));
const temporaryRoot=join(root,'tmp');await mkdir(temporaryRoot,{recursive:true});
const snapshot=await mkdtemp(join(temporaryRoot,'ma24-snapshot-'));
assert(resolve(snapshot).startsWith(resolve(temporaryRoot)+sep));
let linked=false;
try{
 const archive=join(snapshot,'source.tar');
 execFileSync('git',['archive','--format=tar','--output',archive,commit],{cwd:root,windowsHide:true});
 execFileSync('tar',['-xf',archive,'-C',snapshot],{cwd:root,windowsHide:true});
 await unlink(archive);
 assert((await readFile(join(snapshot,'package-lock.json'))).equals(await readFile(join(root,'package-lock.json'))),
  'Current dependency lock differs from committed snapshot');
 await symlink(join(root,'node_modules'),join(snapshot,'node_modules'),process.platform==='win32'?'junction':'dir');linked=true;
 console.log(JSON.stringify({snapshotCheck:'started',commit,mode,source:'git archive',dependencies:'shared installed node_modules; not deployment attestation'}));
 const code=await new Promise((accept,reject)=>{
  const child=spawn(process.execPath,['--import','tsx','scripts/verify-ma24-fresh-pilot-new-cluster.ts',mode],
   {cwd:snapshot,env:process.env,windowsHide:true,stdio:'inherit'});
  child.once('error',reject);child.once('exit',(status,signal)=>accept(signal?1:status??1));
 });
 process.exitCode=code;
 console.log(JSON.stringify({snapshotCheck:code===0?'passed':'failed',commit,mode}));
}finally{
 // Remove the dependency link itself before recursively removing the checked path.
 if(linked){if(process.platform==='win32')await rmdir(join(snapshot,'node_modules'));else await unlink(join(snapshot,'node_modules'));}
 assert(resolve(snapshot).startsWith(resolve(temporaryRoot)+sep));
 await rm(snapshot,{recursive:true,force:true});
}
