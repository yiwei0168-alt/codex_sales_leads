import {z} from 'zod';
import {tenantTransaction} from '@/lib/rag/db';
import {digest,type ModelMessage,type ModelConfig} from './contracts';
import {modeConfigSchema} from './mode-config';
import {initialTaskMessages} from './initial-task-messages';

const inputSchema=z.object({content:z.string(),attachments:z.array(z.object({assetId:z.uuid()})).default([]),
 knowledgeScope:z.array(z.enum(['company','industry','product'])).optional()});
/** Compare against current account-owned sources. Deleted/changed history cannot silently become a valid replay. */
export async function bindRecordedInitialSource(context:{userId:string;runId:string},messages:ModelMessage[]){
 return tenantTransaction(context.userId,async client=>{
  const task=(await client.query<{input:unknown;model_config:ModelConfig;conversation_id:string;instructions:unknown;role:'admin'|'member'}>(`select r.input,r.model_config,r.conversation_id,r.instructions,u.role
   from agent_run r join app_user u on u.id=r.user_id join assistant_conversation c on c.id=r.conversation_id and c.user_id=r.user_id
   where r.id=$1 and r.user_id=$2 and r.status='completed' and u.status='active' and c.status='active'`,[context.runId,context.userId])).rows[0];
  if(!task)throw new Error('Recorded initial source unavailable');
  const input=inputSchema.parse(task.input),profile=modeConfigSchema.parse(task.model_config.profile);
  const original=(await client.query<{id:string;content:string}>(`select id,content from assistant_message where user_id=$1 and conversation_id=$2
   and role='user' and metadata->>'runId'=$3 order by created_at,id`,[context.userId,task.conversation_id,context.runId])).rows;
  if(original.length!==1||original[0].content!==input.content)throw new Error('Recorded original user message changed');
  const history=(await client.query<{id:string;role:'user'|'assistant';content:string}>(`select id,role,content from (select id,role,content,created_at from assistant_message
   where user_id=$1 and conversation_id=$2 and role in('user','assistant') and (metadata->>'runId' is null or metadata->>'runId'<>$3)
   and created_at < (select created_at from agent_run where id=$3::uuid and user_id=$1)
   order by created_at desc,id desc limit 12) h order by created_at,id`,[context.userId,task.conversation_id,context.runId])).rows;
  const ids=input.attachments.map(a=>a.assetId);
  const assets=ids.length?(await client.query<{id:string;source_sha256:string}>(`select a.id,a.source_sha256 from knowledge_asset a join knowledge_document d on d.id=a.document_id
   left join knowledge_tree_version v on v.id=d.current_tree_version_id
   where a.id=any($1::uuid[]) and d.status='active' and (d.owner_id=$2 or d.visibility='shared') and a.registration_status='registered'
   and (d.current_tree_version_id is null or (v.status='ready' and v.asset_id=a.id and v.source_sha256=a.source_sha256)) order by a.id`,[ids,context.userId])).rows:[];
  if(new Set(ids).size!==assets.length)throw new Error('Recorded attachment unavailable or superseded');
  const expected=initialTaskMessages({userId:context.userId,role:task.role,mode:profile.mode,knowledgeScope:input.knowledgeScope},input,task.model_config,history);
  const recorded=[messages[0],...messages.slice(2)];
  const initialInstructions=recorded.slice(expected.length),instructions=z.array(z.object({content:z.string()})).parse(task.instructions);
  if(initialInstructions.some((message,i)=>message.role!=='user'||message.content!==instructions[i]?.content))throw new Error('Recorded initial instructions changed');
  if(digest(recorded.slice(0,expected.length))!==digest(expected))throw new Error('Recorded initial conversation changed');
  return {initialSourceHash:digest({task,original,history,assets}),initialInstructionCount:initialInstructions.length,initialConversationProvenanceVerified:true as const,attachmentsCurrentlyAccessible:true as const};
 });
}
