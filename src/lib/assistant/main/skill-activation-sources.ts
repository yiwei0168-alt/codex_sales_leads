import type {PoolClient} from 'pg';
import {z} from 'zod';
import {withBoundTenantTransaction} from '@/lib/rag/db';
import {digest,messageInputSchema} from './contracts';
import {loadRecordedTaskChain} from './recorded-task-source';
import {lockRecordedTaskRunJournals} from './skill-acceptance-run-locks';
import {revalidateLockedKnowledgeAssetBytes} from './skill-attachment-bytes';
import {revalidateLockedSkillKnowledgeReceiptBytes} from './skill-knowledge-receipt-bytes';
import {captureSkillMemoryTimeFence} from './skill-memory-time-fence';
import {skillActivationSourcesSchema} from './skill-activation-source-schema';

/** Rebuild current owned business sources, never candidate output or a quality
 * judgment. The parent retains source admission and journals through use. */
export async function captureSkillActivationSources(client:PoolClient,userId:string,runIds:readonly string[]){
 const ids=[...new Set(z.array(z.uuid()).min(1).max(100).parse(runIds))].sort();
 return withBoundTenantTransaction(client,userId,async()=>{
  await client.query('select lock_skill_knowledge_sources()');
  await lockRecordedTaskRunJournals(client,userId,ids,{successfulReadSourcesOnly:true});
  const sources=[];
  for(const runId of ids){
   const chain=await loadRecordedTaskChain({userId},{runId});
   const input=(await client.query<{input:unknown}>('select input from agent_run where user_id=$1 and id=$2',[userId,runId])).rows[0]?.input;
   const attachments=messageInputSchema.shape.attachments.parse(z.object({attachments:z.unknown()}).passthrough().parse(input).attachments);
   const attachmentBytes=await revalidateLockedKnowledgeAssetBytes(client,userId,attachments.map(row=>row.assetId));
   const receiptIds=[...new Set(chain.requests.flatMap(request=>request.receiptBinding.receipts.map(row=>row.id)))].sort();
   const receipts=receiptIds.length?(await client.query<{tool:string;input:unknown;output:unknown}>(
    'select tool_id tool,input,output from agent_tool_call where user_id=$1 and run_id=$2 and id=any($3::uuid[]) order by id',[userId,runId,receiptIds])).rows:[];
   if(receipts.length!==receiptIds.length)throw new Error('Activation consumed source receipts unavailable');
   const knowledge=await revalidateLockedSkillKnowledgeReceiptBytes(client,userId,receipts);
   const memory=await captureSkillMemoryTimeFence(client,userId,receipts);
   const pins=(await client.query<{skill_id:string;version:number;binding:unknown}>(`select p.skill_id,p.version,to_jsonb(s)->'activation_binding' binding
    from agent_run_skill p join agent_skill s on s.id=p.skill_id where p.user_id=$1 and p.run_id=$2 order by p.skill_id,p.version`,[userId,runId])).rows;
   const deadlines=[memory.memoryTimeValidBefore,...pins.map(row=>row.binding==null?null:
    z.object({validBefore:z.iso.datetime()}).passthrough().parse(row.binding).validBefore)].filter((value):value is string=>value!==null);
   const validBefore=deadlines.length?new Date(Math.min(...deadlines.map(Date.parse))).toISOString():null;
   sources.push({runId,sourceHash:chain.sourceHash,chainHash:chain.chainHash,initialSourceHash:chain.initialSourceHash,
    attachmentHash:digest(attachmentBytes),knowledgeHash:digest(knowledge),pinnedMethodsHash:digest(pins),validBefore});
  }
  const snapshots=skillActivationSourcesSchema.parse(sources);
  const deadlines=snapshots.map(row=>row.validBefore).filter((value):value is string=>value!==null);
  const validBefore=deadlines.length?new Date(Math.min(...deadlines.map(Date.parse))).toISOString():null;
  if(validBefore){
   const current=(await client.query<{valid:boolean}>('select clock_timestamp()<$1::timestamptz valid',[validBefore])).rows[0]?.valid;
   if(current!==true)throw new Error('Activation business sources expired during validation');
  }
  return {activationSourcesRevalidated:true as const,activationSources:snapshots,activationSourcesValidBefore:validBefore};
 });
}

export async function assertSkillActivationSourcesCurrent(client:PoolClient,userId:string,input:unknown){
 const expected=skillActivationSourcesSchema.parse(input);
 const actual=await captureSkillActivationSources(client,userId,expected.map(row=>row.runId));
 if(digest(actual.activationSources)!==digest(expected))throw new Error('Activation business sources changed');
}
