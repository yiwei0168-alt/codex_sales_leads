import {z} from 'zod';
import type {ModelMessage} from './contracts';
import {loadRecordedModeRequest,revalidateRecordedModeRequest} from './model-request-source';
import {loadDecisionMemory} from './memory-context';
import {assertRecordedDecisionMemory} from './decision-memory-message';
import {assertCurrentSkillMessages} from './skill-message-guard';
import {assertCurrentMemoryMessages} from './memory-message-guard';
import {assertCurrentKnowledgeMessages} from './knowledge-message-guard';
import {assertCurrentPrivateReplayMessages} from './private-replay-guard';

const supported=new Set(['knowledge_search','knowledge_facts','knowledge_compare','knowledge_originals','vectorless_read',
 'memory_read','memory_history_search','memory_observation_search','skill_read','mail_read','customer_timeline']);
/** Every source result must have exactly one preceding call; no orphan or reused identity.
 * Discovery/description and other tools still need their own current-contract checks.
 */
export function assertRecordedEvidencePairs(messages:ModelMessage[]){
 const seen=new Set<string>(),pending=new Set<string>();
 for(const message of messages){
  if(message.role==='tool'){
   if(!message.tool_call_id||!pending.delete(message.tool_call_id))throw new Error('Recorded evidence pair invalid');
   const output=z.object({status:z.enum(['success','partial']),data:z.unknown().refine(value=>value!==undefined&&value!==null)}).parse(JSON.parse(message.content??'null'));
   if(output.data===undefined)throw new Error('Recorded evidence missing');
   continue;
  }
  if(pending.size)throw new Error('Recorded evidence pair incomplete');
  if(message.role!=='assistant'&&message.tool_calls?.length)throw new Error('Recorded evidence role invalid');
  for(const call of message.tool_calls??[]){
   if(!call.id||seen.has(call.id))throw new Error('Recorded evidence identity reused');
   seen.add(call.id);pending.add(call.id);
   if(call.function.name!=='execute_tool')throw new Error('Recorded request has unsupported tool provenance');
   const args=z.object({tool:z.string(),arguments:z.record(z.string(),z.unknown())}).strict().parse(JSON.parse(call.function.arguments));
   if(!supported.has(args.tool))throw new Error('Recorded request has unsupported business evidence');
  }
 }
 if(pending.size)throw new Error('Recorded evidence pair incomplete');
}
/** Local source checks only; no model/tool dispatch. This is not execution permission.
 * Revalidation is point-in-time, not a lease. Repeat before/after a future authorized call.
 */
export async function validateRecordedRequestEvidence(context:{userId:string},input:{runId:string;callId:string}){
 const saved=await loadRecordedModeRequest(context,input),messages=saved.body.messages;
 assertRecordedEvidencePairs(messages);
 assertRecordedDecisionMemory(messages,await loadDecisionMemory(context.userId));
 await assertCurrentSkillMessages({userId:context.userId,runId:input.runId},messages);
 await assertCurrentMemoryMessages(context.userId,messages);
 await assertCurrentKnowledgeMessages(context.userId,messages,saved.knowledgeScope);
 await assertCurrentPrivateReplayMessages(context.userId,messages);
 // Do not return a source snapshot if its journal changed during the separate local ACL checks.
 await revalidateRecordedModeRequest(context,input,saved.sourceHash);
 // Current tool contracts/mode permissions and whole-task provenance remain separate gates.
 return {...saved,checkedEvidenceDomains:['decision-memory','skill','memory','knowledge','mail-and-timeline'] as const,
  evidenceSnapshotRevalidated:true as const,sourcePermissionsRevalidated:false as const,executionAuthorized:false as const,qualityAccepted:false as const};
}
