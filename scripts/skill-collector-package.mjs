import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,readlink,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';

export async function collectorPackageInventory(root){
 const files={},base=await realpath(root);
 const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
 async function walk(directory){
  for(const name of (await readdir(join(root,directory))).sort()){
   const path=directory?`${directory}/${name}`:name;if(path==='runtime-manifest.json')continue;
   const absolute=join(root,path),stat=await lstat(absolute);
   if(stat.isSymbolicLink()){
    const target=relative(base,await realpath(absolute));
    if(target==='..'||target.startsWith('../')||target.startsWith('..\\')||isAbsolute(target))throw new Error('Collector package link escapes root');
    files[path]={link:await readlink(absolute)};
   }else if(stat.isDirectory())await walk(path);
   else if(stat.isFile())files[path]={sha256:hash(await readFile(absolute))};
   else throw new Error('Unsupported collector package file');
  }
 }
 await walk('');
 return {protocol:'skill-collector-package-v1',nodeSha256:hash(await readFile(process.execPath)),files};
}
