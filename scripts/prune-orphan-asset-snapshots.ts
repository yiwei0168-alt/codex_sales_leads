import {readFile,writeFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool,type PoolClient} from 'pg';
import {databaseConnectionString,databaseSslConfiguration,isRemoteDatabase} from '../src/lib/rag/database-ssl';
import {previewOrphanAssetSnapshots,pruneOrphanAssetSnapshots} from './lib/immutable-snapshot-lifecycle';

nextEnv.loadEnvConfig(process.cwd());
const args=process.argv.slice(2),options=new Map<string,string>();
for(const arg of args){const at=arg.indexOf('=');if(at<3||options.has(arg.slice(0,at)))throw new Error('Use unique --option=value arguments');options.set(arg.slice(0,at),arg.slice(at+1));}
const preview=options.has('--plan-out');
const allowed=preview?['--plan-out','--before','--limit']:['--apply','--request-id','--reason'];
if(options.size!==3||allowed.some(key=>!options.get(key)))throw new Error('Use --plan-out=<new.json> --before=<UTC-ISO> --limit=<1..100>, or --apply=<plan.json> --request-id=<UUID> --reason=<text>');
let pool:Pool|undefined,client:PoolClient|undefined;
try{
 const url=process.env.DATABASE_MIGRATION_URL;if(!url)throw new Error('Operations-owner migration connection required');
 if(isRemoteDatabase(url)&&new URL(url).searchParams.get('sslmode')!=='verify-full')throw new Error('Remote snapshot cleanup requires verify-full TLS');
 pool=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url),max:1,connectionTimeoutMillis:5000});client=await pool.connect();
 await client.query('begin isolation level read committed');await client.query("set local lock_timeout='15s'");
 if(preview){
  const plan=await previewOrphanAssetSnapshots(client,options.get('--before')!,Number(options.get('--limit')));
  await client.query('commit');await writeFile(options.get('--plan-out')!,JSON.stringify(plan,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({snapshotCleanupPreview:'written',count:plan.snapshots.length,deletionPerformed:false}));
 }else{
  const bytes=await readFile(options.get('--apply')!);if(bytes.length>100_000)throw new Error('Snapshot cleanup plan too large');
  const result=await pruneOrphanAssetSnapshots(client,options.get('--request-id')!,JSON.parse(bytes.toString('utf8')),options.get('--reason')!);
  await client.query('commit');console.log(JSON.stringify({snapshotCleanup:'committed',...result}));
 }
}catch{
 await client?.query('rollback').catch(()=>undefined);process.exitCode=1;
 console.error('Snapshot cleanup result unconfirmed. Reconcile the same request ID and exact plan before retrying; database details are redacted.');
}finally{client?.release();await pool?.end();}
