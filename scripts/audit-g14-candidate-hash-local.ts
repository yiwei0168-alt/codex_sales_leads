/** Read-only exact-hash exposure screen for a quarantined public G14 original. */
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(process.cwd());
const hash=process.argv[2];
assert(hash&&/^[a-f0-9]{64}$/.test(hash),'Expected lowercase SHA-256 argument');
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(connectionString&&['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname),'Local database required');
const pool=new Pool({connectionString});
const client=await pool.connect();
try{
 await client.query('begin isolation level repeatable read read only');
 await client.query("set local statement_timeout='15s'");
 const assets=await client.query<{count:string}>('select count(*)::text as count from knowledge_asset where source_sha256=$1',[hash]);
 const uploads=await client.query<{count:string}>('select count(*)::text as count from knowledge_upload_job where source_sha256=$1',[hash]);
 const gold=await client.query<{count:string}>(`select count(*)::text as count from knowledge_evaluation_review_v3
   where exists(select 1 from jsonb_array_elements(expected_sources::jsonb) source
     where source->>'assetSha256'=$1)`,[hash]);
 console.log(JSON.stringify({schema:'ma24-g14-local-exact-hash-screen-v1',readOnly:true,sourceSha256:hash,
  matchingAssets:Number(assets.rows[0].count),matchingUploadJobs:Number(uploads.rows[0].count),
  matchingHistoricalGoldRows:Number(gold.rows[0].count),
  semanticOrQuestionIndependenceProven:false,approvedIndependentSource:false}));
 await client.query('rollback');
}finally{await client.query('rollback').catch(()=>undefined);client.release();await pool.end();}
