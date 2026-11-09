import './trace-off';
import {readFile} from 'node:fs/promises';
import {execute} from './performance-run';
import {local} from './runtime';
const command=process.argv[2];
try{
 if(command==='freeze')await execute('freeze');
 else if(command==='run'){
  const schedule=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/paired-schedule.json','utf8')) as Array<{taskId:string;repetition:number;armOrder:string[]}>;
  const blocks=schedule.filter(b=>['P02','P10','P24'].includes(b.taskId)&&b.repetition===1);
  if(blocks.length!==3)throw Error('Schedule mismatch');
  for(const block of blocks)for(const arm of block.armOrder){
   const key=`${block.taskId}-${arm}-1`;
   let saved;
   try{saved=JSON.parse(await readFile(`${local}/performance/${key}.observation.json`,'utf8'));}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(saved){console.log(JSON.stringify({saved:key,status:saved.status,retried:false}));continue;}
   console.log(JSON.stringify({starting:key}));
   await execute('run',block.taskId,arm,1);
  }
 }else throw Error('Use freeze or run');
}finally{const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
