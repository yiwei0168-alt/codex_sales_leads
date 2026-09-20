import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import nextEnv from "@next/env";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {getPool} from "../src/lib/rag/db";
import {encryptMailboxContent} from "../src/lib/mailbox/crypto";
import {readSavedCompanyAssessment,listCompanyCorrespondence} from "../src/lib/sales/company-detail-read";
import {listPendingMailboxCandidates,reviewMailboxCandidate} from "../src/lib/mailbox/candidate-review";

nextEnv.loadEnvConfig(process.cwd());
const url=process.env.DATABASE_MIGRATION_URL||process.env.DATABASE_URL;
if(!url)throw new Error("Database configuration required");
if(process.env.DATABASE_URL){const a=new URL(url),b=new URL(process.env.DATABASE_URL);assert.equal(`${a.hostname}:${a.port||"5432"}${a.pathname}`,`${b.hostname}:${b.port||"5432"}${b.pathname}`);}
const admin=new Pool({connectionString:databaseConnectionString(url),ssl:databaseSslConfiguration(url)});
const users=[randomUUID(),randomUUID()],workspace=randomUUID(),company=randomUUID(),run=randomUUID(),connection=randomUUID(),message=randomUUID(),candidate=randomUUID();
const external=`synthetic-${randomUUID()}`,domain=`synthetic-${randomUUID()}.invalid`;
let created=false,checks=0;
try{
  const client=await admin.connect();
  try{
    await client.query("begin");
    for(const id of users)await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic company detail','member','disabled')",[id,`${id}@example.invalid`]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code) values($1,$2,'global-sales','Synthetic company detail','Germany','DE')",[workspace,users[0]]);
    await client.query("insert into sales_company(id,external_id,canonical_name,domain,country_code) values($1,$2,'Synthetic company detail',$3,'DE')",[company,external,domain]);
    await client.query("insert into workspace_company(workspace_id,company_id,account_tier,supply_model,brand_involvement,opportunity_stage,priority,market_country_code) values($1,$2,'Standard','TBD','Standard','Discovered','Low','DE')",[workspace,company]);
    await client.query("insert into lead_search_run(id,workspace_id,provider,target_count,country_code,status,scoring_policy_version,scoring_policy_snapshot) values($1,$2,'synthetic-company-detail',1,'DE','completed','fixture-v1','{}')",[run,workspace]);
    await client.query("insert into workspace_company_market(workspace_id,company_id,country_code,candidate_id,record,search_run_id,provenance) values($1,$2,'DE',$3,'{}',$4,'assessment')",[workspace,company,external,run]);
    await client.query(`insert into lead_candidate_assessment(user_id,run_id,candidate_id,company_name,domain,official_website_url,eligible,total_score,confidence,gates,dimensions,account_tier,supply_model,brand_involvement,summary,model,prompt_version)
      values($1,$2,$3,'Synthetic company detail',$4,$5,true,73,80,'{}','{}','Standard','TBD','Standard','Synthetic assessment','synthetic','fixture')`,[users[0],run,external,domain,`https://${domain}/`]);
    await client.query("insert into mailbox_connection(id,user_id,provider,email,credential_ciphertext,status) values($1,$2,'alimail-imap','synthetic@example.invalid','synthetic-unusable','disabled')",[connection,users[0]]);
    const ciphertext=encryptMailboxContent(users[0],{subject:"Synthetic confidential subject",bodyText:"Synthetic private body",sender:[{address:"sender@example.invalid"}],recipients:[{address:"recipient@example.invalid"}]});
    await client.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext,sent_at)
      values($1,$2,$3,'INBOX','fixture',1,'inbound','synthetic',$4,now())`,[message,users[0],connection,ciphertext]);
    await client.query("insert into mailbox_message_company(user_id,message_id,company_id,source) values($1,$2,$3,'user-confirmed')",[users[0],message,company]);
    await client.query("insert into mailbox_artifact_candidate(id,user_id,message_id,kind,title,content) values($1,$2,$3,'company-policy','Synthetic candidate','Private candidate content')",[candidate,users[0],message]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  const own=await readSavedCompanyAssessment(users[0],external);
  assert.equal(own?.totalScore,73);assert.equal(own?.policyVersion,"fixture-v1");checks++;
  assert.equal(await readSavedCompanyAssessment(users[1],external),null);checks++;
  assert.equal(await readSavedCompanyAssessment(users[0],"other-company"),null);checks++;
  const mail=await listCompanyCorrespondence(users[0],external,0);
  assert.equal(mail.messages.length,1);assert.equal(mail.messages[0].subject,"Synthetic confidential subject");checks++;
  assert(!JSON.stringify(mail).includes("Synthetic private body"));checks++;
  assert.equal((await listCompanyCorrespondence(users[1],external,0)).messages.length,0);checks++;
  assert.equal((await listCompanyCorrespondence(users[0],"other-company",0)).companyFound,false);checks++;
  assert.equal((await listCompanyCorrespondence(users[0],external,1)).messages.length,0);checks++;
  const pending=await listPendingMailboxCandidates(users[0]);
  assert.equal(pending.find(item=>item.id===candidate)?.content,"Private candidate content");checks++;
  assert.match(pending.find(item=>item.id===candidate)?.contentHash??"",/^[0-9a-f]{64}$/);checks++;
  assert.equal((await listPendingMailboxCandidates(users[1])).some(item=>item.id===candidate),false);checks++;
  assert.deepEqual(await reviewMailboxCandidate(users[0],candidate,"approved","a".repeat(64)),{kind:"conflict"});checks++;
  assert.equal((await admin.query("select review_status from mailbox_artifact_candidate where id=$1",[candidate])).rows[0].review_status,"pending");checks++;
  console.log(JSON.stringify({passed:checks,synthetic:true,modelCalls:0,searchCalls:0,sends:0,customerDataModified:false}));
}finally{
  if(created){const client=await admin.connect();try{
    await client.query("begin");
    const verified=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Synthetic company detail' and email=id::text||'@example.invalid' for update",[users]);
    if(verified.rowCount!==2)throw new Error("Fixture identity mismatch");
    await client.query("delete from mailbox_message where id=$1 and user_id=$2",[message,users[0]]);
    await client.query("delete from mailbox_connection where id=$1 and user_id=$2",[connection,users[0]]);
    await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspace,users[0]]);
    await client.query("delete from sales_company where id=$1 and external_id=$2",[company,external]);
    await client.query("delete from app_user where id=any($1::uuid[])",[users]);
    await client.query("commit");
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}}
  await admin.end();await getPool().end();
}
