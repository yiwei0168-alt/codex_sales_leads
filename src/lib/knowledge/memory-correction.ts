import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {PoolClient} from 'pg';
import {tenantTransaction} from '@/lib/rag/db';
import {observeMemoryInTransaction,type MemoryObservationInput} from './temporal-memory';
import {parseMemoryCorrectionCommand} from './memory-correction-command';

const businessTimeSchema=z.object({validFrom:z.iso.datetime({offset:true}).nullable(),validUntil:z.iso.datetime({offset:true}).nullable()}).strict()
  .refine(p=>!p.validFrom||!p.validUntil||Date.parse(p.validUntil)>Date.parse(p.validFrom),{message:'Invalid business validity interval'});
export const memoryCorrectionSchema=z.object({
  id:z.uuid(),content:z.string().trim().min(3).max(800),reason:z.string().trim().max(500).default(''),
  businessTime:businessTimeSchema.optional(),
}).strict();
type Target={id:string;kind:MemoryObservationInput['kind'];content:string;memory_key:string|null;
  market_code:string|null;company_id:string|null;market_codes:string[];company_ids:string[];
  valid_from:string|null;valid_until:string|null;confidence:number|null;invalidates_id:string|null;
  source_receipt:Record<string,unknown>};

/** An authenticated user's explicit correction; never a model-selected replacement. */
export async function correctMemory(userId:string,input:z.input<typeof memoryCorrectionSchema>){
  const p=memoryCorrectionSchema.parse(input);
  return tenantTransaction(userId,client=>correctInTransaction(client,userId,p));
}

type MessageSource={runId:string;messageId:string;messageSha256:string;sourceQuote:string};
async function correctInTransaction(client:PoolClient,userId:string,p:z.output<typeof memoryCorrectionSchema>,source?:MessageSource){
    const target=(await client.query<Target>(`select id,kind,content,memory_key,market_code,company_id,
      market_codes,company_ids,valid_from,valid_until,confidence,invalidates_id,source_receipt
      from agent_memory_observation where owner_id=$1 and id=$2`,[userId,p.id])).rows[0];
    if(!target)throw new Error('Memory target is unavailable');
    // Legacy observations mirror an independently versioned store. Its original editor owns updates.
    if(String(target.source_receipt.type).startsWith('agent-memory-'))throw new Error('Use original memory editor');
    if(target.invalidates_id)throw new Error('Memory version changed');
    const validFrom=p.businessTime?p.businessTime.validFrom:target.valid_from;
    const validUntil=p.businessTime?p.businessTime.validUntil:target.valid_until;
    const instant=(value:string|null)=>value===null?null:new Date(value).getTime();
    if(target.content===p.content&&instant(validFrom)===instant(target.valid_from)&&instant(validUntil)===instant(target.valid_until))
      throw new Error('Memory correction is unchanged');
    if(target.memory_key)await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[
      `${userId}:${target.kind}:${target.memory_key}:${target.market_code??''}:${target.company_id??''}:${target.market_codes.join(',')}:${target.company_ids.join(',')}`]);
    await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`memory-target:${userId}:${p.id}`]);
    const key=source?`message-correction:${source.messageId}`:`user-correction:${p.id}:${createHash('sha256').update(JSON.stringify(
      p.businessTime?[p.content,p.reason,{validFrom:validFrom===null?null:new Date(validFrom).toISOString(),validUntil:validUntil===null?null:new Date(validUntil).toISOString()}]:[p.content,p.reason])).digest('hex')}`;
    const replay=(await client.query<{id:string}>('select id from agent_memory_observation where owner_id=$1 and idempotency_key=$2',[userId,key])).rows[0];
    if(replay)return replay.id;
    const replaced=await client.query('select id from agent_memory_observation where owner_id=$1 and (corrects_id=$2 or invalidates_id=$2) limit 1',[userId,p.id]);
    if(replaced.rows.length)throw new Error('Memory version changed');
    if(source){
      const conflict=await client.query(`select c.id from agent_memory_conflict c where c.owner_id=$1
        and c.status='open' and (c.earlier_id=$2 or c.later_id=$2)
        and not exists(select 1 from agent_memory_observation r where r.owner_id=$1
          and (r.corrects_id in(c.earlier_id,c.later_id) or r.invalidates_id in(c.earlier_id,c.later_id))) limit 1`,[userId,p.id]);
      if(conflict.rows.length)throw new Error('Memory conflict requires review');
    }
    return observeMemoryInTransaction(client,userId,{
      kind:target.kind,content:p.content,memoryKey:target.memory_key??undefined,
      marketCode:target.market_code??undefined,companyId:target.company_id??undefined,
      marketCodes:target.market_codes,companyIds:target.company_ids,
      validFrom,validUntil,
      confidence:target.confidence===null?undefined:Math.min(target.confidence,0.7),
      correctsId:p.id,idempotencyKey:key,
      sourceReceipt:{type:source?'user-message-correction':'user-correction',targetId:p.id,sourceQuote:p.content,reason:p.reason,
        ...(p.businessTime?{businessTimeCorrection:{explicit:true,before:{validFrom:target.valid_from,validUntil:target.valid_until},after:{validFrom,validUntil}}}:{}),
        ...(source?{runId:source.runId,messageId:source.messageId,messageSha256:source.messageSha256,commandQuote:source.sourceQuote}:{}),
        usage:'unverified-internal-only',successVerified:false,observationBasis:'user-correction'},
    });
}

