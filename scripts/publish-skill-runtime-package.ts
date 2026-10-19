import nextEnv from '@next/env';
import {Pool,type PoolClient} from 'pg';
import {databaseConnectionString,databaseSslConfiguration,isRemoteDatabase} from '../src/lib/rag/database-ssl';
import {publishSkillRuntimePackage,withdrawSkillRuntimePackage} from './lib/skill-runtime-package-publication';

nextEnv.loadEnvConfig(process.cwd());
const [mode,...args]=process.argv.slice(2),values=new Map<string,string>();
const fields=mode==='register'?['image-id','key-id','purpose','valid-until','request-id','expected-revision']:mode==='withdraw'?['request-id','revision','reason']:[];
for(const arg of args){const match=/^--([a-z-]+)=(.+)$/.exec(arg);if(!match||!fields.includes(match[1])||values.has(match[1]))throw new Error('Runtime package argument invalid');values.set(match[1],match[2]);}
if(!fields.length||values.size!==fields.length)throw new Error('Expected register with image-id/key-id/purpose/valid-until/request-id/expected-revision, or withdraw with request-id/revision/reason');
const url=process.env.DATABASE_MIGRATION_URL;if(!url)throw new Error('Operator migration connection required');
if(isRemoteDatabase(url)&&new URL(url).searchParams.get('sslmode')!=='verify-full')throw new Error('Remote runtime registration requires verify-full TLS');
const pool=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url),max:1,connectionTimeoutMillis:5000});
let client:PoolClient|undefined;
try{
 client=await pool.connect();await client.query('begin isolation level read committed');await client.query("set local lock_timeout='15s'");
 const result=mode==='register'?await publishSkillRuntimePackage(client,{imageId:values.get('image-id'),keyId:values.get('key-id'),purpose:values.get('purpose'),
  validUntil:values.get('valid-until'),requestId:values.get('request-id'),expectedRevision:values.get('expected-revision')}):
  await withdrawSkillRuntimePackage(client,{requestId:values.get('request-id'),revision:values.get('revision'),reason:values.get('reason')});
 await client.query('commit');console.log(JSON.stringify({runtimePackageOperation:'completed',mode,...result}));
}catch{
 await client?.query('rollback').catch(()=>undefined);
 console.error('Runtime package operation failed; reconcile the request ID with operator records before retrying.');process.exitCode=1;
}finally{client?.release();await pool.end();}
