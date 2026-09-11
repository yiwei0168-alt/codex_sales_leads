import { tenantTransaction } from "@/lib/rag/db";
import { embedTextsWithUsage } from "@/lib/rag/openai-provider";
import type { MemoryEditorInput } from "./memory-editor";

export async function saveManualMemory(userId:string,input:MemoryEditorInput){
  const startedAt=Date.now();
  return tenantTransaction(userId,async client=>{
    // Stable ID prevents duplicate records when a client retries a create.
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:memory:${input.id}`]);
    const current=await client.query<{content:string;kind:string;updated_at:string;workspace_id:string|null}>(
      "select content,kind,updated_at::text,workspace_id from user_outreach_memory where user_id=$1 and id=$2 for update",[userId,input.id]);
    const row=current.rows[0];
    if(input.mode==="create"&&row)return "already-exists";
    if(input.mode==="edit"&&!row)return "not-found";
    if(row&&(!["email-style","user-approved-marketing-claim"].includes(row.kind)||row.kind!==input.kind))return "source-managed";
    if(row&&row.updated_at!==input.expectedUpdatedAt)return "conflict";
    const changed=!row||row.content!==input.content;
    const embedded=changed?await embedTextsWithUsage([input.content]):{embeddings:[],usage:[]};
    const scope=input.kind==="user-approved-marketing-claim"&&input.externalUseApproved?"external-use-approved":"internal-learning";
    const context=JSON.stringify({provenance:"user-confirmed-manual",objectiveFact:false,scoringEvidence:false});
    if(row)await client.query(`update user_outreach_memory set title=$3,content=$4,market_codes=$5,channel_roles=$6,
      usage_scope=$7,context=context||$8::jsonb,embedding=case when $9::boolean then $10::vector else embedding end,updated_at=now()
      where user_id=$1 and id=$2`,[userId,input.id,input.title,input.content,input.marketCodes,input.channelRoles,scope,context,changed,changed?`[${embedded.embeddings[0].join(",")}]`:null]);
    else await client.query(`insert into user_outreach_memory(id,user_id,kind,external_id,title,content,market_codes,channel_roles,usage_scope,context,embedding)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::vector)`,[input.id,userId,input.kind,`manual:${input.id}`,input.title,input.content,input.marketCodes,input.channelRoles,scope,context,`[${embedded.embeddings[0].join(",")}]`]);
    console.info(JSON.stringify({event:"workflow-efficiency",stage:"manual-memory-save",version:"ui-v1.1-4c",inputItems:1,
      inputCharacters:input.content.length,validOutputItems:1,downstreamUsedItems:1,usageBoundary:"transaction-write",
      embeddingUsage:embedded.usage,inputTokens:embedded.usage.reduce((sum,item)=>sum+item.inputTokens,0),outputTokens:0,
      costUsd:changed?null:0,costState:changed?"embedding-price-unallocated":"no-paid-call",apiCredits:0,retries:null,
      latencyMs:Date.now()-startedAt,discardedReasonCounts:{},utilizationEfficiency:1,
      optimizationOpportunity:"Reuse vector when only title or scope changes"}));
    return "ok";
  });
}