/** Uses only the saved authenticated user message; supplied tool/model text cannot select a target. */
export async function processMessageMemoryCorrection(userId:string,runId:string,lease:string){
  return tenantTransaction(userId,async client=>{
    const source=(await client.query<{message_id:string;content:string;created_at:string}>(`select m.id as message_id,m.content,m.created_at::text
      from agent_memory_extraction_job j join agent_run r on r.id=j.run_id and r.user_id=j.owner_id
      join app_user u on u.id=j.owner_id and u.status='active'
      join lateral(select id,content,created_at from assistant_message where user_id=j.owner_id
        and conversation_id=r.conversation_id and role='user' and metadata->>'runId'=r.id::text
        order by created_at,id limit 1) m on true
      where j.owner_id=$1 and j.run_id=$2 and j.status='processing' and j.lease_token=$3
        and j.updated_at>now()-interval '5 minutes' and r.status='completed' and r.execution_kind='main-agent'
      for update of j`,[userId,runId,lease])).rows[0];
    if(!source)return {owned:false,handled:false};
    const parsed=parseMemoryCorrectionCommand(source.content);
    if(!parsed.recognized)return {owned:true,handled:false};
    const key=`message-correction:${source.message_id}`;
    const prior=await client.query('select id from agent_memory_observation where owner_id=$1 and idempotency_key=$2',[userId,key]);
    if(!prior.rows.length){
      let reason='格式不明确，或涉及政策、权限及业务时间变更';
      let corrected=false;
      if(parsed.correction){
        const targets=await client.query<{id:string;auto_eligible:boolean}>(`select m.id,
          (m.market_code is null and m.company_id is null and cardinality(m.market_codes)=0 and cardinality(m.company_ids)=0
            and m.source_receipt->>'type' in ('local-qwen3-extraction','user-correction','user-message-correction')
            and (m.valid_from is null or m.valid_from<=now()) and (m.valid_until is null or m.valid_until>now())) as auto_eligible
          from agent_memory_observation m where m.owner_id=$1
          and (m.content=$2 or m.source_receipt->>'sourceQuote'=$2) and m.recorded_at<=$3::timestamptz
          and m.invalidates_id is null
          and not exists(select 1 from agent_memory_observation r where r.owner_id=$1 and (r.corrects_id=m.id or r.invalidates_id=m.id))
          order by m.id limit 2`,[userId,parsed.correction.oldContent,source.created_at]);
        reason=targets.rows.length===0?'没有找到可自动更正的当前账户级记忆':'旧内容匹配多条记忆';
        if(targets.rows.length===1&&!targets.rows[0].auto_eligible)reason='目标属于原有记忆、限定范围或非当前业务时间，需在记忆中心核对';
        if(targets.rows.length===1&&targets.rows[0].auto_eligible){
          try{
            await correctInTransaction(client,userId,{id:targets.rows[0].id,content:parsed.correction.content,reason:'用户在对话中明确更正'},
              {runId,messageId:source.message_id,messageSha256:createHash('sha256').update(source.content).digest('hex'),sourceQuote:source.content});
            corrected=true;
          }catch(error){
            if(!(error instanceof Error)||!['Memory version changed','Memory conflict requires review','Memory correction is unchanged'].includes(error.message))throw error;
            reason=error.message==='Memory correction is unchanged'?'新旧内容相同':'记忆状态已变化或存在未解决冲突';
          }
        }
      }
      if(!corrected)await observeMemoryInTransaction(client,userId,{kind:'experience',
        content:`收到记忆更正请求，但未自动替换：${reason}。请到记忆中心核对原记录并更正。`,idempotencyKey:key,
        sourceReceipt:{type:'unresolved-memory-correction',runId,messageId:source.message_id,
          messageSha256:createHash('sha256').update(source.content).digest('hex'),reason,usage:'review-notice-only',successVerified:false}});
    }
    await client.query(`update agent_memory_extraction_job set status='ready',lease_token=null,error_code=null,updated_at=now()
      where owner_id=$1 and run_id=$2 and status='processing' and lease_token=$3`,[userId,runId,lease]);
    return {owned:true,handled:true};
  });
}
