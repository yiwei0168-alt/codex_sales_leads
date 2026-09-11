import { z } from "zod";
import { tenantQuery, tenantTransaction } from "@/lib/rag/db";

export const memoryChangeSchema=z.object({id:z.uuid(),operation:z.enum(["activate","archive","delete"]),confirmed:z.literal(true)}).strict();
export interface MemoryItem {
  id:string;kind:string;title:string;content:string;status:"active"|"archived";
  marketCodes:string[];channelRoles:string[];usageScope:string;updatedAt:string;
}
export async function listMemories(userId:string,offset:number) {
  return tenantQuery<MemoryItem>(userId,`select id,kind,title,content,status,market_codes as "marketCodes",
    channel_roles as "channelRoles",usage_scope as "usageScope",updated_at::text as "updatedAt"
    from user_outreach_memory where user_id=$1 order by updated_at desc,id desc limit 51 offset $2`,[userId,offset]);
}
export async function changeMemory(userId:string,input:z.infer<typeof memoryChangeSchema>) {
  const startedAt=Date.now();
  return tenantTransaction(userId,async client=>{
    const found=await client.query<{kind:string;workspace_id:string|null}>(
      "select kind,workspace_id from user_outreach_memory where user_id=$1 and id=$2 for update",[userId,input.id]);
    if(!found.rows[0])return "not-found";
    // This record mirrors authoritative company state, not a reusable preference.
    if(found.rows[0].kind==="company-classification")return "source-managed";
    if(input.operation==="delete")await client.query("delete from user_outreach_memory where user_id=$1 and id=$2",[userId,input.id]);
    else await client.query("update user_outreach_memory set status=$3,updated_at=now() where user_id=$1 and id=$2",[userId,input.id,input.operation==="activate"?"active":"archived"]);
    if(found.rows[0].workspace_id)await client.query(`insert into workspace_audit_event(workspace_id,actor_user_id,entity_type,entity_id,action,changes)
      values($1,$2,'private-memory',$3,'memory.lifecycle',$4)`,[found.rows[0].workspace_id,userId,input.id,JSON.stringify({operation:input.operation})]);
    console.info(JSON.stringify({event:"workflow-efficiency",stage:"private-memory-lifecycle",version:"ui-v1.1-4b",
      inputItems:1,validOutputItems:1,downstreamUsedItems:1,usageBoundary:"transaction-mutation",inputTokens:0,outputTokens:0,
      paidApiCostUsd:0,apiCredits:0,latencyMs:Date.now()-startedAt,retries:0,discardedReasonCounts:{},utilizationEfficiency:1,
      optimizationOpportunity:"Lifecycle changes reuse vectors and never call a model"}));
    return "ok";
  });
}
