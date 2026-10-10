import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {runHistoricalSkillReplay,historicalSkillReplayInput} from '../src/lib/assistant/main/skill-replay-snapshot';
import {SKILL_REPLAY_PROTOCOL,SKILL_REPLAY_PROMPT,SKILL_REPLAY_CONFIG} from '../src/lib/assistant/main/skill-replay';
import {digest} from '../src/lib/assistant/main/contracts';
import {getPool} from '../src/lib/rag/db';

// Operator-only local command; never exposed as an Agent tool or unauthenticated HTTP endpoint.
const [owner,skillId,version,...runIds]=process.argv.slice(2);
const userId=z.uuid().parse(owner),input=historicalSkillReplayInput.parse({skillId,version:Number(version),runIds});
const directory=path.resolve('tmp','skill-replay',randomUUID());await mkdir(directory,{recursive:true});
let completed=0;
try{
  const result=await runHistoricalSkillReplay({userId},input,async snapshot=>{
    const codeFiles=['scripts/run-historical-skill-replay.ts','src/lib/assistant/main/skill-replay.ts','src/lib/assistant/main/skill-replay-local.ts','src/lib/assistant/main/skill-replay-snapshot.ts','src/lib/assistant/main/knowledge-message-guard.ts'];
    const codeHashes=Object.fromEntries(await Promise.all(codeFiles.map(async file=>[file,digest(await readFile(file,'utf8'))])));
    await writeFile(path.join(directory,'manifest.json'),JSON.stringify({...snapshot,protocol:SKILL_REPLAY_PROTOCOL,
      promptHash:digest(SKILL_REPLAY_PROMPT),configHash:digest(SKILL_REPLAY_CONFIG),config:SKILL_REPLAY_CONFIG,codeHashes,
      autoEnable:false,acceptance:'pending',maximumModelCalls:input.runIds.length*8},null,2),{flag:'wx'});
    console.log(JSON.stringify({output:directory,cases:input.runIds.length,model:'local-qwen3:8b'}));
  },async pair=>{
    await writeFile(path.join(directory,`${String(++completed).padStart(3,'0')}.json`),JSON.stringify(pair,null,2),{flag:'wx'});
    console.log(JSON.stringify({completed,total:input.runIds.length,review:'pending'}));
  });
  await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
}catch{
  await writeFile(path.join(directory,'interrupted.json'),JSON.stringify({status:'interrupted',completed,
    reason:'Snapshot validation, local model or persistence failed; partial pairs are not acceptance',autoEnable:false}),{flag:'wx'});
  console.error('Historical replay interrupted; partial results retained locally.');process.exitCode=1;
}finally{await getPool().end();}
