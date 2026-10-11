/** Read-only evidence inventory; operation completion never certifies method success. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {skillSourcesCurrent,type SourcedSkillVersion} from '../src/lib/assistant/main/skill-source-guard';
nextEnv.loadEnvConfig(process.cwd());
const email=process.argv.find(arg=>arg.startsWith('--account-email='))?.slice('--account-email='.length);
assert(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Explicit account email required');
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(connectionString&&['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname),'Local database required');
const pool=new Pool({connectionString}),client=await pool.connect();
try{
 await client.query('begin isolation level repeatable read read only');
 await client.query("set local statement_timeout='15s'");
 const users=(await client.query('select id from app_user where lower(email)=lower($1)',[email])).rows;
 assert.equal(users.length,1,'Exact account required');const owner=users[0].id;
 const versions=(await client.query<SourcedSkillVersion&{enabled:boolean}>(`
  select v.source,v.validation,v.content_hash,v.files,s.scope,s.owner_id,s.enabled
  from agent_skill s join agent_skill_version v on v.skill_id=s.id and v.version=s.current_version
  where s.owner_id=$1`,[owner])).rows;
 let reports=0,currentReports=0,imported=0,enabled=0;
 for(const version of versions){
  if(version.enabled)enabled++;
  const tagged=version.source.startsWith('local-experience:')||(version.validation as {sourceQuality?:string})?.sourceQuality==='repeated-user-report-unverified';
  if(tagged){reports++;if(await skillSourcesCurrent(client,owner,version))currentReports++;}else imported++;
 }
 const observations=(await client.query(`select count(*)::int as total,
  count(*) filter(where source_receipt->>'usage'='unverified-user-experience')::int as unverified
  from agent_memory_observation where owner_id=$1 and kind='experience'`,[owner])).rows[0];
 const runs=(await client.query("select count(*)::int as completed from agent_run where user_id=$1 and execution_kind='main-agent' and status='completed'",[owner])).rows[0];
 const counts:Record<string,number>={};
 for(const table of ['agent_skill_shadow_campaign','agent_skill_shadow_job','agent_skill_replay','agent_skill_replay_review','agent_skill_shadow_review','agent_skill_blind_round','agent_skill_blind_judgment'])
  counts[table]=(await client.query(`select count(*)::int as n from ${table} where owner_id=$1`,[owner])).rows[0].n;
 console.log(JSON.stringify({scope:'explicit-account-current-skill-source-inventory',readOnly:true,
  currentSkills:versions.length,enabledSkills:enabled,importedOrNonExperienceSkills:imported,
  repeatedReportDrafts:reports,currentRepeatedReportSources:currentReports,experienceObservations:observations,
  completedMainRuns:runs.completed,evaluationRows:counts,
  methodSuccessCertified:false,activationAuthorized:false,newModelCalls:0,
  limitations:['Completed runs and successful tool receipts do not prove task or method quality.',
   'Current repeated reports remain user reports, not independently verified success.',
   'Review row counts do not establish accepted quality, complete categories or production equivalence.']}));
 await client.query('rollback');
}finally{await client.query('rollback').catch(()=>undefined);client.release();await pool.end();}
