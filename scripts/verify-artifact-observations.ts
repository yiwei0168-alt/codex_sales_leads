import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {artifactObservations,saveArtifactObservations} from "../src/lib/leads/workflow/artifact-observations";
import {correctedCandidate,assessment} from "./workflow-recovery-fixtures";
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL||application;
if(!application||!migration)throw new Error("Database configuration missing");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||'5432')!==(m.port||'5432')||a.pathname!==m.pathname)throw new Error("Migration target differs");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const client=await pool.connect();
try{
  await client.query('begin');await client.query('select pg_advisory_xact_lock(540054)');
  await client.query(await readFile('db/migrations/054_artifact_observation_boundary.sql','utf8'));
  await client.query('savepoint fixtures');
  const userId=randomUUID(),workspaceId=randomUUID(),graphThreadId=`artifact-fixture:${randomUUID()}`;
  await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Artifact fixture','member','disabled')",[userId,`artifact-${userId}@fixture.invalid`]);
  await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Artifact fixture','Global','WW','Synthetic')",[workspaceId,userId]);
  await client.query('set local role network_copilot_app');
  await client.query("select set_config('app.current_user_id',$1,true)",[userId]);
  const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'Artifact fixture') returning id",[userId]);
  const action=await client.query<{id:string}>("insert into assistant_action(user_id,conversation_id,action_type,status,payload) values($1,$2,'lead-search','completed','{}') returning id",[userId,conversation.rows[0].id]);
  const run=await client.query<{id:string}>("insert into lead_search_run(workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,'fixture',1,'CO',$2,'completed') returning id",[workspaceId,graphThreadId]);
  const scope={userId,workspaceId,actionId:action.rows[0].id,runId:run.rows[0].id,graphThreadId};
  const events=artifactObservations({candidates:[correctedCandidate],assessments:[assessment],savedCount:1,countryCode:"CO"});
  await saveArtifactObservations(client,scope,events);await saveArtifactObservations(client,scope,events);
  const rows=await client.query<{event_type:string;artifact_count:number;metadata:Record<string,unknown>}>("select event_type,artifact_count,metadata from workflow_artifact_event where lead_run_id=$1",[scope.runId]);
  assert.equal(rows.rows.length,7);
  assert.deepEqual(rows.rows.filter(row=>['saved','delivery-selected'].includes(row.event_type)).map(row=>row.artifact_count),[1,1]);
  assert.equal(rows.rows.some(row=>['selected','displayed'].includes(row.event_type)),false);
  for(const row of rows.rows){assert.equal(row.metadata.userAdoptedItems,null);assert.equal(row.metadata.uiViewedItems,null);assert.equal(row.metadata.countryCode,'CO');}
  await assert.rejects(saveArtifactObservations(client,scope,events.map(event=>({...event,count:event.count+1}))),/conflicts/);
  await client.query("select set_config('app.current_user_id',$1,true)",[randomUUID()]);
  assert.equal((await client.query('select id from workflow_artifact_event where lead_run_id=$1',[scope.runId])).rowCount,0);
  await client.query('rollback to savepoint fixtures');
  await client.query(process.argv.includes('--apply')?'commit':'rollback');
  console.log(JSON.stringify({idempotentEvents:7,unknownAdoptionAndViews:true,countryAttribution:true,changedObservationRejected:true,
    tenantReadIsolation:true,fixtureRolledBack:true,migrationApplied:process.argv.includes('--apply'),paidCalls:0}));
}catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();}
