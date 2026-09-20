import {tenantQuery} from "@/lib/rag/db";
import {encryptMailboxContent,decryptMailboxContent} from "@/lib/mailbox/crypto";
import {followUpContext} from "./follow-up-context";
import {generateFollowUp} from "./kimi-agent";
import {trackedOperation} from "@/lib/tracked-operation";

export async function listSavedFollowUps(userId:string,parentId:string){
  const rows=await tenantQuery<{id:string;created_at:string;changes:{draftCiphertext:string}}>(userId,`select e.id,e.created_at::text,e.changes from workspace_audit_event e
    join outbound_mail m on m.id::text=e.entity_id and m.user_id=e.actor_user_id
    where e.actor_user_id=$1 and m.id=$2 and e.action='follow-up.generated' order by e.created_at desc,e.id desc limit 10`,[userId,parentId]);
  return rows.filter(row=>row.changes.draftCiphertext).map(row=>({id:row.id,createdAt:row.created_at,...decryptMailboxContent(userId,row.changes.draftCiphertext)}));
}

export async function createFollowUpDraft(userId:string,input:{parentId:string;instructions:string}){
  const context=await followUpContext(userId,input.parentId);
  if(!context)return null;
  const {original,thread,inbound,stylePreferences,threadTruncated}=context;
  const generationInput={instructions:input.instructions,originalSubject:original.subject,originalBody:original.bodyText.slice(0,8000),thread,inbound,stylePreferences,threadTruncated};
  const generated=await trackedOperation(userId,"follow-up-generation",1+thread.length+inbound.length+stylePreferences.length,JSON.stringify(generationInput).length,
    ()=>generateFollowUp(generationInput),value=>({outputItems:1,validOutputItems:1,downstreamUsedItems:0,
      inputTokens:value.metrics?.promptTokens??null,outputTokens:value.metrics?.completionTokens??null,
      usageBoundary:"draft-generated-not-yet-reviewed-or-sent; tokens-from-final-response-only",
      optimizationOpportunity:"Reuse prior drafts and bounded correspondence before generating another version"}));
  const saved=await tenantQuery<{id:string}>(userId,`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
    values($1,$2,'outbound-mail',$3,'follow-up.generated',$4) returning id`,[context.workspaceId,userId,input.parentId,JSON.stringify({promptVersion:"follow-up-v2",model:generated.model,metrics:generated.metrics,threadMessages:thread.length,styleMemoryIds:stylePreferences.map(item=>item.id),threadTruncated,
    draftCiphertext:encryptMailboxContent(userId,{subject:generated.draft.subject,bodyText:generated.draft.body,sender:original.sender,recipients:original.recipients}),
    inputItems:1+thread.length+inbound.length+stylePreferences.length,inboundMessages:inbound.length,validOutputItems:1,downstreamUsedItems:0,usageState:"awaiting-user-review",optimizationOpportunity:"Reuse salutation without regenerating strategy; exclude duplicate parent from thread"})]);
  return {...generated,draftId:saved[0].id};
}
