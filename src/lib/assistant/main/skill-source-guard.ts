import type {PoolClient} from 'pg';
import {z} from 'zod';
import {digest} from './contracts';
import {isDirectMemorySpan} from '@/lib/knowledge/memory-source-context';

const provenance=z.object({
  methodFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
  sourceQuality:z.literal('repeated-user-report-unverified'),
  sourceObservations:z.array(z.object({observationId:z.uuid(),runId:z.uuid(),messageId:z.uuid(),
    receiptSha256:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(2).max(10),
});
export type SourcedSkillVersion={source:string;validation:unknown;content_hash:string;files:unknown;scope:string;owner_id:string};

/** Called after locking the Skill/version, inside the final tenant transaction.
 * IDs come from stored provenance; acquiring locks never substitutes eligibility. */
export async function lockCurrentSkillExperienceSources(client:PoolClient,userId:string,version:SourcedSkillVersion){
 const tagged=version.source.startsWith('local-experience:')
  ||(version.validation as {sourceQuality?:unknown}|null)?.sourceQuality==='repeated-user-report-unverified';
 if(!tagged)return {localExperienceSourceLocksHeld:false,observationCount:0};
 const parsed=provenance.safeParse(version.validation);
 if(!parsed.success||version.scope!=='account'||version.owner_id!==userId||digest(version.files)!==version.content_hash
  ||version.source!==`local-experience:${parsed.data.methodFingerprint}`)throw new Error('Skill experience provenance changed before locking');
 const ids=parsed.data.sourceObservations.map(row=>row.observationId);
 if(new Set(ids).size!==ids.length)throw new Error('Skill experience provenance duplicated');
 const count=(await client.query<{n:number}>('select lock_skill_memory_sources($1::uuid[]) as n',[[...ids].sort()])).rows[0]?.n;
 if(count!==ids.length||!await skillSourcesCurrent(client,userId,version))throw new Error('Skill experience sources changed after locking');
 return {localExperienceSourceLocksHeld:true,observationCount:count};
}

/** Current source eligibility only; this is never evidence of method quality or permission to enable. */
export async function skillSourcesCurrent(client:PoolClient,userId:string,version:SourcedSkillVersion):Promise<boolean>{
  const tagged=version.source.startsWith('local-experience:')
    ||(version.validation as {sourceQuality?:unknown}|null)?.sourceQuality==='repeated-user-report-unverified';
  if(!tagged)return true; // Imported packages do not claim local observation provenance.
  const parsed=provenance.safeParse(version.validation);
  if(!parsed.success||version.scope!=='account'||version.owner_id!==userId||digest(version.files)!==version.content_hash)return false;
  const {sourceObservations:refs,methodFingerprint}=parsed.data;
  if(version.source!==`local-experience:${methodFingerprint}`
    ||new Set(refs.map(r=>r.observationId)).size!==refs.length
    ||new Set(refs.map(r=>r.runId)).size!==refs.length
    ||new Set(refs.map(r=>r.messageId)).size!==refs.length)return false;
  const rows=await client.query<{id:string;run_id:string;message_id:string;message_content:string;memory_key:string;content:string;source_receipt:Record<string,unknown>}>(`
    select m.id,r.id as run_id,msg.id as message_id,msg.content as message_content,m.memory_key,m.content,m.source_receipt
    from agent_memory_observation m
    join app_user u on u.id=m.owner_id and u.status='active'
    join agent_run r on r.id::text=m.source_receipt->>'runId' and r.user_id=m.owner_id
      and r.status='completed' and r.execution_kind='main-agent'
    join assistant_message msg on msg.id::text=m.source_receipt->>'messageId' and msg.user_id=m.owner_id
      and msg.conversation_id=r.conversation_id and msg.role='user' and msg.metadata->>'runId'=r.id::text
    where m.owner_id=$1 and m.id=any($2::uuid[]) and m.kind='experience'
      and m.market_code is null and m.company_id is null and cardinality(m.market_codes)=0 and cardinality(m.company_ids)=0
      and m.source_receipt->>'type'='local-qwen3-extraction'
      and m.source_receipt->>'usage'='unverified-user-experience'
      and m.source_receipt->>'sourceQuote'=m.content and position(m.content in msg.content)>0
      and m.corrects_id is null and m.invalidates_id is null
      and (m.valid_from is null or m.valid_from<=clock_timestamp()) and (m.valid_until is null or m.valid_until>clock_timestamp())
      and not exists(select 1 from agent_memory_observation x where x.owner_id=$1 and (x.corrects_id=m.id or x.invalidates_id=m.id))
      and not exists(select 1 from agent_memory_conflict c where c.owner_id=$1 and c.status='open' and (c.earlier_id=m.id or c.later_id=m.id)
        and not exists(select 1 from agent_memory_observation x where x.owner_id=$1
          and (x.corrects_id in(c.earlier_id,c.later_id) or x.invalidates_id in(c.earlier_id,c.later_id))))
    `,[userId,refs.map(r=>r.observationId)]);
  return rows.rows.length===refs.length&&refs.every(ref=>{
    const row=rows.rows.find(r=>r.id===ref.observationId);
    return row&&typeof row.message_content==='string'&&isDirectMemorySpan(row.message_content,row.content)&&row.run_id===ref.runId&&row.message_id===ref.messageId&&digest(row.source_receipt)===ref.receiptSha256
      &&digest({version:'experience-draft-v1',memoryKey:row.memory_key,quote:row.content})===methodFingerprint;
  });
}
