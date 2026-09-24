import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {getPool,tenantQuery} from "../src/lib/rag/db";
import {processMemoryGraphOutbox} from "../src/lib/knowledge/memory-graph-outbox";
import {graphObservationIds,searchMemoryWithGraph} from "../src/lib/knowledge/memory-graph-search";

nextEnv.loadEnvConfig(process.cwd());
const databaseUrl=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!databaseUrl||!["localhost","127.0.0.1","::1"].includes(new URL(databaseUrl).hostname))throw new Error("Local PostgreSQL required");
const admin=new Pool({connectionString:databaseUrl});
try{
  const [item]= (await admin.query<{observation_id:string;owner_id:string;content:string;market_codes:string[];company_ids:string[]}>(`select o.observation_id,m.owner_id,m.content,m.market_codes,m.company_ids
    from agent_memory_graph_outbox o join agent_memory_observation m on m.id=o.observation_id
    join app_user u on u.id=m.owner_id and u.status='active'
    where o.delivered_at is null and o.next_attempt_at<=now() and length(m.content)<=12000
      and m.market_code is null and m.company_id is null
      and not exists(select 1 from agent_memory_observation r where r.owner_id=m.owner_id
        and (r.corrects_id=m.id or r.invalidates_id=m.id))
    order by o.created_at limit 1`)).rows;
  if(!item){console.log(JSON.stringify({local:true,eligible:false}));}
  else{
    const status=await processMemoryGraphOutbox(item.owner_id,item.observation_id);
    if(status!=="delivered")throw new Error(`Real outbox projection did not complete: ${status}`);
    const term=item.content.trim().slice(0,Math.min(20,item.content.trim().length));
    const graphIds=await graphObservationIds(item.owner_id,term);
    if(!graphIds.includes(item.observation_id))throw new Error("Projected observation absent from account graph candidates");
    if((await graphObservationIds(randomUUID(),term)).includes(item.observation_id))throw new Error("Graph candidate crossed accounts");
    const now=new Date().toISOString();
    const checked=await searchMemoryWithGraph(item.owner_id,term,now,now,
      {marketCode:item.market_codes[0],companyId:item.company_ids[0]});
    if(checked.path!=="graph"||!checked.rows.some(row=>row.id===item.observation_id))
      throw new Error("PostgreSQL did not validate the graph candidate");
    const [receipt]=await tenantQuery<{delivered_at:Date;attempt_count:number}>(item.owner_id,
      "select delivered_at,attempt_count from agent_memory_graph_outbox where observation_id=$1",[item.observation_id]);
    if(!receipt?.delivered_at)throw new Error("PostgreSQL outbox delivery receipt missing");
    const replay=await processMemoryGraphOutbox(item.owner_id,item.observation_id);
    if(replay!=="busy")throw new Error("Delivered outbox was processed again");
    console.log(JSON.stringify({local:true,realObservation:true,delivered:true,graphCandidate:true,
      postgresRevalidated:true,crossAccountDenied:true,replayDenied:true,attemptCount:receipt.attempt_count,
      externalCalls:0}));
  }
}finally{await admin.end();await getPool().end();}
