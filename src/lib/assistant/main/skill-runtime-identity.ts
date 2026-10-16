import {join} from 'node:path';
import {lstat,readdir,readFile} from 'node:fs/promises';
import {digest} from './contracts';
import {modelFunctions} from './model';
import {loadRecordedTaskChain} from './recorded-task-source';
import {assertLocalAnalysisBoundary} from './local-analysis-boundary';

/** Local source/config fingerprint, not attestation of a deployed binary or provider. */
export async function skillSourceRuntimeHash(){
 let root='.';
 try{
  const packed=await lstat('.skill-runtime-source');
  if(!packed.isDirectory()||packed.isSymbolicLink())throw new Error('Skill runtime source package must be a directory');
  root='.skill-runtime-source';
 }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 const files:string[]=[];
 async function walk(directory:string){
  const info=await lstat(join(/*turbopackIgnore: true*/ root,directory));
  if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Skill runtime source links are not allowed');
  for(const entry of await readdir(join(/*turbopackIgnore: true*/ root,directory),{withFileTypes:true})){
   if(entry.isSymbolicLink())throw new Error('Skill runtime source links are not allowed');
   const path=join(directory,entry.name);
   if(entry.isDirectory())await walk(path);
   else if(/\.(?:ts|tsx|js|mjs|cjs|json)$/.test(entry.name))files.push(path.replaceAll('\\','/'));
  }
 }
 await walk('src');
 files.push('package.json','package-lock.json','tsconfig.json','scripts/patch-node-user.cjs');files.sort();
 const hashes:Record<string,string>={};
 for(let i=0;i<files.length;i+=32)for(const [path,hash] of await Promise.all(files.slice(i,i+32).map(async path=>[path,digest(await readFile(join(/*turbopackIgnore: true*/ root,path),'utf8'))])))hashes[path]=hash;
 return digest({protocol:'skill-local-source-runtime-v1',node:process.versions.node,platform:process.platform,arch:process.arch,files:hashes});
}
export async function prepareSkillExecutionIdentity(context:{userId:string},input:{runId:string}){
 assertLocalAnalysisBoundary();const chain=await loadRecordedTaskChain(context,input),first=chain.requests[0];
 if(!first)throw new Error('Skill identity original request unavailable');
 return {runtimeHash:await skillSourceRuntimeHash(),
  promptHash:digest(first.body.messages.filter((row,index)=>row.role==='system'&&index!==1)),
  toolSchemaHash:digest(modelFunctions),modelConfigHash:chain.modelConfigHash,
  scopeHash:digest({userId:context.userId,role:first.accountRole,mode:first.profile.mode,knowledgeScope:first.knowledgeScope??null})};
}
