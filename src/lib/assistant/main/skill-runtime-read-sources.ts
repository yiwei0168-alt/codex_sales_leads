import type {ExecutionContext,ModelMessage} from './contracts';
import {assertCurrentSkillMessages} from './skill-message-guard';
import {assertCurrentMemoryMessages} from './memory-message-guard';
import {assertCurrentKnowledgeMessages} from './knowledge-message-guard';
import {assertCurrentPrivateReplayMessages} from './private-replay-guard';

/** Local revalidation only. Virtual candidate instructions are separately bound
 * to the frozen version; all other Skill pins use the ordinary source guard. */
export async function assertSkillRuntimeReadSources(context:Pick<ExecutionContext,'userId'|'runId'|'knowledgeScope'>,
 messages:ModelMessage[],candidateId:string){
 const virtual=new Set<string>();
 for(const message of messages)if(message.role==='assistant')for(const call of message.tool_calls??[]){
  if(call.function.name!=='execute_tool')continue;
  try{const value=JSON.parse(call.function.arguments);if(value.tool==='skill_read'&&value.arguments?.id===candidateId)virtual.add(call.id);}catch{/* Not executable. */}
 }
 await assertCurrentSkillMessages(context,messages.filter(message=>message.role!=='tool'||!virtual.has(message.tool_call_id??'')));
 await assertCurrentMemoryMessages(context.userId,messages);
 await assertCurrentKnowledgeMessages(context.userId,messages,context.knowledgeScope);
 await assertCurrentPrivateReplayMessages(context.userId,messages);
}
