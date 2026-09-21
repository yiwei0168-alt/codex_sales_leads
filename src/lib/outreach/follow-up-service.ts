import {tenantQuery} from "@/lib/rag/db";
import {encryptMailboxContent,decryptMailboxContent} from "@/lib/mailbox/crypto";
import {followUpContext} from "./follow-up-context";
import {generateFollowUp} from "./kimi-agent";
import {trackedOperation} from "@/lib/tracked-operation";

export async function listSavedFollowUps(userId:string,parentId:string){
  const rows=await tenantQuery<{id:string;created_at:string;draft_ciphertext:string}>(userId,`select d.id,d.created_at::text,d.draft_ciphertext from account_follow_up_draft d
    join outbound_mail m on m.id=d.parent_id and m.user_id=d.user_id
    where d.user_id=$1 and d.parent_id=$2 order by d.created_at desc,d.id desc limit 10`,[userId,parentId]);
  return rows.map(row=>({id:row.id,createdAt:row.created_at,...decryptMailboxContent(userId,row.draft_ciphertext)}));
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
  const saved=await tenantQuery<{id:string}>(userId,`insert into account_follow_up_draft(user_id,parent_id,draft_ciphertext,metadata)
    values($1,$2,$3,$4) returning id`,[userId,input.parentId,
    encryptMailboxContent(userId,{subject:generated.draft.subject,bodyText:generated.draft.body,sender:original.sender,recipients:original.recipients}),
    JSON.stringify({promptVersion:"follow-up-v2",model:generated.model,threadMessages:thread.length,styleMemoryIds:stylePreferences.map(item=>item.id),threadTruncated,inboundMessages:inbound.length})]);
  return {...generated,draftId:saved[0].id};
}
