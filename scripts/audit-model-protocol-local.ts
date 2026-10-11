import assert from 'node:assert/strict';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {auditModelProtocol} from '../src/lib/assistant/main/model-protocol-audit';
nextEnv.loadEnvConfig(process.cwd());
const email=process.argv.find(arg=>arg.startsWith('--account-email='))?.slice('--account-email='.length);
assert(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),'Explicit account email required');
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
assert(connectionString&&['localhost','127.0.0.1','::1'].includes(new URL(connectionString).hostname),'Local database required');
const pool=new Pool({connectionString});
try{
 const users=(await pool.query('select id from app_user where lower(email)=lower($1)',[email])).rows;assert.equal(users.length,1,'Exact account required');
 const calls=(await pool.query('select input,input_hash,output from agent_tool_call where user_id=$1 and tool_id=$2 and status=$3 order by created_at desc,id desc limit 100',[users[0].id,'main_model','completed'])).rows;
 const reasons:Record<string,number>={};let bound=0;
 for(const call of calls){const audit=auditModelProtocol(call);if(audit.bound)bound++;else reasons[audit.reason]=(reasons[audit.reason]??0)+1;}
 // No private prompts, identifiers, output text, credentials or spend data leave this process.
 console.log(JSON.stringify({readOnly:true,scope:'explicit-account-latest-100-completed-model-receipts',checked:calls.length,requestBound:bound,reasons,qualityAccepted:false,newModelCalls:0}));
}finally{await pool.end();}
