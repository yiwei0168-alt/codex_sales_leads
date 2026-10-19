import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

const [web,collector]=process.argv.slice(2);
assert(process.argv.length===4&&[web,collector].every(value=>value&&/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/.test(value)),'Expected Web and collector images');
// Mirrors the source/config fingerprint algorithm; this remains a local package
// equivalence check, not an external attestation or a provider quality judgment.
const inspect=String.raw`
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>JSON.stringify(k)+':'+canonical(x)).join(',')+'}';return JSON.stringify(v)??'null';}
const sha=v=>crypto.createHash('sha256').update(v).digest('hex'),digest=v=>sha(canonical(v)),root='/app/.skill-runtime-source',files=[];
function walk(dir){for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){if(entry.isSymbolicLink())throw Error('Source link');const p=path.posix.join(dir,entry.name);if(entry.isDirectory())walk(p);else if(/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name))files.push(p);}}
walk('src');files.push('package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs');files.sort();
const hashes={};for(const p of files)hashes[p]=digest(fs.readFileSync(path.join(root,p),'utf8'));
const packages={},unresolved=[],lock=JSON.parse(fs.readFileSync(root+'/package-lock.json','utf8'));
for(const name of ['pg','zod','@langchain/langgraph','@langchain/core','langsmith','undici']){
 let resolved;try{resolved=require.resolve(name,{paths:['/app']});}catch{unresolved.push(name);continue;}
 let directory=path.dirname(resolved);
 for(;;){const manifest=path.join(directory,'package.json');if(fs.existsSync(manifest)){const p=JSON.parse(fs.readFileSync(manifest,'utf8'));if(p.name===name){packages[name]=p.version;break;}}
  const parent=path.dirname(directory);if(parent===directory)throw Error('Missing package manifest');directory=parent;}
 if(packages[name]!==lock.packages['node_modules/'+name]?.version)throw Error('Installed dependency differs from lockfile');
}
console.log(JSON.stringify({runtimeHash:digest({protocol:'skill-local-source-runtime-v1',node:process.versions.node,platform:process.platform,arch:process.arch,files:hashes}),
 sourceInputs:files.length,node:process.versions.node,platform:process.platform,arch:process.arch,nodeSha256:sha(fs.readFileSync(process.execPath)),packages,unresolved}));`;
// Resolve mutable tags once. All subsequent execution uses immutable image IDs.
const metadata=image=>{
 const output=execFileSync('docker',['image','inspect','--format','{"id":{{json .Id}},"revision":{{with index .Config "Labels"}}{{json (index . "org.opencontainers.image.revision")}}{{else}}null{{end}}}',image],{encoding:'utf8'}).trim();
 const {id,revision}=JSON.parse(output);
 assert(typeof id==='string'&&/^sha256:[a-f0-9]{64}$/.test(id)&&typeof revision==='string'&&/^[a-f0-9]{40}$/.test(revision),'Runtime pair requires immutable image IDs and fixed revision labels');
 return {id,revision};
};
const webImage=metadata(web),collectorImage=metadata(collector);
assert.equal(webImage.revision,collectorImage.revision,'Web and collector build revisions differ');
const read=image=>JSON.parse(execFileSync('docker',['run','--rm','--network','none','--read-only','--cap-drop=ALL','--entrypoint','node',image.id,'-e',inspect],{encoding:'utf8',maxBuffer:2*1024*1024}));
const actualWeb=read(webImage),actualCollector=read(collectorImage);
const {packages:webPackages,unresolved:webUnresolved,...webIdentity}=actualWeb;
const {packages:collectorPackages,unresolved:collectorUnresolved,...collectorIdentity}=actualCollector;
assert.deepEqual(webIdentity,collectorIdentity,'Web and collector source/Node identity differs');
for(const [name,version] of Object.entries(webPackages))if(collectorPackages[name])assert.equal(collectorPackages[name],version,'External package versions differ');
console.log(JSON.stringify({skillSourceRuntimePair:'passed',web,collector,sourceCommit:webImage.revision,webImageId:webImage.id,collectorImageId:collectorImage.id,
 inspectionUsesImmutableImageIds:true,...webIdentity,webPackages,collectorPackages,webUnresolved,collectorUnresolved,
 completeDependencyRuntimeEquivalenceVerified:false,productionQualified:false,actualModelCalls:0}));
