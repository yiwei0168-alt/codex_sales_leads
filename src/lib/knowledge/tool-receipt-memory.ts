import {z} from 'zod';
import {digest} from '@/lib/assistant/main/contracts';
import {tenantTransaction} from '@/lib/rag/db';
import {observeMemoryInTransaction} from './temporal-memory';

type Receipt={id:string;tool_id:string;tool_version:string;effect:string;status:string;
  input_hash:string;input:unknown;output:unknown;updated_at:Date|string;cursor_created_at?:string};
const ids=z.array(z.uuid()).max(24).refine(values=>new Set(values).size===values.length);
const comparisonInput=z.object({entities:z.array(z.string()).length(2),attributes:z.array(z.string()).min(1).max(6)});
const field=z.object({attribute:z.string(),status:z.enum(['verified','missing','conflicting']),factIds:z.array(z.uuid()),evidenceIds:z.array(z.uuid())});
const comparison=z.object({status:z.enum(['success','partial']),data:z.object({kind:z.literal('comparison-evidence'),partial:z.boolean(),
  entities:z.array(z.object({entity:z.string(),fields:z.array(field).min(1).max(6),partial:z.boolean(),
    evidence:z.array(z.object({id:z.uuid()})).max(4),verifiedFacts:z.array(z.object({id:z.uuid()}))})).length(2)})});
const aggregateInput=z.object({sessionId:z.uuid(),documentIds:ids});
const aggregate=z.object({status:z.literal('success'),data:z.object({status:z.literal('ok'),documentIds:ids,count:z.number().int().min(0).max(24),truncated:z.literal(false)})});

/** Only fixed templates and validated counters enter memory; source prose is never an instruction. */
export function receiptExperience(receipt:Receipt){
  if(receipt.status!=='completed'||receipt.effect!=='read'||receipt.tool_version!=='1'||receipt.input_hash!==digest(receipt.input))return null;
  if(receipt.tool_id==='knowledge_compare'){
    const input=comparisonInput.safeParse(receipt.input),output=comparison.safeParse(receipt.output);
    if(!input.success||!output.success)return null;
    const i=input.data,o=output.data;
    if(new Set(i.entities.map(value=>value.toLowerCase())).size!==2||new Set(i.attributes).size!==i.attributes.length)return null;
    const counts={verified:0,missing:0,conflicting:0};let blocks=0;
    for(let n=0;n<2;n++){
      const entity=o.data.entities[n];
      if(entity.entity!==i.entities[n]||entity.fields.length!==i.attributes.length)return null;
      const evidence=new Set(entity.evidence.map(row=>row.id)),facts=new Set(entity.verifiedFacts.map(row=>row.id));
      if(evidence.size!==entity.evidence.length||facts.size!==entity.verifiedFacts.length)return null;
      for(let k=0;k<i.attributes.length;k++){
        const f=entity.fields[k];
        if(new Set(f.factIds).size!==f.factIds.length||new Set(f.evidenceIds).size!==f.evidenceIds.length)return null;
        if(f.attribute!==i.attributes[k]||f.evidenceIds.some(id=>!evidence.has(id))||f.factIds.some(id=>!facts.has(id)))return null;
        if((f.status==='missing'&&f.factIds.length!==0)||(f.status==='verified'&&f.factIds.length<1)||(f.status==='conflicting'&&f.factIds.length<2))return null;
        counts[f.status]++;
      }
      if(entity.partial!==entity.fields.some(f=>f.status!=='verified'))return null;
      blocks+=entity.evidence.length;
    }
    const partial=counts.missing+counts.conflicting>0;
    if(o.data.partial!==partial||(o.status==='partial')!==partial)return null;
    return {method:'independent-entity-comparison',counts:{entities:2,attributesPerEntity:i.attributes.length,evidenceBlocks:blocks,...counts},
      content:`当次逐对象比较分别读取了 2 个对象、每个 ${i.attributes.length} 个字段，保留 ${blocks} 组原文。工具当时报为已核实的字段 ${counts.verified} 项、缺项 ${counts.missing} 项、冲突 ${counts.conflicting} 项。缺项和冲突需继续核对，不能用一个对象的资料填补另一个。此记录只证明当次工具执行与返回情况，不证明答案正确或方法效果；原文及事实再次使用时须重新核验。`};
  }
  if(receipt.tool_id==='vectorless_aggregate'){
    const input=aggregateInput.safeParse(receipt.input),output=aggregate.safeParse(receipt.output);
    if(!input.success||!output.success)return null;
    const i=input.data,o=output.data.data;
    if(o.count!==o.documentIds.length||o.documentIds.some(id=>!i.documentIds.includes(id)))return null;
    return {method:'authorized-document-set-count',counts:{requested:i.documentIds.length,returned:o.count},
      content:`当次文档集合计数提交 ${i.documentIds.length} 个候选，工具返回当时可访问且可检索的 ${o.count} 份资料。这个数量仅适用于当次候选子集，不能作为整个资料库的总数；后续任务需重新按权限和版本计算。此记录不证明最终答案正确。`};
  }
  return null;
}

