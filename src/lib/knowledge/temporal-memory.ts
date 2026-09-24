import {tenantQuery,tenantTransaction} from "@/lib/rag/db";

export type MemoryObservationInput={kind:"preference"|"experience"|"business-fact"|"method";content:string;sourceReceipt:Record<string,unknown>;marketCode?:string;companyId?:string;validFrom?:string|null;validUntil?:string|null;confidence?:number;correctsId?:string;invalidatesId?:string};

/** Automatic observations remain private internal context; they never publish policy or score facts. */
export async function observeMemory(userId:string,input:MemoryObservationInput){
  if(!input.content.trim()||!Object.keys(input.sourceReceipt).length)throw new Error("Memory requires content and source receipt");
  if(input.confidence!==undefined&&(input.confidence<0||input.confidence>1))throw new Error("Invalid confidence");
  return tenantTransaction(userId,async client=>{
    const result=await client.query<{id:string}>(`insert into agent_memory_observation
      (owner_id,market_code,company_id,kind,content,source_receipt,valid_from,valid_until,confidence,visibility,corrects_id,invalidates_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'private',$10,$11) returning id`,
      [userId,input.marketCode??null,input.companyId??null,input.kind,input.content.trim(),JSON.stringify(input.sourceReceipt),
        input.validFrom??null,input.validUntil??null,input.confidence??null,input.correctsId??null,input.invalidatesId??null]);
    await client.query("insert into agent_memory_graph_outbox(observation_id) values($1)",[result.rows[0].id]);
    return result.rows[0].id;
  });
}

/** Two clocks: business validity and the system's knowledge at an earlier instant. */
export async function memoryAt(userId:string,businessAt:string,knownAt:string,scope:{marketCode?:string;companyId?:string}={}){
  return tenantQuery<{id:string;kind:string;content:string;recorded_at:string;valid_from:string|null;valid_until:string|null;source_receipt:Record<string,unknown>}>(userId,`
    select m.id,m.kind,m.content,m.recorded_at,m.valid_from,m.valid_until,m.source_receipt
    from agent_memory_observation m where m.owner_id=$1 and m.recorded_at<=$2::timestamptz
      and (m.market_code is null or m.market_code=$4) and (m.company_id is null or m.company_id=$5)
      and m.valid_from is not null and m.valid_from<=$3::timestamptz
      and (m.valid_until is null or m.valid_until>$3::timestamptz)
      and not exists(select 1 from agent_memory_observation correction where correction.owner_id=$1
        and correction.recorded_at<=$2::timestamptz and (correction.corrects_id=m.id or correction.invalidates_id=m.id))
    order by m.recorded_at desc limit 100`,[userId,knownAt,businessAt,scope.marketCode??null,scope.companyId??null]);
}
