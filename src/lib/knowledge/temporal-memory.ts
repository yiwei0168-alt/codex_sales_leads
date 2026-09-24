import {createHash} from "node:crypto";
import {tenantQuery,tenantTransaction} from "@/lib/rag/db";

export type MemoryObservationInput={kind:"preference"|"experience"|"business-fact"|"method";content:string;sourceReceipt:Record<string,unknown>;memoryKey?:string;idempotencyKey?:string;marketCode?:string;companyId?:string;validFrom?:string|null;validUntil?:string|null;confidence?:number;correctsId?:string;invalidatesId?:string};

function stableJson(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stableJson).join(",")}]`;
  if(value!==null&&typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  return JSON.stringify(value)??"null";
}

/** Automatic observations remain private internal context; they never publish policy or score facts. */
export async function observeMemory(userId:string,input:MemoryObservationInput){
  const content=input.content.trim();
  const memoryKey=input.memoryKey?.trim()||null;
  if(!content||!Object.keys(input.sourceReceipt).length)throw new Error("Memory requires content and source receipt");
  if(input.confidence!==undefined&&(input.confidence<0||input.confidence>1))throw new Error("Invalid confidence");
  if(input.validFrom&&input.validUntil&&new Date(input.validUntil)<=new Date(input.validFrom))throw new Error("Invalid business validity interval");
  if(input.correctsId&&input.invalidatesId)throw new Error("A memory cannot correct and invalidate together");
  const idempotencyKey=input.idempotencyKey?.trim()||createHash("sha256").update(stableJson({
    kind:input.kind,content,memoryKey,sourceReceipt:input.sourceReceipt,marketCode:input.marketCode??null,
    companyId:input.companyId??null,validFrom:input.validFrom??null,validUntil:input.validUntil??null,
    correctsId:input.correctsId??null,invalidatesId:input.invalidatesId??null,
  })).digest("hex");
  return tenantTransaction(userId,async client=>{
    if(memoryKey)await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))",[`${userId}:${input.kind}:${memoryKey}:${input.marketCode??""}:${input.companyId??""}`]);
    for(const targetId of [input.correctsId,input.invalidatesId].filter(Boolean)){
      const target=await client.query("select id from agent_memory_observation where id=$1 and owner_id=$2",[targetId,userId]);
      if(target.rowCount!==1)throw new Error("Memory target is unavailable");
    }
    const result=await client.query<{id:string}>(`insert into agent_memory_observation
      (owner_id,market_code,company_id,kind,content,source_receipt,valid_from,valid_until,confidence,visibility,corrects_id,invalidates_id,memory_key,idempotency_key)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,'private',$10,$11,$12,$13)
      on conflict (owner_id,idempotency_key) where idempotency_key is not null do nothing returning id`,
      [userId,input.marketCode??null,input.companyId??null,input.kind,content,JSON.stringify(input.sourceReceipt),
        input.validFrom??null,input.validUntil??null,input.confidence??null,input.correctsId??null,input.invalidatesId??null,
        memoryKey,idempotencyKey]);
    if(!result.rows.length){
      const existing=await client.query<{id:string;content:string}>("select id,content from agent_memory_observation where owner_id=$1 and idempotency_key=$2",[userId,idempotencyKey]);
      if(!existing.rows.length)throw new Error("Memory replay could not be resolved");
      if(existing.rows[0].content!==content)throw new Error("Memory idempotency key reused with different content");
      return existing.rows[0].id;
    }
    const id=result.rows[0].id;
    await client.query("insert into agent_memory_graph_outbox(observation_id) values($1)",[id]);
    await client.query("insert into agent_memory_notice(observation_id,owner_id) values($1,$2)",[id,userId]);
    if(memoryKey&&!input.invalidatesId){
      await client.query(`insert into agent_memory_conflict(owner_id,earlier_id,later_id)
        select $1,m.id,$2 from agent_memory_observation m
        where m.owner_id=$1 and m.id<>$2 and m.kind=$3 and m.memory_key=$4
          and m.market_code is not distinct from $5::text and m.company_id is not distinct from $6::text
          and m.content<>$7 and m.invalidates_id is null
          and not exists(select 1 from agent_memory_observation r where r.owner_id=$1 and (r.corrects_id=m.id or r.invalidates_id=m.id))
          and (m.valid_until is null or $8::timestamptz is null or m.valid_until>$8::timestamptz)
          and ($9::timestamptz is null or m.valid_from is null or $9::timestamptz>m.valid_from)
        on conflict (earlier_id,later_id) do nothing`,
        [userId,id,input.kind,memoryKey,input.marketCode??null,input.companyId??null,content,input.validFrom??null,input.validUntil??null]);
    }
    return id;
  });
}

/** Undo is an immutable invalidation and remains visible on the historical timeline. */
export async function undoMemory(userId:string,targetId:string){
  return observeMemory(userId,{kind:"experience",content:`撤销记忆 ${targetId}`,
    sourceReceipt:{type:"user-undo",targetId},invalidatesId:targetId,idempotencyKey:`undo:${targetId}`});
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

export async function memoryTimeline(userId:string,limit=50){
  return tenantQuery<{id:string;kind:string;content:string;recorded_at:string;valid_from:string|null;valid_until:string|null;corrects_id:string|null;invalidates_id:string|null;source_receipt:Record<string,unknown>}>(userId,
    `select id,kind,content,recorded_at,valid_from,valid_until,corrects_id,invalidates_id,source_receipt
     from agent_memory_observation where owner_id=$1 order by recorded_at desc,id desc limit $2`,[userId,Math.max(1,Math.min(100,limit))]);
}

export async function memoryNotices(userId:string,limit=50){
  return tenantQuery<{observation_id:string;created_at:string;read_at:string|null;kind:string;content:string}>(userId,
    `select n.observation_id,n.created_at,n.read_at,m.kind,m.content from agent_memory_notice n
     join agent_memory_observation m on m.id=n.observation_id where n.owner_id=$1
     order by n.created_at desc limit $2`,[userId,Math.max(1,Math.min(100,limit))]);
}

export async function memoryConflicts(userId:string,limit=50){
  return tenantQuery<{id:string;earlier_id:string;later_id:string;status:string;created_at:string}>(userId,
    `select id,earlier_id,later_id,status,created_at from agent_memory_conflict
     where owner_id=$1 and status='open' order by created_at desc limit $2`,[userId,Math.max(1,Math.min(100,limit))]);
}
