import {readFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {z} from 'zod';
import {getPool} from '../src/lib/rag/db';
import {prepareShadowRegistration,shadowRegistrationSchema} from '../src/lib/assistant/main/skill-shadow';

// Operator only. Never exposed as an Agent tool, HTTP endpoint, or automatic campaign enrolment.
const [owner,file]=process.argv.slice(2);z.uuid().parse(owner);if(!file)throw new Error('Usage: <owner> <registration.json>');
const text=await readFile(file,'utf8');if(Buffer.byteLength(text)>20000)throw new Error('Registration too large');
const input=shadowRegistrationSchema.parse(JSON.parse(text));
const connection=process.env.DATABASE_MIGRATION_URL;
if(!connection||!['localhost','127.0.0.1','::1'].includes(new URL(connection).hostname))throw new Error('Local operator connection required');
const pool=new Pool({connectionString:connection});
try{
 const plan=await prepareShadowRegistration(owner,input),client=await pool.connect();
 try{
  await client.query('begin');await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))',[`shadow-registration:${owner}`]);
  const count=(await client.query('select count(*)::int as n from agent_skill_shadow_campaign where owner_id=$1 and enabled and expires_at>now()',[owner])).rows[0].n;
  if(count>=8)throw new Error('Active campaign limit reached');
  const current=await prepareShadowRegistration(owner,input);
  if(JSON.stringify(current)!==JSON.stringify(plan))throw new Error('Registration changed');
  const saved=(await client.query(`insert into agent_skill_shadow_campaign(owner_id,skill_id,version,content_hash,source_hash,config,enabled,expires_at)
   values($1,$2,$3,$4,$5,$6,true,clock_timestamp()+make_interval(hours=>$7)) returning id,expires_at`,
   [owner,plan.skillId,plan.version,plan.contentHash,plan.sourceHash,JSON.stringify(plan.config),plan.hours])).rows[0];
  await client.query('commit');console.log(JSON.stringify({id:saved.id,expiresAt:saved.expires_at,model:'local-qwen3:8b',automaticActivation:false,futureTasksOnly:true}));
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
}finally{await pool.end();await getPool().end();}