/** Independent of Ollama. The claimed job and completed source run must still belong to this account. */
export async function learnToolReceiptMemories(userId:string,runId:string,lease:string){
  return tenantTransaction(userId,async client=>{
    const owned=await client.query(`select j.run_id from agent_memory_extraction_job j
      join agent_run r on r.id=j.run_id and r.user_id=j.owner_id
      join app_user u on u.id=j.owner_id and u.status='active'
      where j.owner_id=$1 and j.run_id=$2 and j.status='processing' and j.lease_token=$3
        and j.updated_at>now()-interval '5 minutes' and r.status='completed' and r.execution_kind='main-agent'
      for update of j`,[userId,runId,lease]);
    if(!owned.rowCount)return {owned:false,observations:0,limited:false};
    // Page a completed run's immutable receipts rather than silently dropping later calls.
    let cursorTime:string|null=null,cursorId:string|null=null,observations=0;
    while(true){
    const receipts:{rows:Receipt[]}=await client.query<Receipt>(`select id,tool_id,tool_version,effect,status,input_hash,input,output,updated_at,created_at::text as cursor_created_at
      from agent_tool_call where user_id=$1 and run_id=$2 and status='completed' and effect='read'
        and tool_version='1' and tool_id in ('knowledge_compare','vectorless_aggregate')
        and ($3::timestamptz is null or (created_at,id)>($3::timestamptz,$4::uuid))
      order by created_at,id limit 100`,[userId,runId,cursorTime,cursorId]);
    for(const receipt of receipts.rows){
      const experience=receiptExperience(receipt);if(!experience)continue;
      await observeMemoryInTransaction(client,userId,{kind:'experience',content:experience.content,
        memoryKey:`tool-receipt:${receipt.id}`,idempotencyKey:`tool-receipt-v1:${receipt.id}`,confidence:0.7,
        sourceReceipt:{type:'structured-tool-experience',runId,callId:receipt.id,toolId:receipt.tool_id,toolVersion:receipt.tool_version,
          inputSha256:receipt.input_hash,outputSha256:digest(receipt.output),observedAt:receipt.updated_at,
          method:experience.method,counts:experience.counts,usage:'historical-execution-only',
          observationBasis:'server-tool-receipt',successVerified:false,answerQualityVerified:false}});
      observations++;
    }
    if(receipts.rows.length<100)break;
    const last:Receipt=receipts.rows.at(-1)!;
    if(!last.cursor_created_at)throw new Error('Receipt cursor unavailable');
    cursorTime=last.cursor_created_at;cursorId=last.id;
    }
    // Give the following bounded local extraction its full lease after receipt pagination.
    await client.query(`update agent_memory_extraction_job set updated_at=clock_timestamp()
      where owner_id=$1 and run_id=$2 and lease_token=$3 and status='processing'`,[userId,runId,lease]);
    return {owned:true,observations,limited:false};
  });
}
