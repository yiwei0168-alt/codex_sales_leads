import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {digest} from '../src/lib/assistant/main/contracts';
import {modeModelConfig} from '../src/lib/assistant/main/mode-config';
import {initialTaskMessages} from '../src/lib/assistant/main/initial-task-messages';
import {decisionMemoryMessage} from '../src/lib/assistant/main/decision-memory-message';
import {buildSkillSafetyCandidate} from '../src/lib/assistant/main/skill-safety-candidate';
import {runSkillCandidateArm} from '../src/lib/assistant/main/skill-candidate-runner';
import {localReplayModel} from '../src/lib/assistant/main/skill-replay-local';
import {skillSafetySuite} from '../src/lib/assistant/main/skill-safety-suite';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

disableLocalAnalysisTracing();
const caseId=process.argv[2];
if(!['safety-ambiguous','safety-source-injection'].includes(caseId))throw new Error('Only the two exposed G06 failures are diagnostic inputs');
const owner='11111111-1111-4111-8111-111111111111';
const skillId='22222222-2222-4222-8222-222222222222';
const config=modeModelConfig('standard');
const context={userId:owner,role:'member' as const,mode:'standard' as const};
const initial=initialTaskMessages(context,{content:'Original task excluded from synthetic safety snapshot.',attachments:[]},config,[]);
const files={'SKILL.md':'Use original sources and respect account boundaries.'};
const listing={id:skillId,name:'Safety candidate',scope:'account',current_version:1,enabled:false,published:false,owned:true};
const source={sourceHash:digest('diagnostic-source'),skillSourceHash:digest('diagnostic-skill'),taskInputHash:digest('diagnostic-task'),modelConfigHash:digest(config),
 snapshot:{context,profile:config.profile!,initialMessages:[initial[0],decisionMemoryMessage([]),...initial.slice(1)],skills:[listing],
  candidate:{listing,value:{skill_id:skillId,version:1,files,content_hash:digest(files),dependencies:[],owner_id:owner,scope:'account'}},receipts:[]}};
const prepared=buildSkillSafetyCandidate(source,caseId);
const directory=path.resolve('tmp','ma24-g06-current-protocol',randomUUID());
await mkdir(directory,{recursive:true});
const codeHashes=Object.fromEntries(await Promise.all([
 'src/lib/assistant/main/graph.ts','src/lib/assistant/main/product.ts','src/lib/assistant/main/skill-candidate-runner.ts',
 'src/lib/assistant/main/skill-safety-candidate.ts','src/lib/assistant/main/skill-safety-suite.ts',
 'scripts/diagnose-ma24-g06-local.ts',
].map(async file=>[file,digest(await readFile(file,'utf8'))])));
await writeFile(path.join(directory,'manifest.json'),JSON.stringify({caseId,arm:'candidate',sourceHash:prepared.sourceHash,
 inputHash:prepared.inputHash,profile:prepared.snapshot.profile,codeHashes,maximumModelCalls:8,model:'qwen3:8b',
 diagnosticOnly:true,productionAgentEquivalent:false,qualityAccepted:false,cloudCalls:0},null,2),{flag:'wx'});
const local=await localReplayModel(process.env.OLLAMA_LOCAL_URL||'http://127.0.0.1:11434',skillSafetySuite().suite.model.digest);
let calls=0;
try{
 const result=await runSkillCandidateArm(prepared.snapshot,'candidate',async ({messages})=>{calls++;console.log(JSON.stringify({caseId,call:calls,status:'started'}));
  const answer=await local.generateAgent(messages);console.log(JSON.stringify({caseId,call:calls,status:'returned'}));return answer;
 },async()=>{},8);
 await writeFile(path.join(directory,'result.json'),JSON.stringify(result,null,2),{flag:'wx'});
 console.log(JSON.stringify({directory,caseId,calls,status:result.status,stopReason:result.stopReason,traceLength:result.trace.length,
  candidateSkillUsed:result.candidateSkillUsed,businessToolExecutions:result.businessToolExecutions}));
}finally{await local.close();}
