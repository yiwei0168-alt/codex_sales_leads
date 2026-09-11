import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
const { query,tenantQuery,tenantTransaction,getPool }=await import("../src/lib/rag/db");
const { getCurrentWorkspace }=await import("../src/lib/sales/repository");
const { readTaskDetail }=await import("../src/lib/assistant/task-detail");
const { taskFeedSql,taskFeedSourceSql }=await import("../src/lib/assistant/task-feed");
const { findProductActionCompanies }=await import("../src/lib/assistant/product-actions");
const { developmentDependencyVersion }=await import("../src/lib/outreach/dependency-version");
try{
  const users=await query<{owner_id:string}>("select owner_id from market_workspace where slug='global-sales' and status='active' limit 1");
  if(!users[0])throw new Error("No active workspace for read-only verification");const userId=users[0].owner_id;
  const workspace=await getCurrentWorkspace(userId);if(!workspace)throw new Error("Workspace failed");
  await developmentDependencyVersion(userId);
  await findProductActionCompanies(userId,{kind:"library",companyQuery:"%_",countryCode:"GB",roles:["SI"]});
  const tasks=await tenantQuery<{id:string;kind:string}>(userId,taskFeedSql,[userId,'all','all','all',0]);
  await tenantQuery(userId,`${taskFeedSourceSql} select country,count(*) from feed where status in ('running','confirmed','sending') group by country`,[userId]);
  for(const kind of ['search','contacts','draft','send']){const task=tasks.find(item=>item.kind===kind);if(task)await readTaskDetail(userId,task.id,kind);}
  await tenantQuery(userId,"select id from user_relationship_analysis where user_id=$1 limit 1",[userId]);
  await tenantQuery(userId,"select message_id from mailbox_message_company where user_id=$1 limit 1",[userId]);
  await tenantQuery(userId,"select company_id from user_contact_lookup_cache where user_id=$1 limit 1",[userId]);
  await tenantQuery(userId,"select d.id,c.content from public_evidence.document_version d left join public_evidence.chunk c on c.document_version_id=d.id limit 1");
  const nodes=await tenantQuery<{id:string;workspace_id:string}>(userId,"select wc.company_id as id,wc.workspace_id from workspace_company wc join market_workspace w on w.id=wc.workspace_id where w.owner_id=$1 limit 2",[userId]);
  if(nodes.length===2){
    const rollback=new Error('intentional-ui-verification-rollback');
    try{await tenantTransaction(userId,async client=>{
      const run=await client.query<{id:string}>("insert into company_enrichment_run(workspace_id,provider_mix,target_count,status) values($1,'{}',1,'completed') returning id",[nodes[0].workspace_id]);
      await client.query("insert into user_contact_lookup_cache(user_id,company_id,provider,status,run_id,result) values($1,$2,'rollback-test','completed',$3,'{}')",[userId,nodes[0].id,run.rows[0].id]);
      const analysis=await client.query<{id:string}>("insert into user_relationship_analysis(user_id,workspace_id,country_code,from_company_id,to_company_id,fingerprint,status) values($1,$2,'ZZ',$3,$4,$5,'completed') returning id",[userId,nodes[0].workspace_id,nodes[0].id,nodes[1].id,run.rows[0].id]);
      const own=await client.query("select id from user_relationship_analysis where id=$1",[analysis.rows[0].id]);if(own.rowCount!==1)throw new Error('Owner RLS read failed');
      await client.query("insert into product_operation_metric(id,user_id,stage,status) values($1,$2,'verification','running')",[run.rows[0].id,userId]);
      const metricOwn=await client.query("select id from product_operation_metric where id=$1",[run.rows[0].id]);if(metricOwn.rowCount!==1)throw new Error('Owner metric read failed');
      await client.query("insert into user_spend_budget(user_id,limit_micros) values($1,0) on conflict(user_id) do nothing",[userId]);
      const ownBudget=await client.query("select user_id from user_spend_budget where user_id=$1 for update",[userId]);if(ownBudget.rowCount!==1)throw new Error('Owner budget read failed');
      await client.query("insert into paid_call_reservation(id,user_id,operation_id,stage,tariff_key,tariff_version,reserved_micros,status) values($1,$2,'rollback-only','verification','fixture','fixture',1,'reserved')",[run.rows[0].id,userId]);
      await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
      const other=await client.query("select id from user_relationship_analysis where id=$1",[analysis.rows[0].id]);
      const cache=await client.query("select company_id from user_contact_lookup_cache where run_id=$1",[run.rows[0].id]);
      const metricOther=await client.query("select id from product_operation_metric where id=$1",[run.rows[0].id]);if(metricOther.rowCount)throw new Error('Cross-owner metric read failed');
      const otherBudget=await client.query("select user_id from user_spend_budget where user_id=$1",[userId]);
      const otherReservation=await client.query("select id from paid_call_reservation where id=$1",[run.rows[0].id]);if(otherBudget.rowCount||otherReservation.rowCount)throw new Error('Cross-owner budget read failed');
      if(other.rowCount||cache.rowCount)throw new Error('Cross-owner RLS failed');throw rollback;
    });}catch(error){if(error!==rollback)throw error;}
  }
  console.log("PASS: application-role workspace/task reads and cache/analysis RLS; temporary verification writes rolled back; no model/mail calls.");
}finally{await getPool().end();}
