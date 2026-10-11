import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';
import {resolve,relative,isAbsolute,dirname,sep} from 'node:path';

const root=resolve(process.argv[2]||'.next'),project=process.cwd(),inside=relative(project,root);
assert(inside&&!inside.startsWith('..')&&!isAbsolute(inside),'Build must be inside the project');
let manifests=0;const privateDependencies=new Set();
async function inspect(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=resolve(directory,entry.name);
  if(entry.isDirectory())await inspect(file);
  else if(entry.name.endsWith('.nft.json')){
   manifests++;
   for(const dependency of JSON.parse(await readFile(file,'utf8')).files||[]){
    const absolute=resolve(dirname(file),dependency),path=relative(project,absolute).split(sep).join('/');
    if(/^(knowledge|tmp|temp|backups|\.langgraph_api)\//.test(path)||/^\.env(?:\.|$)/.test(path)||/^experiments\/.*\/artifacts\//.test(path))privateDependencies.add(path);
   }
  }
 }
}
await inspect(root);assert(manifests>0,'No production trace manifests found');
console.log(JSON.stringify({manifests,privateDependencyCount:privateDependencies.size}));
assert.equal(privateDependencies.size,0,'Release traces include local private storage; paths intentionally omitted');
