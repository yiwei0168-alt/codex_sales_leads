import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool,type PoolClient} from 'pg';
import {getPool} from '../src/lib/rag/db';
import {importSkill,changeSkill,readSkill,listSkills} from '../src/lib/assistant/main/skills';
import {admitSkillCatalogWrite} from '../src/lib/assistant/main/skill-catalog-admission';
import {digest} from '../src/lib/assistant/main/contracts';

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_METHOD_CATALOG,'1','Dedicated disposable database required');
process.env.PGOPTIONS='-c statement_timeout=15000';
const admin=new URL(process.env.DATABASE_MIGRATION_URL!),app=new URL(process.env.DATABASE_URL!);
assert(['localhost','127.0.0.1'].includes(admin.hostname));assert.equal(admin.host+admin.pathname,app.host+app.pathname);
const pool=new Pool({connectionString:admin.toString()}),owner=randomUUID(),sharedOwner=randomUUID(),peer=randomUUID();
const context={userId:owner,role:'member' as const},globalContext={userId:sharedOwner,role:'admin' as const};
const input=(name:string)=>({name,source:'synthetic-catalog-fixture',files:{'SKILL.md':'Read only synthetic recorded evidence.'},dependencies:[]});
const waitingOn=async(pid:number)=>Number((await pool.query(`with recursive waiting(pid) as (
 select $1::int union select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid)))
 select count(*) n from waiting where pid<>$1`,[pid])).rows[0].n);
