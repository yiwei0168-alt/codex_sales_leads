import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve,relative} from 'node:path';
import nextEnv from '@next/env';
import {Client} from 'pg';
import {previewOrphanAssetSnapshots,pruneOrphanAssetSnapshots} from './lib/immutable-snapshot-lifecycle';

nextEnv.loadEnvConfig(process.cwd());
assert.equal(process.env.MA24_DISPOSABLE_SNAPSHOT_LIFECYCLE,'1');
const url=process.env.DATABASE_MIGRATION_URL!,appUrl=process.env.DATABASE_URL!;
assert.equal(new URL(url).hostname,'127.0.0.1');assert.equal(new URL(url).host+new URL(url).pathname,new URL(appUrl).host+new URL(appUrl).pathname);
const admin=new Client({connectionString:url}),reader=new Client({connectionString:appUrl}),writer=new Client({connectionString:url}),observer=new Client({connectionString:url});
await Promise.all([admin.connect(),reader.connect(),writer.connect(),observer.connect()]);
await reader.query('set role network_copilot_app');
const owner=randomUUID(),collection=randomUUID(),document=randomUUID(),assets=Array.from({length:3},()=>randomUUID()),snapshots=Array.from({length:3},()=>randomUUID());
const body=Buffer.from('Synthetic snapshot lifecycle bytes'),hash=createHash('sha256').update(body).digest('hex');
const workspace=process.cwd(),directory=await mkdtemp(join(workspace,'tmp','snapshot-lifecycle-'));
const results:string[]=[];
const cli=(args:string[])=>new Promise<{code:number|null;output:string}>(done=>{
 const child=spawn(process.execPath,['scripts/run-tsx.cjs','scripts/prune-orphan-asset-snapshots.ts',...args],{windowsHide:true,env:process.env,stdio:['ignore','pipe','pipe']});let output='';
 child.stdout.on('data',data=>output+=String(data));child.stderr.on('data',data=>output+=String(data));child.on('error',()=>done({code:-1,output:'CLI spawn failed'}));child.on('exit',code=>done({code,output}));
});
const rejected=async(work:()=>Promise<unknown>,pattern:RegExp)=>{await admin.query('begin');try{await assert.rejects(work,pattern);}finally{await admin.query('rollback');}};
try{
 const migration=await readFile('db/migrations/158_immutable_snapshot_orphan_lifecycle.sql','utf8');await admin.query(migration); // idempotence on full fresh 158
 await admin.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic lifecycle','member','active')",[owner,`${owner}@example.invalid`]);
 await admin.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$1::uuid::text,'Synthetic lifecycle','industry')",[collection]);
 await admin.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1,$2,$1::uuid::text,'Synthetic lifecycle','text',$3,$4,'private')",[document,collection,hash,owner]);
 const register=(id:string)=>admin.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'text/plain',$5,'TXT','synthetic')",[id,document,`knowledge/${id}.txt`,hash,body.length]);
 await register(assets[0]);
 for(let i=0;i<3;i++)await admin.query("insert into knowledge_asset_immutable_snapshot(id,asset_id,source_sha256,byte_size,body,captured_by,created_at) values($1,$2,$3,$4,$5,$6,clock_timestamp()-interval '1 hour')",[snapshots[i],assets[i],hash,body.length,body,owner]);
 const before=new Date().toISOString(),plan=await previewOrphanAssetSnapshots(admin,before,100);
 assert.deepEqual(plan.snapshots.map(row=>row.snapshotId).sort(),snapshots.slice(1).sort());
 const count=async()=>Number((await admin.query('select count(*) n from knowledge_asset_immutable_snapshot where id=any($1::uuid[])',[snapshots])).rows[0].n);
 const audits=async()=>Number((await admin.query('select count(*) n from knowledge_asset_snapshot_prune_audit')).rows[0].n);
 assert.equal(await count(),3);assert.equal(await audits(),0);
 await assert.rejects(previewOrphanAssetSnapshots(admin,new Date(Date.now()+60000).toISOString(),100),/future/);
 await reader.query('begin');await reader.query("select set_config('app.current_user_id',$1,true),set_config('app.snapshot_prune_request',$2,true)",[owner,randomUUID()]);
 await assert.rejects(reader.query('select * from prune_orphan_asset_snapshots($1,$2,$3)',[randomUUID(),plan,'Synthetic cleanup']),/permission denied/);await reader.query('rollback');
 for(const statement of ['delete from knowledge_asset_immutable_snapshot','select * from knowledge_asset_snapshot_prune_audit'])await assert.rejects(reader.query(statement),/permission denied/);
 const privileges=(await admin.query<{allowed:boolean}>("select has_function_privilege('network_copilot_skill_collector','public.prune_orphan_asset_snapshots(uuid,jsonb,text)','EXECUTE') allowed")).rows[0];assert.equal(privileges.allowed,false);
 await rejected(()=>admin.query('delete from knowledge_asset_immutable_snapshot where id=$1',[snapshots[1]]),/cannot be changed/);
 await rejected(()=>admin.query('update knowledge_asset_immutable_snapshot set body=body where id=$1',[snapshots[1]]),/cannot be changed/);
 await rejected(()=>admin.query('truncate knowledge_asset_immutable_snapshot'),/cannot be changed/);
 await rejected(async()=>{await admin.query("select set_config('app.snapshot_prune_request',$1,true)",[randomUUID()]);await admin.query('delete from knowledge_asset_immutable_snapshot where id=$1',[snapshots[1]]);},/source or audit changed/);
 results.push('preview is read-only and excludes live asset metadata; app/collector and forged context cannot delete; update and truncate remain forbidden');
 const one=plan.snapshots[0];
 await rejected(()=>pruneOrphanAssetSnapshots(admin,randomUUID(),{...plan,snapshots:[{...one,sourceSha256:'0'.repeat(64)}]},'Synthetic stale'),/stale/);
 await register(assets[2]);
 await rejected(()=>pruneOrphanAssetSnapshots(admin,randomUUID(),plan,'Synthetic source restored'),/stale/);
 assert.equal(await count(),3);assert.equal(await audits(),0);await admin.query('delete from knowledge_asset where id=$1',[assets[2]]);
 results.push('stale exact hash and restored asset reject entire batch with zero deletions and zero audit rows');
 await reader.query('begin');await reader.query("select set_config('app.current_user_id',$1,true)",[owner]);await reader.query('select lock_skill_knowledge_sources()');
 await writer.query('begin');const pid=Number((await writer.query('select pg_backend_pid() pid')).rows[0].pid);
 const pending=pruneOrphanAssetSnapshots(writer,randomUUID(),plan,'Synthetic held-source reader');
 // Observe the exact writer backend instead of inferring contention from delay.
 let waiting=false;for(let i=0;i<100;i++){
  waiting=(await observer.query<{waiting:boolean}>("select wait_event_type='Lock' and wait_event='advisory' as waiting from pg_stat_activity where pid=$1",[pid])).rows[0]?.waiting??false;
  if(waiting)break;await new Promise(done=>setTimeout(done,20));
 }
 assert(waiting,'Cleanup writer must wait for retained source admission');await reader.query('rollback');
 assert.equal((await pending).deletedCount,2);await writer.query('rollback');assert.equal(await count(),3);assert.equal(await audits(),0);
 results.push('actual cleanup waits on retained source reader; outer rollback restores bytes and audit together');
 const planPath=join(directory,'plan.json'),requestId=randomUUID(),reason='Synthetic explicit orphan cleanup';
 const preview=await cli([`--plan-out=${planPath}`,`--before=${before}`,'--limit=100']);assert.equal(preview.code,0,preview.output);assert.equal(JSON.parse(preview.output.trim().split('\n').at(-1)!).deletionPerformed,false);
 const approved=JSON.parse(await readFile(planPath,'utf8'));assert.deepEqual(approved,plan);
 const arguments_=[`--apply=${planPath}`,`--request-id=${requestId}`,`--reason=${reason}`];
 const applied=await cli(arguments_);assert.equal(applied.code,0,applied.output);const first=JSON.parse(applied.output.trim().split('\n').at(-1)!);
 assert.equal(first.deletedCount,2);assert.equal(first.deletedBytes,String(body.length*2));assert.equal(await count(),1);assert.equal(await audits(),1);
 const retry=await cli(arguments_);assert.equal(retry.code,0,retry.output);assert.deepEqual(JSON.parse(retry.output.trim().split('\n').at(-1)!),first);
 const changed=await cli([`--apply=${planPath}`,`--request-id=${requestId}`,'--reason=Changed reason']);assert.notEqual(changed.code,0);assert(!changed.output.includes(url));assert.equal(await audits(),1);
 const row=(await admin.query('select manifest,manifest_hash,executed_by from knowledge_asset_snapshot_prune_audit where request_id=$1',[requestId])).rows[0];assert.deepEqual(row.manifest,plan);assert.equal(row.manifest_hash,first.manifestHash);assert(row.executed_by);
 for(const statement of ['update knowledge_asset_snapshot_prune_audit set reason=reason','delete from knowledge_asset_snapshot_prune_audit','truncate knowledge_asset_snapshot_prune_audit'])await rejected(()=>admin.query(statement),/immutable/);
 assert.equal(await count(),1);results.push('actual operator CLI preview/apply/retry preserves exact audit and leaves linked snapshot; changed request and audit mutation reject');
 await writeFile('tmp/ma24-snapshot-lifecycle-result.json',JSON.stringify({passed:true,results,migration:158,actualPostgresAndOperatorCli:true,deletedSyntheticOrphans:2,linkedSnapshotPreserved:true,automaticRetentionPolicy:false,productionDataDeleted:false,automaticActivation:false},null,2)+'\n');
 console.log(JSON.stringify({snapshotLifecycle:'passed',results,actualPostgresAndOperatorCli:true,productionDataDeleted:false,automaticActivation:false}));
}finally{
 await Promise.allSettled([reader.query('rollback'),writer.query('rollback'),admin.query('rollback')]);await Promise.allSettled([admin.end(),reader.end(),writer.end(),observer.end()]);
 const target=resolve(directory),root=resolve(workspace,'tmp');assert(relative(root,target)&&!relative(root,target).startsWith('..'));await rm(target,{recursive:true,force:true});
}
