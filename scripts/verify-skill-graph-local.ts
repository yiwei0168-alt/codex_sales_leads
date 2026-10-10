import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {digest} from '../src/lib/assistant/main/contracts';
import {runGraphSkillReplay} from '../src/lib/assistant/main/skill-graph-replay';
import {localReplayModel} from '../src/lib/assistant/main/skill-replay-local';

const id='00000000-0000-4000-8000-000000000001',files={'SKILL.md':'Compare the two original interface tables and preserve their source pages.'};
const model={name:'qwen3:8b',digest:'500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41'};
const receipt={tool:'knowledge_compare',arguments:{entities:['Synthetic A','Synthetic B'],attributes:['ports']},
  result:{status:'success',data:{text:'Synthetic A has 2 RJ45 ports (fixture page 3). Synthetic B has 3 RJ45 ports (fixture page 4).'}}};
const suite={id:'synthetic-main-graph-contract',ownerId:id,skill:{id,version:1,files,contentHash:digest(files),sourceHash:digest('synthetic')},model,
  cases:[{id:'synthetic-compare',category:'replay',provenance:'synthetic',question:'Compare the RJ45 port counts of Synthetic A and Synthetic B; read the provided original evidence and cite its pages.',receipts:[{...receipt,sha256:digest(receipt)}]}]};
const directory=path.resolve('tmp','skill-replay',randomUUID());await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,'suite.json'),JSON.stringify(suite,null,2),{flag:'wx'});
console.log(JSON.stringify({output:directory,maximumLocalModelCalls:16,realToolExecutions:0}));
const local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',model.digest);
try{
  let calls=0;
  const output=await runGraphSkillReplay(suite,async messages=>{
    const call=++calls;console.log(JSON.stringify({call,status:'started'}));
    try{const reply=await local.generateAgent(messages);console.log(JSON.stringify({call,status:'returned'}));return reply;}
    catch(error){console.log(JSON.stringify({call,status:'failed'}));throw error;}
  },async()=>{});
  const protocolContractPassed=output.pairs.every(p=>[p.baseline,p.candidate].every(arm=>arm.status==='completed'
    &&arm.calls.some(call=>Boolean(call.receiptHash))));
  await writeFile(path.join(directory,'result.json'),JSON.stringify({...output,protocolContractPassed},null,2),{flag:'wx'});
  console.log(JSON.stringify(output.pairs.map(p=>({baseline:{status:p.baseline.status,calls:p.baseline.modelCalls,stop:p.baseline.stopReason},
    candidate:{status:p.candidate.status,calls:p.candidate.modelCalls,stop:p.candidate.stopReason},review:p.review}))));
  if(!protocolContractPassed)process.exitCode=1;
}finally{await local.close();}
