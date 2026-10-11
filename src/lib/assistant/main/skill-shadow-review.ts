import {z} from 'zod';
import {tenantQuery,tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {prepareSkillShadow} from './skill-shadow';
import {prepareSkillReview,gradeSkillReplay,skillReviewSchema} from './skill-replay-review';
import {appendSkillReviewSchema} from './skill-review-store';

type Context={userId:string};
export const appendShadowReviewSchema=appendSkillReviewSchema.extend({artifactHash:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
export async function listSkillShadowReviews(context:Context,skillId:string,offset:number){
 z.uuid().parse(skillId);z.number().int().min(0).max(100000).parse(offset);
 const rows=await tenantQuery<{id:string;version:number;created_at:string;state:string}>(context.userId,
  `select j.id,c.version,j.created_at::text,j.state from agent_skill_shadow_job j join agent_skill_shadow_campaign c on c.id=j.campaign_id
   where j.owner_id=$1 and c.owner_id=$1 and c.skill_id=$2 and j.state in('completed','failed') and j.result is not null
   order by j.created_at desc,j.id limit 13 offset $3`,[context.userId,skillId,offset]);
 return {items:rows.slice(0,12),hasMore:rows.length>12};
}
async function loadCurrent(context:Context,id:string){
 z.uuid().parse(id);
 const row=(await tenantQuery<{result:{protocol:string;provenance:Awaited<ReturnType<typeof prepareSkillShadow>>;localAnalysis:unknown};server_hash:string;event_hash:string}>(context.userId,
  `select j.result,skill_shadow_json_hash(j.result) as server_hash,
    (select e.payload->>'artifactHash' from agent_skill_shadow_event e where e.owner_id=j.owner_id and e.job_id=j.id
      and e.kind=j.state and e.payload->>'attempt'=j.attempts::text order by e.id desc limit 1) as event_hash
   from agent_skill_shadow_job j where j.id=$1 and j.owner_id=$2 and j.state in('completed','failed') and j.result is not null`,[id,context.userId]))[0];
 if(!row||row.server_hash!==row.event_hash||row.result.protocol!=='prospective-local-shadow-result-v1')throw new Error('Shadow result unavailable');
 const current=await prepareSkillShadow({userId:context.userId,jobId:id});
 if(digest(current)!==digest(row.result.provenance))throw new Error('Shadow evidence changed');
 const template=prepareSkillReview(current.snapshot.suite,row.result.localAnalysis);
 return {artifact:row.result,artifactHash:digest(row.result),current,template};
}
export async function readSkillShadowReview(context:Context,id:string){
 const saved=await loadCurrent(context,id);
 const latest=(await tenantQuery<{revision:number;artifact_hash:string;review:z.infer<typeof skillReviewSchema>;grade:unknown}>(context.userId,
  'select revision,artifact_hash,review,grade from agent_skill_shadow_review where job_id=$1 and owner_id=$2 order by revision desc limit 1',[id,context.userId]))[0];
 if(latest&&latest.artifact_hash!==saved.artifactHash)throw new Error('Shadow review changed');
 return {id,kind:'prospective-local-shadow',artifactHash:saved.artifactHash,snapshot:saved.current.snapshot,result:saved.artifact.localAnalysis,
  observedProductionResult:saved.current.observedProductionResult,revision:latest?.revision??0,
  review:{...saved.template,reviews:saved.template.reviews.map(r=>latest?.review.reviews.find(old=>old.caseId===r.caseId)??r)},
  grade:latest?.grade??null,autoEnable:false,productionAgentEquivalent:false};
}
export async function appendSkillShadowReview(context:Context,input:z.infer<typeof appendShadowReviewSchema>){
 const p=appendShadowReviewSchema.parse(input),saved=await loadCurrent(context,p.id);
 if(p.artifactHash!==saved.artifactHash||p.suiteHash!==saved.template.suiteHash||p.resultHash!==saved.template.resultHash)throw new Error('Stale shadow review');
 return tenantTransaction(context.userId,async client=>{
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`shadow-review:${p.id}`]);
  const latest=(await client.query<{revision:number;review:z.infer<typeof skillReviewSchema>}>('select revision,review from agent_skill_shadow_review where job_id=$1 and owner_id=$2 order by revision desc limit 1',[p.id,context.userId])).rows[0];
  if((latest?.revision??0)!==p.expectedRevision)throw new Error('Review revision changed');
  const review=skillReviewSchema.parse({...saved.template,reviews:[...(latest?.review.reviews??[]).filter(r=>r.caseId!==p.judgment.caseId),{...p.judgment,reviewer:context.userId}]});
  const calculated=gradeSkillReplay(saved.current.snapshot.suite,saved.artifact.localAnalysis,review);
  const grade={...calculated,autoEnable:false,acceptance:'authenticated-local-shadow-review',artifactHash:saved.artifactHash,
   blockers:['production-model-equivalence-unproven','complete-safety-and-quality-suite-required','activation-gate-required']};
  if((await loadCurrent(context,p.id)).artifactHash!==saved.artifactHash)throw new Error('Shadow evidence changed');
  await client.query(`insert into agent_skill_shadow_review(job_id,owner_id,revision,reviewer_id,artifact_hash,review,grade)
   values($1,$2,$3,$2,$4,$5,$6)`,[p.id,context.userId,p.expectedRevision+1,saved.artifactHash,JSON.stringify(review),JSON.stringify(grade)]);
  return {revision:p.expectedRevision+1,grade};
 });
}
