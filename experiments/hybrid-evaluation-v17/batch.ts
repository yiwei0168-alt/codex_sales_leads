import './trace-off';
import {readFile} from 'node:fs/promises';
import {execute} from './performance-run';
import {local} from './runtime';
import {runControlledBatch,fileStopRequested} from '../hybrid-evaluation-controls/controlled-batch.mjs';
const command=process.argv[2],ids=["P01","P07","P08","P19","P20","P24"];
try{
 if(command==='freeze')await execute('freeze');
 else if(command==='smoke'||command==='repeats'){
  if(command==='repeats'){
   const gate=JSON.parse(await readFile('experiments/hybrid-evaluation-quality-v17/results/smoke-gate.json','utf8'));
   if(gate.qualityPassed!==true||gate.submitted!==18||gate.rows.some((r:{billingComplete:boolean})=>!r.billingComplete))throw Error('First-repeat smoke quality gate is not passed');
  }
  const schedule=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/paired-schedule.json','utf8')) as Array<{taskId:string;repetition:number;armOrder:string[]}>;
  const blocks=schedule.filter(b=>ids.includes(b.taskId)&&(command==='smoke'?b.repetition===1:b.repetition>1));
  if(blocks.length!==(command==='smoke'?6:12))throw Error('Schedule mismatch');
  const keys=blocks.flatMap(b=>b.armOrder.map(arm=>`${b.taskId}-${arm}-${b.repetition}`));
  await runControlledBatch(keys,{maximumConsecutiveTransportFailures:2,stopRequested:()=>fileStopRequested(`${local}/STOP`),
   readSaved:async(key:string)=>{
    try{const observation=JSON.parse(await readFile(`${local}/performance/${key}.observation.json`,'utf8'));
     return {observation,trace:JSON.parse(await readFile(`${local}/performance/${key}.trace.json`,'utf8'))};}
    catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;return null;}
   },
   submit:async(key:string)=>{const [task,arm,repeat]=key.split('-');console.log(JSON.stringify({starting:key}));
    await execute('run',task,arm,Number(repeat));
    return {trace:JSON.parse(await readFile(`${local}/performance/${key}.trace.json`,'utf8'))};}
  });
 }else throw Error('Use freeze, smoke or repeats');
}finally{const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
