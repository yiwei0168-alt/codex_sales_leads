import {tenantQuery,tenantTransaction} from "@/lib/rag/db";
import type {ExecutionContext} from "./contracts";

/** Inventory includes inactive records so an owner can restore a prior decision. */
export async function listAgentMemory(userId:string,offset:number){
  return tenantQuery(userId,`select m.id,m.scope,m.kind,m.memory_key,m.current_version,m.mandatory,m.source_kind,
    m.market_codes,m.company_ids,m.valid_until,m.active,m.updated_at::text as "updatedAt",
    v.content,v.source_run_id,v.source_message_id
    from agent_memory m join agent_memory_version v on v.memory_id=m.id and v.version=m.current_version
    where m.owner_id=$1 order by m.updated_at desc,m.id limit 51 offset $2`,[userId,offset]);
}

export async function setAgentMemoryActive(context:ExecutionContext,input:{id:string;version:number;expectedUpdatedAt:string;active:boolean},mode:"preference"|"decision"|"global"="preference"){
  return tenantTransaction(context.userId,async client=>{
    const rows=await client.query<{scope:string;kind:string;current_version:number;updated_at:string;active:boolean}>(
      `select scope,kind,current_version,updated_at::text,active from agent_memory
       where owner_id=$1 and id=$2 for update`,[context.userId,input.id]);
    const current=rows.rows[0];
    if(!current)return "not-found";
    if(mode==="global"?(current.scope!=="global"||context.role!=="admin"):
      (current.scope!=="account"||(mode==="preference")!==(current.kind==="preference")))return "forbidden";
    if(current.current_version!==input.version||current.updated_at!==input.expectedUpdatedAt)return "conflict";
    if(current.active===input.active)return "unchanged";
    await client.query("update agent_memory set active=$3,updated_at=clock_timestamp() where owner_id=$1 and id=$2",[context.userId,input.id,input.active]);
    return "updated";
  },context.role);
}