const waitFor=async(pid:number,count:number)=>{
 for(let i=0;i<150;i++){if(await waitingOn(pid)===count)return;await new Promise(resolve=>setTimeout(resolve,20));}
 assert.equal(await waitingOn(pid),count,'Expected catalog writers to wait for the retained source gate');
};
const holder=async()=>{
 const client=await pool.connect();await client.query('begin');await client.query('set local role network_copilot_app');
 await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[owner]);
 await client.query('select lock_skill_method_catalog_sources()');return client;
};
const release=async(client:PoolClient)=>{await client.query('rollback');client.release();};
try{
 assert.equal((await pool.query('select count(*)::int n from app_user')).rows[0].n,1,'Fresh placeholder-only database required');
 await pool.query(await readFile('db/migrations/148_skill_decision_memory_source_locks.sql','utf8'));
 for(const [id,role] of [[owner,'member'],[sharedOwner,'admin'],[peer,'member']])
  await pool.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic method catalog',$3,'active')",[id,`${id}@example.invalid`,role]);
 const own=await importSkill(context,input('Synthetic legacy compatible method'));
 await pool.query(await readFile('db/migrations/151_skill_pinned_method_source_locks.sql','utf8'));
 const sql=await readFile('db/migrations/152_skill_catalog_source_admission.sql','utf8');await pool.query(sql);await pool.query(sql);
 const controlled=await importSkill(context,input('Synthetic controlled method')),stable=await importSkill(context,input('Synthetic stable method'));
 const shared=await importSkill(globalContext,input('Synthetic published method')),hidden=await importSkill(globalContext,input('Synthetic hidden method'));
 await changeSkill(context,{id:controlled.id,version:1,operation:'enable'},true);
 await changeSkill(context,{id:stable.id,version:1,operation:'enable'},true);
 await changeSkill(globalContext,{id:shared.id,version:1,operation:'publish'},true);
 const conversation=randomUUID(),runs=[randomUUID(),randomUUID()];
 await pool.query('insert into assistant_conversation(id,user_id) values($1,$2)',[conversation,owner]);
 for(const run of runs)await pool.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
  values($1,$2,$3,$1::uuid::text,$4,'{}','{}','completed','main-agent')`,[run,owner,conversation,digest('Synthetic catalog task')]);
 assert(await readSkill({...context,runId:runs[0],leaseToken:'synthetic'},shared.id));
 const before=digest(await listSkills(owner));
 const held=await holder();let writes:Promise<unknown>[]=[];
 try{
  // Another account's private creation does not affect this catalog.
  await importSkill({userId:peer,role:'member'},input('Unrelated private peer method'));
  assert.equal(digest(await listSkills(owner)),before);
  // A future final update may use the already-held owner gate without upgrading.
  await admitSkillCatalogWrite(held,controlled.id);
  await held.query('update agent_skill set enabled=enabled where id=$1',[controlled.id]);
  const pid=(await held.query('select pg_backend_pid() pid')).rows[0].pid as number;
  writes=[
   importSkill(context,input('New owned catalog entry')),
   importSkill(context,{...input('New owned version'),skillId:own.id,expectedVersion:1}),
   changeSkill(context,{id:controlled.id,version:1,operation:'disable'},true),
   changeSkill(globalContext,{id:hidden.id,version:1,operation:'publish'},true),
   pool.query('update agent_skill set published=false where id=$1',[shared.id]),
   pool.query('update agent_skill_version set source=source where skill_id=$1',[stable.id]),
   readSkill({...context,runId:runs[1],leaseToken:'synthetic'},stable.id),
   pool.query('update agent_run_skill set version=version where user_id=$1 and run_id=$2',[owner,runs[0]]),
  ];
  for(const work of writes)void work.catch(()=>undefined);
  await waitFor(pid,8);
  // Import/change must wait before holding the method row: this read would
  // deadlock if a queued writer had prelocked it before source admission.
  await held.query("set local statement_timeout='2s'");
  assert.equal((await held.query('select id from agent_skill where id=$1 for share',[own.id])).rows.length,1);
  assert.equal(digest(await listSkills(owner)),before);
 }finally{await release(held);}
 await Promise.all(writes);
 assert.notEqual(digest(await listSkills(owner)),before);
 assert.equal((await pool.query('select version from agent_run_skill where user_id=$1 and run_id=$2',[owner,runs[1]])).rows[0].version,1);
 // A formerly public method remains visible through this account's old pin.
 await pool.query("update agent_skill set scope='account',published=false where id=$1",[shared.id]);
 await pool.query("update app_user set role='member' where id=$1",[sharedOwner]);
 assert((await listSkills(owner)).some(row=>(row as {id:string}).id===shared.id));
 const historic=await holder();let oldPinWrite:Promise<unknown>|undefined;
 try{
  const pid=(await historic.query('select pg_backend_pid() pid')).rows[0].pid as number;
  oldPinWrite=importSkill({userId:sharedOwner,role:'member'},{...input('Former shared method update'),skillId:shared.id,expectedVersion:1});
  void oldPinWrite.catch(()=>undefined);await waitFor(pid,1);
  await historic.query("set local statement_timeout='2s'");
  assert.equal((await historic.query('select lock_skill_pinned_method_sources($1::uuid[]) n',[[runs[0]]])).rows[0].n,1);
 }finally{await release(historic);}
 await oldPinWrite;
 // The row trigger also catches a scoped privileged version rewrite whose
 // statement actor has been demoted and whose source now has account scope.
 const oldVersion=await holder();let scopedWrite:Promise<unknown>|undefined;
 try{
  const pid=(await oldVersion.query('select pg_backend_pid() pid')).rows[0].pid as number;
  scopedWrite=(async()=>{const client=await pool.connect();try{await client.query('begin');
   await client.query("select set_config('app.current_user_id',$1,true),set_config('app.current_user_role','member',true)",[sharedOwner]);
   await client.query('update agent_skill_version set source=source where skill_id=$1',[shared.id]);await client.query('commit');
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}})();
  void scopedWrite.catch(()=>undefined);await waitFor(pid,1);
 }finally{await release(oldVersion);}
 await scopedWrite;
 const grants=(await pool.query(`select
  has_function_privilege('network_copilot_skill_collector','lock_skill_method_catalog_sources()','EXECUTE') as collector_read,
  has_function_privilege('network_copilot_skill_collector','lock_skill_method_catalog_writes(uuid)','EXECUTE') as collector_write,
  has_table_privilege('network_copilot_app','agent_skill_version','UPDATE') as version_update,
  has_table_privilege('network_copilot_app','agent_run_skill','UPDATE') as pin_update`)).rows[0];
 assert.deepEqual(grants,{collector_read:false,collector_write:false,version_update:false,pin_update:false});
 console.log(JSON.stringify({methodCatalogSourceLocksDatabase:'passed',legacyWriteWithoutReaderMigrationVerified:true,
  eightCatalogWritersBlocked:true,writersResumeAfterRelease:true,otherAccountPrivateCreationContinues:true,
  catalogStableWhileHeld:true,productWriterAdmissionPrecedesRowLocks:true,ownerUpdateUnderSourceGateCompletes:true,
  formerlySharedPinnedMethodStillProtected:true,scopedPrivilegedVersionRewriteBlocked:true,migrationIdempotent:true,
  tableWriteGrantsUnchanged:true,actualModelCalls:0,automaticActivation:false}));
}finally{await pool.end();await getPool().end();}
