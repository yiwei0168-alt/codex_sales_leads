import {readFile} from 'node:fs/promises';
import nextEnv from '@next/env';
import {Pool} from 'pg';
import {databaseConnectionString,databaseSslConfiguration,isRemoteDatabase} from '../src/lib/rag/database-ssl';
import {publishSkillRunnerTrustRegistry} from './lib/skill-trust-registry-publication';

nextEnv.loadEnvConfig(process.cwd());
const args=process.argv.slice(2);
if(args.length!==2||args.filter(arg=>arg.startsWith('--registry=')).length!==1||args.filter(arg=>arg.startsWith('--expected-revision=')).length!==1)
 throw new Error('Expected --registry=<public-registry.json> --expected-revision=<none|revision>');
const path=args.find(arg=>arg.startsWith('--registry='))!.slice('--registry='.length);
const expected=args.find(arg=>arg.startsWith('--expected-revision='))!.slice('--expected-revision='.length);
if(!path)throw new Error('Public registry path required');
const bytes=await readFile(path);if(bytes.length>512_000)throw new Error('Public trust registry too large');
const registry:unknown=JSON.parse(bytes.toString('utf8'));
const url=process.env.DATABASE_MIGRATION_URL;if(!url)throw new Error('Operator migration connection required');
if(isRemoteDatabase(url)&&new URL(url).searchParams.get('sslmode')!=='verify-full')throw new Error('Remote trust publication requires verify-full TLS');
const pool=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url),max:1,connectionTimeoutMillis:5000});
const client=await pool.connect();
try{
 await client.query('begin isolation level read committed');
 await client.query("set local lock_timeout='15s'");
 const result=await publishSkillRunnerTrustRegistry(client,registry,expected);
 await client.query('commit');
 console.log(JSON.stringify({trustRegistryPublication:'completed',...result}));
}catch(error){
 await client.query('rollback').catch(()=>undefined);
 // Never expose a connection URL, key material or full database error.
 console.error('Trust registry publication failed; inspect operator records and reconcile before retrying.');
 process.exitCode=1;
 void error;
}finally{client.release();await pool.end();}
