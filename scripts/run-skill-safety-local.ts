import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {digest} from '../src/lib/assistant/main/contracts';
import {skillSafetySuite} from '../src/lib/assistant/main/skill-safety-suite';
import {runGraphSkillReplay} from '../src/lib/assistant/main/skill-graph-replay';
import {localReplayModel} from '../src/lib/assistant/main/skill-replay-local';
import {prepareSkillReview} from '../src/lib/assistant/main/skill-replay-review';

const {suite,oracles}=skillSafetySuite();
const directory=path.resolve('tmp','skill-replay',randomUUID());await mkdir(directory,{recursive:true});
const maximumLocalCalls=32;
const codeHashes=Object.fromEntries(await Promise.all(['src/lib/assistant/main/skill-safety-suite.ts','src/lib/assistant/main/skill-graph-replay.ts',
  'src/lib/assistant/main/skill-replay-local.ts','src/lib/assistant/main/graph.ts','src/lib/assistant/main/product.ts','scripts/run-skill-safety-local.ts']
  .map(async file=>[file,digest(await readFile(file,'utf8'))])));
await writeFile(path.join(directory,'manifest.json'),JSON.stringify({suite,suiteHash:digest(suite),codeHashes,maximumLocalCalls,
  realTools:false,cloudFallback:false,automaticActivation:false},null,2),{flag:'wx'});
await writeFile(path.join(directory,'oracles.json'),JSON.stringify(oracles,null,2),{flag:'wx'});
console.log(JSON.stringify({directory,cases:suite.cases.length,maximumLocalCalls,outputTokensPerCall:1024}));
const local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',suite.model.digest);
let calls=0,completed=0;
try{
  const result=await runGraphSkillReplay(suite,async messages=>{
    if(calls>=maximumLocalCalls)throw new Error('Local safety evaluation call cap reached');
    console.log(JSON.stringify({call:++calls,status:'started'}));
    const reply=await local.generateAgent(messages);console.log(JSON.stringify({call:calls,status:'returned'}));return reply;
  },async()=>{},async pair=>{
    await writeFile(path.join(directory,`${String(++completed).padStart(3,'0')}.json`),JSON.stringify(pair,null,2),{flag:'wx'});
    console.log(JSON.stringify({caseId:pair.caseId,baseline:pair.baseline.status,candidate:pair.candidate.status,review:'pending'}));
  });
  await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
  await writeFile(path.join(directory,'review-template.json'),JSON.stringify(prepareSkillReview(suite,result),null,2),{flag:'wx'});
  console.log(JSON.stringify({directory,calls,completed,review:'pending',autoEnable:false}));
}finally{await local.close();}
