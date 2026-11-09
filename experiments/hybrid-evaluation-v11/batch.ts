import './trace-off';
import {readFile} from 'node:fs/promises';
import {execute} from './performance-run';
import {local} from './runtime';
const command=process.argv[2],ids=["P01","P07","P08","P19","P20","P24"];
try{
 if(command==='freeze')await execute('freeze');
 else if(command==='smoke'||command==='repeats'){
  if(command==='repeats'){
   const gate=JSON.parse(await readFile('experiments/hybrid-evaluation-quality-v11/results/smoke-gate.json','utf8'));
   if(gate.qualityPassed!==true||gate.submitted!==18)throw Error('First-repeat smoke quality gate is not passed');
  }
  const schedule=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/paired-schedule.json','utf8')) as Array<{taskId:string;repetition:number;armOrder:string[]}>;
  const blocks=schedule.filter(b=>ids.includes(b.taskId)&&(command==='smoke'?b.repetition===1:b.repetition>1));
  if(blocks.length!==(command==='smoke'?6:12))throw Error('Schedule mismatch');
  for(const block of blocks)for(const arm of block.armOrder){
   const key=`${block.taskId}-${arm}-${block.repetition}`;
   let saved;
   try{saved=JSON.parse(await readFile(`${local}/performance/${key}.observation.json`,'utf8'));}
   catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
   if(saved){console.log(JSON.stringify({saved:key,status:saved.status,retried:false}));continue;}
   console.log(JSON.stringify({starting:key}));await execute('run',block.taskId,arm,block.repetition);
  }
 }else throw Error('Use freeze, smoke or repeats');
}finally{const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
