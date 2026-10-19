import {createHash} from 'node:crypto';
import {lstat,readdir,readFile,readlink,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';

/** Process-local execution boundary, not a production/provider attestation. */
export function verifyCollectorRuntimeBoundary({platform,uid,status,mountInfo,root,executable}){
 if(platform!=='linux'||!Number.isInteger(uid)||uid<=0)throw new Error('Non-root Linux collector required');
 const field=name=>{
  const values=status.split('\n').filter(line=>line.startsWith(name+':')).map(line=>line.slice(name.length+1).trim());
  if(values.length!==1)throw new Error('Collector process status unavailable');return values[0];
 };
 const identities=field('Uid').split(/\s+/);
 if(identities.length!==4||identities.some(value=>!/^\d+$/.test(value)||Number(value)!==uid))throw new Error('Collector identities must remain non-root');
 if(field('NoNewPrivs')!=='1')throw new Error('Collector no-new-privileges required');
 for(const name of ['CapInh','CapPrm','CapEff','CapBnd','CapAmb'])if(!/^0+$/.test(field(name)))throw new Error('Collector capabilities must be empty');
 if(!root.startsWith('/')||!executable.startsWith('/'))throw new Error('Collector runtime paths invalid');
 const decode=value=>{
  if(/\\(?!040|011|012|134)/.test(value))throw new Error('Collector mount path invalid');
  return value.replace(/\\(040|011|012|134)/g,(_,octal)=>String.fromCharCode(parseInt(octal,8)));
 };
 const mounts=mountInfo.split('\n').filter(Boolean).map(line=>{
  const fields=line.split(' '),separator=fields.indexOf('-');
  if(separator<6||fields.length!==separator+4)throw new Error('Collector mount record invalid');
  const path=decode(fields[4]),options=fields[5].split(',');
  if(!path.startsWith('/'))throw new Error('Collector mount path invalid');
  return {path,readOnly:options.includes('ro')&&!options.includes('rw')};
 });
 const contains=(parent,path)=>parent==='/'||path===parent||path.startsWith(parent+'/');
 for(const path of ['/',root,executable]){
  const candidates=mounts.filter(mount=>contains(mount.path,path)).sort((a,b)=>b.path.length-a.path.length);
  if(!candidates.length||!candidates[0].readOnly||(candidates[1]?.path===candidates[0].path))throw new Error('Collector package/runtime mount must be read-only');
 }
 if(mounts.some(mount=>contains(root,mount.path)&&!mount.readOnly))throw new Error('Writable collector package submount rejected');
 return {runtimeBoundaryVerified:true,processNonRoot:true,noNewPrivileges:true,capabilitiesEmpty:true,rootReadOnly:true,packageAndNodeReadOnly:true};
}

export async function assertCollectorRuntimeBoundary(root){
 const [status,mountInfo,canonicalRoot,executable]=await Promise.all([
  readFile('/proc/self/status','utf8'),readFile('/proc/self/mountinfo','utf8'),realpath(root),realpath(process.execPath),
 ]);
 return verifyCollectorRuntimeBoundary({platform:process.platform,uid:process.getuid?.(),status,mountInfo,root:canonicalRoot,executable});
}

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
