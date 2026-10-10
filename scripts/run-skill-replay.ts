import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {runSkillReplay,skillReplaySuiteSchema,SKILL_REPLAY_PROTOCOL,SKILL_REPLAY_PROMPT,SKILL_REPLAY_CONFIG} from '../src/lib/assistant/main/skill-replay';
import {localReplayModel} from '../src/lib/assistant/main/skill-replay-local';
import {digest} from '../src/lib/assistant/main/contracts';

const inputPath=process.argv[2];if(!inputPath)throw new Error('Usage: run-skill-replay.ts <local-suite.json>');
const text=await readFile(inputPath,'utf8');if(text.length>6000000)throw new Error('Suite too large');
const suite=skillReplaySuiteSchema.parse(JSON.parse(text));
if(suite.cases.some(item=>item.provenance!=='synthetic'))throw new Error('Historical/live snapshots require an authenticated exporter; this CLI currently accepts synthetic development cases only');
const directory=path.resolve('tmp','skill-replay',randomUUID());await mkdir(directory,{recursive:true});
const codeHashes=Object.fromEntries(await Promise.all(['scripts/run-skill-replay.ts','src/lib/assistant/main/skill-replay.ts','src/lib/assistant/main/skill-replay-local.ts'].map(async file=>[file,digest(await readFile(file,'utf8'))])));
await writeFile(path.join(directory,'manifest.json'),JSON.stringify({protocol:SKILL_REPLAY_PROTOCOL,suiteHash:digest(suite),promptHash:digest(SKILL_REPLAY_PROMPT),configHash:digest(SKILL_REPLAY_CONFIG),config:SKILL_REPLAY_CONFIG,codeHashes,suite,
  acceptance:'pending',autoEnable:false,maximumModelCalls:suite.cases.length*8,outputTokensPerCall:1024},null,2),{flag:'wx'});
console.log(JSON.stringify({output:directory,cases:suite.cases.length,model:'local-qwen3:8b',maximumModelCalls:suite.cases.length*8}));
const local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',suite.model.digest);
try{
  let completed=0;
  const result=await runSkillReplay(suite,local.generate,async pair=>{
    await writeFile(path.join(directory,`${String(++completed).padStart(3,'0')}.json`),JSON.stringify(pair,null,2),{flag:'wx'});
    console.log(JSON.stringify({completed,total:suite.cases.length,baseline:pair.baseline.status,candidate:pair.candidate.status,review:'pending'}));
  });
  await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
}finally{await local.close();}
