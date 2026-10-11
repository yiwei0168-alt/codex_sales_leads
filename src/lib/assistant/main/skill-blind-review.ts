import {randomInt} from 'node:crypto';
import {z} from 'zod';
import {tenantQuery,tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {readSkillReplayReview} from './skill-review-store';
import {readSkillShadowReview} from './skill-shadow-review';

const sha=z.string().regex(/^[a-f0-9]{64}$/);
const verdict=z.object({answer:z.boolean(),citation:z.boolean(),permission:z.boolean(),injection:z.boolean(),rationale:z.string().trim().min(1).max(4000)}).strict();
export const startBlindReviewSchema=z.object({kind:z.enum(['history','shadow']),sourceId:z.uuid()}).strict();
export const revealBlindReviewSchema=z.object({operation:z.literal('reveal'),id:z.uuid(),expectedRevision:z.number().int().positive()}).strict();
export const blindJudgmentSchema=z.object({id:z.uuid(),expectedRevision:z.number().int().min(0),artifactHash:sha,
 caseId:z.string().min(1).max(200),pairHash:sha,A:verdict,B:verdict}).strict();
const arm=z.object({status:z.string(),reply:z.string().optional(),answer:z.string().optional(),stopReason:z.string().nullable().optional()}).passthrough();
const sourceSchema=z.object({snapshot:z.object({suite:z.object({cases:z.array(z.object({id:z.string(),question:z.string(),receipts:z.array(z.unknown()),coverage:z.unknown().optional()}).passthrough())}).passthrough()}).passthrough(),
 result:z.object({pairs:z.array(z.object({caseId:z.string(),baseline:arm,candidate:arm}).passthrough())}).passthrough()}).passthrough();
type Source=z.infer<typeof sourceSchema>;
type Round={id:string;replay_id:string|null;shadow_id:string|null;artifact_hash:string;arm_order:Record<string,boolean>};
const sourceHash=(s:Source)=>digest({snapshot:s.snapshot,result:s.result});
async function loadSource(userId:string,kind:'history'|'shadow',id:string){
 const source=sourceSchema.parse(kind==='history'?await readSkillReplayReview({userId},id):await readSkillShadowReview({userId},id));
 const skill=z.object({id:z.uuid(),version:z.number().int().positive()}).parse(source.snapshot.suite.skill);
 if(!(await tenantQuery(userId,"select id from agent_skill where id=$1 and owner_id=$2 and current_version=$3 and scope='account'",[skill.id,userId,skill.version])).length)throw new Error('Skill version changed');
 return source;
}

/** Whitelist output: neither raw graph messages, Skill files nor arm labels leave this view. */
export function presentBlindPairs(source:Source,order:Record<string,boolean>){
 return source.result.pairs.map(pair=>{
  const item=source.snapshot.suite.cases.find(c=>c.id===pair.caseId);if(!item||typeof order[pair.caseId]!=='boolean')throw new Error('Blind case binding missing');
  const visible=(a:z.infer<typeof arm>)=>({status:a.status,answer:a.reply??a.answer??'',canPass:a.status==='completed'&&!a.stopReason});
  return {caseId:pair.caseId,pairHash:digest(pair),question:item.question,receipts:item.receipts,
   partialTask:Boolean(item.coverage),A:visible(order[pair.caseId]?pair.candidate:pair.baseline),B:visible(order[pair.caseId]?pair.baseline:pair.candidate)};
 });
}
export async function startBlindReview(userId:string,input:z.infer<typeof startBlindReviewSchema>){
 const p=startBlindReviewSchema.parse(input),source=await loadSource(userId,p.kind,p.sourceId);
 if(!source.result.pairs.length)throw new Error('No completed evaluation pairs');
 return tenantTransaction(userId,async client=>{
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`blind-review:${userId}:${p.kind}:${p.sourceId}`]);
  const column=p.kind==='history'?'replay_id':'shadow_id';
  const existing=(await client.query<Round>(`select * from agent_skill_blind_round where owner_id=$1 and ${column}=$2`,[userId,p.sourceId])).rows[0];
  if(existing){if(existing.artifact_hash!==sourceHash(source))throw new Error('Evaluation changed');return {id:existing.id};}
  const order=Object.fromEntries(source.result.pairs.map(pair=>[pair.caseId,Boolean(randomInt(2))]));
  const saved=(await client.query<{id:string}>(`insert into agent_skill_blind_round(owner_id,${column},artifact_hash,arm_order) values($1,$2,$3,$4) returning id`,[userId,p.sourceId,sourceHash(source),JSON.stringify(order)])).rows[0];
  return saved;
 });
}
async function current(userId:string,id:string){
 z.uuid().parse(id);
 const round=(await tenantQuery<Round>(userId,'select * from agent_skill_blind_round where id=$1 and owner_id=$2',[id,userId]))[0];if(!round)throw new Error('Round unavailable');
 const source=await loadSource(userId,round.replay_id?'history':'shadow',round.replay_id??round.shadow_id!);
 if(sourceHash(source)!==round.artifact_hash)throw new Error('Evaluation changed');
 return {round,source};
}
export async function readBlindReview(userId:string,id:string){
 const {round,source}=await current(userId,id);
 const rows=await tenantQuery<{revision:number;case_id:string;judgment:unknown;reviewer_kind:string;created_at:string}>(userId,
  'select revision,case_id,judgment,reviewer_kind,created_at::text from agent_skill_blind_judgment where round_id=$1 and owner_id=$2 order by revision desc',[id,userId]);
 const latest=new Map<string,typeof rows[number]>();for(const row of rows)if(!latest.has(row.case_id))latest.set(row.case_id,row);
 const revealed=(await tenantQuery(userId,'select round_id from agent_skill_blind_disclosure where round_id=$1 and owner_id=$2',[id,userId])).length>0;
 return {id,artifactHash:round.artifact_hash,revision:rows[0]?.revision??0,pairs:presentBlindPairs(source,round.arm_order),judgments:[...latest.values()],
  history:rows.map(({revision,case_id,reviewer_kind,created_at})=>({revision,caseId:case_id,reviewerKind:reviewer_kind,createdAt:created_at})),
  sourceKind:round.replay_id?'local-history':'prospective-local-analysis',independentSource:false,autoEnable:false,revealed,
  ...(revealed?{identities:Object.fromEntries(Object.entries(round.arm_order).map(([id,swapped])=>[id,{A:swapped?'候选 Skill':'原流程',B:swapped?'原流程':'候选 Skill'}]))}:{})};
}
export async function appendBlindJudgment(userId:string,input:z.infer<typeof blindJudgmentSchema>,reviewerKind:'account-user'|'assistant-development'){
 const p=blindJudgmentSchema.parse(input);
 return tenantTransaction(userId,async client=>{
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`blind-judgment:${p.id}`]);
  if((await client.query('select round_id from agent_skill_blind_disclosure where round_id=$1 and owner_id=$2',[p.id,userId])).rowCount)throw new Error('Revealed review is sealed');
  const {round,source}=await current(userId,p.id);if(round.artifact_hash!==p.artifactHash)throw new Error('Stale artifact');
  const pair=presentBlindPairs(source,round.arm_order).find(row=>row.caseId===p.caseId);if(!pair||pair.pairHash!==p.pairHash)throw new Error('Stale pair');
  for(const side of ['A','B'] as const)if(!pair[side].canPass&&['answer','citation','permission','injection'].some(key=>p[side][key as keyof typeof p.A]===true))throw new Error('Incomplete answer cannot pass');
  const revision=(await client.query<{revision:number}>('select coalesce(max(revision),0)::int as revision from agent_skill_blind_judgment where round_id=$1 and owner_id=$2',[p.id,userId])).rows[0].revision;
  if(revision!==p.expectedRevision)throw new Error('Review revision changed');
  await client.query(`insert into agent_skill_blind_judgment(round_id,owner_id,revision,case_id,pair_hash,judgment,reviewer_id,reviewer_kind) values($1,$2,$3,$4,$5,$6,$2,$7)`,[p.id,userId,revision+1,p.caseId,p.pairHash,JSON.stringify({A:p.A,B:p.B}),reviewerKind]);
  return {revision:revision+1};
 });
}
export async function revealBlindReview(userId:string,input:z.infer<typeof revealBlindReviewSchema>){
 const p=revealBlindReviewSchema.parse(input);
 return tenantTransaction(userId,async client=>{
  await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`blind-judgment:${p.id}`]);
  const review=await readBlindReview(userId,p.id);
  if(review.revision!==p.expectedRevision||review.pairs.some(pair=>!review.judgments.some(j=>j.case_id===pair.caseId&&j.reviewer_kind==='account-user')))throw new Error('Complete account review required');
  await client.query('insert into agent_skill_blind_disclosure(round_id,owner_id,revision) values($1,$2,$3) on conflict do nothing',[p.id,userId,p.expectedRevision]);
  return {revealed:true};
 });
}
export async function assertLabeledReviewAvailable(userId:string,kind:'history'|'shadow',id:string){
 const column=kind==='history'?'replay_id':'shadow_id';
 const rows=await tenantQuery(userId,`select r.id from agent_skill_blind_round r where r.owner_id=$1 and r.${column}=$2 and not exists(select 1 from agent_skill_blind_disclosure d where d.round_id=r.id and d.owner_id=$1)`,[userId,id]);
 if(rows.length)throw new Error('Anonymous review active; use A/B review');
}
