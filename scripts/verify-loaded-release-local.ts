import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {readFile,readdir,rm,rmdir} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {Pool} from 'pg';
import nextEnv from '@next/env';
import {hashPassword} from '../src/lib/auth/password';
import {fetch,FormData} from 'undici';
import {z} from 'zod';

const jobsResponse=z.object({jobs:z.array(z.object({treeStatus:z.string(),revisionBaseVersionId:z.string().nullable()}))});
const uploadResponse=z.object({id:z.string().uuid(),reused:z.boolean()});

nextEnv.loadEnvConfig(process.cwd());
const base=new URL(process.argv[2]||'http://127.0.0.1:3018');assert(base.protocol==='http:'&&['127.0.0.1','localhost'].includes(base.hostname));
const connectionString=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;assert(connectionString&&['127.0.0.1','localhost','::1'].includes(new URL(connectionString).hostname));
const pool=new Pool({connectionString}),owner=randomUUID(),password=randomBytes(24).toString('base64url'),email=`release-${owner}@example.invalid`;
const ip=`local-release-${owner}`,ipHash=createHash('sha256').update(ip).digest('hex');let jobId:string|undefined;
try{
 assert.equal((await fetch(new URL('/api/knowledge/uploads',base))).status,401);
 assert.equal((await fetch(new URL('/api/assistant/skills/shadow-reviews',base))).status,401);
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Release verification fixture',$3,'member','active')",[owner,email,hashPassword(password)]);
 const login=await fetch(new URL('/api/auth/login',base),{method:'POST',headers:{'content-type':'application/json','x-forwarded-for':ip},body:JSON.stringify({email,password})});assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie')?.split(';')[0];assert(cookie);const headers={cookie};
 const list=await fetch(new URL('/api/knowledge/uploads?offset=0&limit=7',base),{headers});assert.equal(list.status,200);assert.deepEqual(jobsResponse.parse(await list.json()).jobs,[]);
 assert.equal((await fetch(new URL('/api/knowledge/uploads?offset=-1',base),{headers})).status,400);
 const shadow=await fetch(new URL(`/api/assistant/skills/shadow-reviews?skillId=${randomUUID()}`,base),{headers});assert.equal(shadow.status,200);assert.deepEqual(await shadow.json(),{items:[],hasMore:false});
 const bytes=await readFile('knowledge/product/Bluetooth USB Adapter/BU530C_V1.0__Datasheet.pdf');
 const upload=async()=>{const body=new FormData();body.set('collection','industry');body.set('title','Local release verification fixture');body.set('file',new File([bytes],'release.pdf',{type:'application/pdf'}));return fetch(new URL('/api/knowledge/uploads',base),{method:'POST',headers,body});};
 const first=await upload();assert.equal(first.status,202);const data=uploadResponse.parse(await first.json());jobId=data.id;assert.equal(data.reused,false);
 const second=await upload();assert.equal(second.status,200);const repeated=uploadResponse.parse(await second.json());assert.equal(repeated.id,jobId);assert.equal(repeated.reused,true);
 const listed=await fetch(new URL('/api/knowledge/uploads?offset=0&limit=7',base),{headers});const jobs=jobsResponse.parse(await listed.json()).jobs;assert.equal(jobs.length,1);assert.equal(jobs[0].treeStatus,'pending');assert.equal(jobs[0].revisionBaseVersionId,null);
 assert.equal((await pool.query('select count(*)::int as n from agent_run where user_id=$1',[owner])).rows[0].n,0);
 console.log(JSON.stringify({base:base.origin,authenticatedRoutes:true,unauthenticatedDenied:true,pagination:true,shadowSchemaLoaded:true,realMultipartUpload:true,duplicateReused:true,modelTasksCreated:0}));
}finally{
 // Only the fresh fixture's rows/files; never touch user uploads or shared originals.
 await pool.query('delete from knowledge_upload_job where user_id=$1',[owner]);await pool.query('delete from app_session where user_id=$1',[owner]);
 await pool.query('delete from auth_login_attempt where ip_sha256=$1',[ipHash]);await pool.query('delete from app_user where id=$1',[owner]);await pool.end();
 const root=resolve('knowledge/uploads',owner);assert(root.startsWith(resolve('knowledge/uploads')+sep));
 for(const name of await readdir(root).catch(()=>[])){const path=resolve(root,name);assert(path.startsWith(root+sep));await rm(path,{force:true});}await rmdir(root).catch(()=>undefined);
}
