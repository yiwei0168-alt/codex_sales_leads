import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {disableLocalAnalysisTracing} from '../src/lib/assistant/main/local-analysis-boundary';

async function main(){
 const args=process.argv.slice(2);
 if(args.length===1&&args[0]==='--help'){
  console.log('node runner.mjs --check|--execute|--attest <private-job.json>');return;
 }
 if(args.length!==2||!['--check','--execute','--attest'].includes(args[0]))throw new Error('Expected --check, --execute or --attest and one private job file');
 if(process.env.NODE_ENV!=='production'||process.execArgv.length||process.env.NODE_OPTIONS?.trim())throw new Error('Plain production Node process required');
 disableLocalAnalysisTracing();
 const bytes=await readFile(args[1]);if(bytes.length>16000)throw new Error('Collector job too large');
 if(args[0]==='--attest'){
  const job=z.object({ownerId:z.uuid(),bundleId:z.uuid()}).strict().parse(JSON.parse(bytes.toString('utf8')));
  const [{getPool},{createConfiguredSkillCollectorConnection},{appendConfiguredSkillRunnerAttestation}]=await Promise.all([
   import('../src/lib/rag/db'),import('../src/lib/assistant/main/skill-collector-connection'),import('../src/lib/assistant/main/skill-runner-attestation-store')]);
  const collector=createConfiguredSkillCollectorConnection();
  try{
   const out=await appendConfiguredSkillRunnerAttestation({userId:job.ownerId},{bundleId:job.bundleId},collector.transaction);
   console.log(JSON.stringify({collectorDeclaration:'completed',declarationId:out.id,statementHash:out.statementHash,reused:out.reused,
    automaticActivation:false,productionQualified:false}));
  }finally{await collector.close();await getPool().end();}
  return;
 }
 const common={ownerId:z.uuid(),freezeId:z.uuid(),evaluationId:z.uuid(),caseId:z.string().min(1).max(120),maximumModelCalls:z.number().int().min(1).max(64)};
 const job=z.discriminatedUnion('kind',[
  z.object({...common,kind:z.literal('safety'),runId:z.uuid(),arm:z.enum(['baseline','candidate'])}).strict(),
  z.object({...common,kind:z.literal('historical'),runId:z.uuid()}).strict(),
  z.object({...common,kind:z.literal('prospective'),jobId:z.uuid()}).strict(),
 ]).parse(JSON.parse(bytes.toString('utf8')));
 const [{tenantQuery,getPool},{createConfiguredSkillCollectorConnection},{skillAcceptancePlanSchema},{requireSkillAcceptanceFreeze},{withProductSpend}]=await Promise.all([
  import('../src/lib/rag/db'),import('../src/lib/assistant/main/skill-collector-connection'),import('../src/lib/assistant/main/skill-acceptance-policy'),
  import('../src/lib/assistant/main/skill-acceptance-freeze'),import('../src/lib/billing/context'),
 ]);
 const collector=createConfiguredSkillCollectorConnection();
 try{
  const rows=await tenantQuery<{plan_draft:unknown;frozen_at:Date}>(job.ownerId,
   'select plan_draft,frozen_at from agent_skill_acceptance_freeze where id=$1 and owner_id=$2',[job.freezeId,job.ownerId]);
  if(rows.length!==1)throw new Error('Collector freeze unavailable');
  const draft=z.record(z.string(),z.unknown()).parse(rows[0].plan_draft);
  const plan=skillAcceptancePlanSchema.parse({...draft,frozenAt:rows[0].frozen_at.toISOString()}),frozen={freezeId:job.freezeId,plan};
  await requireSkillAcceptanceFreeze({userId:job.ownerId},job.freezeId,plan);
  await collector.transaction(job.ownerId,async()=>{});
  if(args[0]==='--check'){console.log(JSON.stringify({collectorDatabasePreflight:'passed',modelCalls:0,productionQualified:false}));return;}
  const {ownerId,freezeId:unusedFreeze,...input}=job;void unusedFreeze;
  const output=await withProductSpend(ownerId,'skill-acceptance',async()=>{
   if(input.kind==='safety'){
    const {kind,...selection}=input;void kind;
    const {runConfiguredSkillSafetyArm}=await import('../src/lib/assistant/main/skill-configured-safety-runner');
    return runConfiguredSkillSafetyArm({userId:ownerId},{...selection,skillId:plan.pin.skillId,version:plan.pin.version},frozen,collector.transaction);
   }
   const {runConfiguredSkillRecordedCandidate}=await import('../src/lib/assistant/main/skill-configured-recorded-runner');
   return runConfiguredSkillRecordedCandidate({userId:ownerId},input,frozen,collector.transaction);
  },job.evaluationId);
  // Do not print private responses, messages, source material or credentials.
  console.log(JSON.stringify({collectorExecution:'completed',evaluationId:job.evaluationId,
   transportVerificationHash:output.transportVerificationHash,automaticActivation:false,productionQualified:false}));
 }finally{await collector.close();await getPool().end();}
}
main().catch(()=>{console.error('Skill collector failed; inspect restricted server records and reconcile before retrying.');process.exitCode=1;});
