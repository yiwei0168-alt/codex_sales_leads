import {readFile,writeFile} from 'node:fs/promises';
export type Receipt={identity:string;status:'started'|'completed'|'failed-or-unknown';latencyMs?:number;response?:unknown};
/** Exclusive pre-call receipt prevents retries even after timeout or a process crash. */
export async function once(path:string,identity:string,invoke:()=>Promise<unknown>):Promise<Receipt>{
  let saved:Receipt|undefined;
  try{saved=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(saved){if(saved.identity!==identity)throw Error('Receipt identity drift');return saved;}
  await writeFile(path,JSON.stringify({identity,status:'started'}),{flag:'wx'});
  const started=Date.now();
  let result:Receipt;
  try{result={identity,status:'completed',latencyMs:Date.now()-started,response:await invoke()};
    result.latencyMs=Date.now()-started;
  }catch{result={identity,status:'failed-or-unknown',latencyMs:Date.now()-started};}
  await writeFile(path,JSON.stringify(result,null,2)+'\n');
  return result;
}
