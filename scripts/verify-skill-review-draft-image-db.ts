import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {Client} from 'pg';

assert.equal(process.env.MA24_DISPOSABLE_REVIEW_IMAGE,'1');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!),applicationUrl=new URL(process.env.DATABASE_URL!);
assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(applicationUrl.host+applicationUrl.pathname,adminUrl.host+adminUrl.pathname);assert.equal(adminUrl.pathname,'/network_copilot_local');
const database=`ma11_replay_${randomBytes(6).toString('hex')}`;assert.match(database,/^ma11_replay_[a-f0-9]{12}$/);
const maintenance=new URL(adminUrl);maintenance.pathname='/postgres';const admin=new Client({connectionString:maintenance.toString()});await admin.connect();let created=false;
try{
 await admin.query(`create database "${database}" template network_copilot_local`);created=true;
 const login=decodeURIComponent(applicationUrl.username);assert.match(login,/^[a-z_][a-z0-9_]*$/i);await admin.query(`grant connect on database "${database}" to "${login}"`);
 const result=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{
  const child=spawn(process.execPath,['scripts/run-tsx.cjs','scripts/verify-recorded-model-source-clone.ts'],{windowsHide:true,stdio:['ignore','pipe','pipe'],env:{...process.env,MA24_REVIEW_DATABASE:database}});let output='';
  child.stdout!.on('data',d=>{output+=d;});child.stderr!.on('data',d=>{output+=d;});child.once('error',reject);child.once('exit',code=>resolve({code,output}));
 });
 const sanitized=result.output.replaceAll(decodeURIComponent(adminUrl.password),'<temporary-admin-password>').replaceAll(decodeURIComponent(applicationUrl.password),'<temporary-app-password>');
 await writeFile(`tmp/ma24-skill-review-fixed-web-inner-${database}.log`,sanitized);await writeFile('tmp/ma24-skill-review-fixed-web-inner.log',sanitized);assert.equal(result.code,0,sanitized.slice(-6500));
 const browser=JSON.parse(await readFile('tmp/skill-review-fixed-web/result.json','utf8'));assert.equal(browser.skillReviewDraftFixedWeb,'passed');assert.equal(browser.humanRevisionCount,7);assert.equal(browser.database,database);
 console.log(JSON.stringify({fixedReviewDraftDatabase:'passed',browser,freshTemplateOnly:true,modelsCalled:0,realQualityApproval:false}));
}finally{
 try{if(created){assert.match(database,/^ma11_replay_[a-f0-9]{12}$/);await admin.query(`drop database "${database}" with (force)`);}}finally{await admin.end();}
}
console.log(JSON.stringify({fixedReviewDraftDatabaseCleaned:true}));
