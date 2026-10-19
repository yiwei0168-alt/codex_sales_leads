import {open,readFile,realpath,stat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertResolvedInsideKnowledgeRoot,safeKnowledgeStorageKey} from './document-repository';

/** Bind to the descriptor's mount ID, not a path-prefix guess. A read-only bind
 * mount may have a writable superblock; only its per-mount options apply here.
 * This does not prove the backing filesystem has no other writable aliases. */
export function descriptorHasReadOnlyMount(mountInfo:string,fdInfo:string):boolean{
  if(mountInfo.length>8_000_000||fdInfo.length>64_000)return false;
  const ids=[...fdInfo.matchAll(/^mnt_id:[ \t]*(\d+)[ \t]*$/gm)].map(row=>row[1]);
  if(ids.length!==1)return false;
  const records=mountInfo.split('\n').filter(Boolean).map(line=>line.trim().split(/\s+/));
  if(records.some(fields=>fields.indexOf('-')<6||fields.length!==fields.indexOf('-')+4))return false;
  const matches=records.filter(fields=>fields[0]===ids[0]);
  if(matches.length!==1)return false;
  const fields=matches[0],separator=fields.indexOf('-');
  if(separator<6||fields.length!==separator+4||!/^\d+$/.test(fields[1])||!/^\d+:\d+$/.test(fields[2]))return false;
  const options=fields[5].split(',');
  return options.includes('ro')&&!options.includes('rw');
}

/** Process-local Linux mount evidence only, never an immutable-storage or
 * activation grant. Unsupported platforms and unreadable/malformed proc fail closed. */
export async function knowledgeAssetHasReadOnlyMount(key:string):Promise<boolean>{
  if(process.platform!=='linux')return false;
  try{
    const requested=resolve(safeKnowledgeStorageKey(key)),path=await realpath(requested);
    assertResolvedInsideKnowledgeRoot(path);
    const file=await open(path,'r');
    try{
      const before=await file.stat();if(!before.isFile())return false;
      const [mounts,fd]=await Promise.all([readFile('/proc/self/mountinfo','utf8'),readFile(`/proc/self/fdinfo/${file.fd}`,'utf8')]);
      const currentPath=await realpath(requested);assertResolvedInsideKnowledgeRoot(currentPath);
      const current=await stat(currentPath);
      return path===currentPath&&current.dev===before.dev&&current.ino===before.ino
        &&current.size===before.size&&current.mtimeMs===before.mtimeMs&&current.ctimeMs===before.ctimeMs
        &&descriptorHasReadOnlyMount(mounts,fd);
    }finally{await file.close();}
  }catch{return false;}
}
