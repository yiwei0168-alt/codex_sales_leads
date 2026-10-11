import {z} from 'zod';
import {tenantQuery,tenantTransaction} from '@/lib/rag/db';
import {digest} from './contracts';
import {historicalReplayInputFromSnapshot,prepareHistoricalSkillReplay} from './skill-replay-snapshot';
import {prepareSkillReview,gradeSkillReplay,skillReviewSchema} from './skill-replay-review';

type Snapshot=Awaited<ReturnType<typeof prepareHistoricalSkillReplay>>;
type Stored={id:string;snapshot:Snapshot;result:unknown;artifact_hash:string};
type Context={userId:string};

export async function listSkillReplayReviews(context:Context,skillId:string,offset:number){
  z.uuid().parse(skillId);z.number().int().min(0).max(100000).parse(offset);
  const rows=await tenantQuery<{id:string;version:number;created_at:string}>(context.userId,
    'select id,version,created_at::text from agent_skill_replay where owner_id=$1 and skill_id=$2 order by created_at desc,id limit 13 offset $3',
    [context.userId,skillId,offset]);
  return {items:rows.slice(0,12),hasMore:rows.length>12};
}

async function assertSnapshotCurrent(context:Context,snapshot:Snapshot){
  if(snapshot.suite.ownerId!==context.userId)throw new Error('Replay unavailable');
  const input=historicalReplayInputFromSnapshot(snapshot);
  const current=await prepareHistoricalSkillReplay(context,input);
  if(digest(current)!==digest(snapshot))throw new Error('Replay sources changed');
}

/** Internal runner completion sink. Not exposed as HTTP upload or Agent tool. */
export async function storeHistoricalSkillReplay(context:Context,snapshot:Snapshot,result:unknown){
  const template=prepareSkillReview(snapshot.suite,result);
  if(template.reviews.length!==snapshot.suite.cases.length)throw new Error('Replay pairs incomplete');
  if(Buffer.byteLength(JSON.stringify({snapshot,result}))>20_000_000)throw new Error('Replay too large');
  await assertSnapshotCurrent(context,snapshot);
  const hash=digest({snapshot,result});
  return tenantTransaction(context.userId,async client=>{
    const skill=(await client.query('select current_version from agent_skill where id=$1 and owner_id=$2 and scope=\'account\' for share',
      [snapshot.suite.skill.id,context.userId])).rows[0];
    if(skill?.current_version!==snapshot.suite.skill.version)throw new Error('Skill version changed');
    const existing=(await client.query<{id:string}>('select id from agent_skill_replay where owner_id=$1 and artifact_hash=$2',[context.userId,hash])).rows[0];
    if(existing)return existing;
    const saved=(await client.query<{id:string}>(`insert into agent_skill_replay(owner_id,skill_id,version,snapshot,result,artifact_hash)
      values($1,$2,$3,$4,$5,$6) on conflict(owner_id,artifact_hash) do nothing returning id`,
      [context.userId,snapshot.suite.skill.id,snapshot.suite.skill.version,JSON.stringify(snapshot),JSON.stringify(result),hash])).rows[0];
    return saved??(await client.query<{id:string}>('select id from agent_skill_replay where owner_id=$1 and artifact_hash=$2',[context.userId,hash])).rows[0];
  });
}

async function loadCurrent(context:Context,id:string){
  z.uuid().parse(id);
  const stored=(await tenantQuery<Stored>(context.userId,
    'select id,snapshot,result,artifact_hash from agent_skill_replay where id=$1 and owner_id=$2',[id,context.userId]))[0];
  if(!stored||stored.artifact_hash!==digest({snapshot:stored.snapshot,result:stored.result}))throw new Error('Replay unavailable');
  await assertSnapshotCurrent(context,stored.snapshot);
  return stored;
}

export async function readSkillReplayReview(context:Context,id:string){
  const stored=await loadCurrent(context,id);
  const latest=(await tenantQuery<{revision:number;review:z.infer<typeof skillReviewSchema>;grade:unknown}>(context.userId,
    'select revision,review,grade from agent_skill_replay_review where replay_id=$1 and owner_id=$2 order by revision desc limit 1',[id,context.userId]))[0];
  const template=prepareSkillReview(stored.snapshot.suite,stored.result);
  return {id,kind:'local-historical-replay',snapshot:stored.snapshot,result:stored.result,
    revision:latest?.revision??0,review:{...template,reviews:template.reviews.map(row=>latest?.review.reviews.find(r=>r.caseId===row.caseId)??row)},
    grade:latest?.grade??null,autoEnable:false};
}

export const appendSkillReviewSchema=z.object({id:z.uuid(),expectedRevision:z.number().int().min(0),
  suiteHash:z.string().regex(/^[a-f0-9]{64}$/),resultHash:z.string().regex(/^[a-f0-9]{64}$/),
  judgment:skillReviewSchema.shape.reviews.element.omit({reviewer:true})}).strict();

export async function appendSkillReplayReview(context:Context,input:z.infer<typeof appendSkillReviewSchema>){
  const p=appendSkillReviewSchema.parse(input),stored=await loadCurrent(context,p.id);
  const template=prepareSkillReview(stored.snapshot.suite,stored.result);
  if(template.suiteHash!==p.suiteHash||template.resultHash!==p.resultHash)throw new Error('Stale replay review');
  return tenantTransaction(context.userId,async client=>{
    // Serializes revisions without granting UPDATE on immutable evidence tables.
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`skill-review:${p.id}`]);
    const selected=(await client.query<{current_version:number}>('select current_version from agent_skill where id=$1 and owner_id=$2 for share',
      [stored.snapshot.suite.skill.id,context.userId])).rows[0];
    if(selected?.current_version!==stored.snapshot.suite.skill.version)throw new Error('Skill version changed');
    const latest=(await client.query<{revision:number;review:z.infer<typeof skillReviewSchema>}>(
      'select revision,review from agent_skill_replay_review where replay_id=$1 and owner_id=$2 order by revision desc limit 1',[p.id,context.userId])).rows[0];
    if((latest?.revision??0)!==p.expectedRevision)throw new Error('Review revision changed');
    const review=skillReviewSchema.parse({...template,reviews:[...(latest?.review.reviews??[]).filter(r=>r.caseId!==p.judgment.caseId),
      {...p.judgment,reviewer:context.userId}]});
    const calculated=gradeSkillReplay(stored.snapshot.suite,stored.result,review);
    const grade={...calculated,blockers:calculated.blockers.filter(b=>b!=='trusted-review-storage-missing'),
      reviewProvenance:'authenticated-account-review',autoEnable:false};
    // Sources can change while waiting for a review lock; check again immediately before append.
    await assertSnapshotCurrent(context,stored.snapshot);
    await client.query(`insert into agent_skill_replay_review(replay_id,owner_id,revision,reviewer_id,review,grade)
      values($1,$2,$3,$2,$4,$5)`,[p.id,context.userId,p.expectedRevision+1,JSON.stringify(review),JSON.stringify(grade)]);
    return {revision:p.expectedRevision+1,grade};
  });
}
