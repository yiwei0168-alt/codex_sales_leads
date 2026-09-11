import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {databaseConnectionString,databaseSslConfiguration} from '../src/lib/rag/database-ssl';
import {proposeSearchContinuationInTransaction} from '../src/lib/assistant/search-continuation';
nextEnv.loadEnvConfig(process.cwd());
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL||application;
if(!application||!migration)throw new Error('Database configuration missing');
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||'5432')!==(m.port||'5432')||a.pathname!==m.pathname)throw new Error('Migration target differs from application database');
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)}),client=await pool.connect();
try{
  await client.query('begin');await client.query('select pg_advisory_xact_lock(490049)');
  await client.query(await readFile('db/migrations/049_search_continuation.sql','utf8'));
  const workspaces=await client.query<{id:string;owner_id:string}>("select id,owner_id from market_workspace where slug='global-sales' and status='active' limit 1");
  const workspace=workspaces.rows[0];if(!workspace)throw new Error('An active workspace is required for rollback verification');
  await client.query('savepoint fixtures');await client.query('set local role network_copilot_app');
  await client.query("select set_config('app.current_user_id',$1,true)",[workspace.owner_id]);
  const conversation=await client.query<{id:string}>("insert into assistant_conversation(user_id,title) values($1,'rollback verification') returning id",[workspace.owner_id]);
  const parent=await client.query<{id:string}>(`insert into assistant_action(user_id,conversation_id,action_type,status,payload)
    values($1,$2,'lead-search','completed','{"countryCode":"CO","countryName":"Colombia","roles":["SI"],"targetCount":2}') returning id`,[workspace.owner_id,conversation.rows[0].id]);
  const thread=`rollback:${randomUUID()}`;
  await client.query("insert into lead_workflow_job(user_id,action_id,graph_thread_id,status) values($1,$2,$3,'completed')",[workspace.owner_id,parent.rows[0].id,thread]);
  const run=await client.query<{id:string}>("insert into lead_search_run(workspace_id,provider,target_count,country_code,graph_thread_id,status) values($1,'rollback',2,'CO',$2,'completed') returning id",[workspace.id,thread]);
  await client.query("update assistant_action set result=jsonb_build_object('accepted',1,'runId',$2::text) where id=$1",[parent.rows[0].id,run.rows[0].id]);
  await client.query(`insert into lead_candidate_assessment(user_id,run_id,candidate_id,company_name,domain,official_website_url,eligible,total_score,confidence,gates,dimensions,account_tier,supply_model,brand_involvement,summary,model,prompt_version)
    values($1,$2,'fixture','Fixture','fixture.test','https://fixture.test',true,60,50,'{}','{}','Standard','TBD','Standard','Rollback fixture','fixture','fixture')`,[workspace.owner_id,run.rows[0].id]);
  const result=await proposeSearchContinuationInTransaction(client,workspace.owner_id,parent.rows[0].id);
  const again=await proposeSearchContinuationInTransaction(client,workspace.owner_id,parent.rows[0].id);
  if(!again.reused||result.actionId!==again.actionId)throw new Error('Repeated proposal was not idempotent');
  const child=await client.query("select status,payload,result from assistant_action where id=$1",[result.actionId]);
  if(child.rows[0]?.status!=='proposed'||child.rows[0].payload.targetCount!==1)throw new Error('Proposal executed or wrong remaining target');
  const jobs=await client.query('select id from lead_workflow_job where action_id=$1',[result.actionId]);if(jobs.rowCount)throw new Error('Proposal created an executable job');
  const original=await client.query('select status,result from assistant_action where id=$1',[parent.rows[0].id]);
  if(original.rows[0].status!=='completed'||original.rows[0].result.accepted!==1)throw new Error('Parent result was mutated');
  await client.query("select set_config('app.current_user_id','00000000-0000-4000-8000-999999999999',true)");
  const other=await client.query('select child_action_id from lead_search_continuation where child_action_id=$1',[result.actionId]);if(other.rowCount)throw new Error('Cross-owner lineage read allowed');
  await client.query("select set_config('app.current_user_id',$1,true)",[workspace.owner_id]);
  await client.query('delete from assistant_conversation where id=$1 and user_id=$2',[conversation.rows[0].id,workspace.owner_id]);
  const removed=await client.query('select child_action_id from lead_search_continuation where child_action_id=$1',[result.actionId]);if(removed.rowCount)throw new Error('Conversation deletion left dangling lineage');
  await client.query('rollback to savepoint fixtures');
  await client.query(process.argv.includes('--apply')?'commit':'rollback');
  console.log(process.argv.includes('--apply')?'PASS: migration 049 applied; proposal/idempotency/RLS fixtures fully rolled back.':'PASS: proposal/idempotency/RLS verified; ALL schema and fixture changes rolled back.');
}catch(error){await client.query('rollback');throw error;}finally{client.release();await pool.end();}
