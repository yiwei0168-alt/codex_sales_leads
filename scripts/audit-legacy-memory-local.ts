import nextEnv from "@next/env";
import {Pool} from "pg";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url||!["localhost","127.0.0.1","::1"].includes(new URL(url).hostname))throw new Error("Local PostgreSQL required");
const pool=new Pool({connectionString:url});
try{
  for(const table of ["user_outreach_memory","agent_memory","agent_memory_version","agent_memory_observation"]){
    const result=await pool.query<{count:number}>(`select count(*)::int as count from ${table}`);
    console.log(JSON.stringify({table,count:result.rows[0].count}));
  }
  const statuses=await pool.query<{status:string;count:number}>("select status,count(*)::int as count from user_outreach_memory group by status order by status");
  console.log(JSON.stringify({outreachStatuses:statuses.rows}));
  const groups=await pool.query<{kind:string;usage_scope:string;count:number}>("select kind,usage_scope,count(*)::int as count from user_outreach_memory group by kind,usage_scope order by kind,usage_scope");
  console.log(JSON.stringify({outreachGroups:groups.rows}));
  const mirrored=await pool.query<{observations:number;outbox:number;notices:number;unknownValidity:number;sourceMismatches:number}>(`
    select count(*)::int observations,
      count(o.observation_id)::int outbox,count(n.observation_id)::int notices,
      count(*) filter(where m.valid_from is null)::int "unknownValidity",
      count(*) filter(where m.owner_id<>u.user_id or m.content<>u.content
        or m.source_receipt->>'usageScope'<>u.usage_scope
        or m.source_receipt->>'status'<>u.status)::int "sourceMismatches"
    from user_outreach_memory u join agent_memory_observation m
      on m.source_receipt->>'legacyId'=u.id::text and m.source_receipt->>'type'='legacy-user-outreach-memory'
    left join agent_memory_graph_outbox o on o.observation_id=m.id
    left join agent_memory_notice n on n.observation_id=m.id`);
  console.log(JSON.stringify({legacyMirror:mirrored.rows[0]}));
  const pending=await pool.query<{pending:number;activeOwners:number;unscopedLegacyFields:number;withinGraphLimit:number}>(`
    select count(*) filter(where o.delivered_at is null and o.next_attempt_at<=now())::int pending,
      count(*) filter(where u.status='active')::int "activeOwners",
      count(*) filter(where m.market_code is null and m.company_id is null)::int "unscopedLegacyFields",
      count(*) filter(where length(m.content)<=12000)::int "withinGraphLimit"
    from agent_memory_graph_outbox o join agent_memory_observation m on m.id=o.observation_id
    join app_user u on u.id=m.owner_id`);
  console.log(JSON.stringify({projectionEligibility:pending.rows[0]}));
  const failed=await pool.query<{attempt_count:number;last_error:string|null}>(`
    select attempt_count,last_error from agent_memory_graph_outbox where attempt_count>0
    order by created_at desc limit 1`);
  console.log(JSON.stringify({latestProjectionAttempt:failed.rows[0]??null}));
  const lengths=await pool.query<{min_length:number;max_length:number}>(`
    select min(length(content))::int min_length,max(length(content))::int max_length
    from agent_memory_observation where source_receipt->>'type'='legacy-user-outreach-memory'`);
  console.log(JSON.stringify({legacyContentLengths:lengths.rows[0]}));
}finally{await pool.end();}
