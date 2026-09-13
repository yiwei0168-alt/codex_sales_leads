import nextEnv from "@next/env";
import {randomUUID} from "node:crypto";
import assert from "node:assert/strict";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
nextEnv.loadEnvConfig(process.cwd());
const app=process.env.DATABASE_URL,adminUrl=process.env.DATABASE_MIGRATION_URL;
if(!app||!adminUrl)throw new Error("Both database connections required");
const a=new URL(app),b=new URL(adminUrl);
if(a.hostname!==b.hostname||(a.port||'5432')!==(b.port||'5432')||a.pathname!==b.pathname)throw new Error("Database target mismatch");
const admin=new Pool({connectionString:databaseConnectionString(adminUrl),ssl:databaseSslConfiguration(adminUrl)});
const {getPool}=await import("../src/lib/rag/db");
const {addManualCompany}=await import("../src/lib/sales/manual-company");
const {encryptMailboxContent}=await import("../src/lib/mailbox/crypto");
const {followUpContext}=await import("../src/lib/outreach/follow-up-context");
const userId=randomUUID(),otherId=randomUUID(),workspaceId=randomUUID(),otherWorkspace=randomUUID(),connectionId=randomUUID();
const domain=`follow-up-${randomUUID()}.fixture.invalid`;
let created=false;
try{
  const client=await admin.connect();
  try{
    await client.query('begin');
    for(const id of [userId,otherId])await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Follow-up fixture','member','disabled')",[id,`follow-up-${id}@fixture.invalid`]);
    for(const [id,slug] of [[workspaceId,'global-sales'],[otherWorkspace,'other-fixture']])await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,$3,'Follow-up fixture','Global','WW','Synthetic')",[id,userId,slug]);
    await client.query("insert into mailbox_connection(id,user_id,provider,email,credential_ciphertext,status) values($1,$2,'alimail-imap','sender@fixture.invalid','not-a-credential','disabled')",[connectionId,userId]);
    await client.query('commit');created=true;
  }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  for(const country of ['GB','MX'])await addManualCompany(userId,{name:'Follow-up fixture',country,website:`https://${domain}`,role:'SI'});
  const company=await admin.query<{id:string}>('select id from sales_company where domain=$1',[domain]);
  const companyId=company.rows[0].id;
  const mail=(subject:string,address='alex@fixture.invalid')=>encryptMailboxContent(userId,{subject,bodyText:'Synthetic context only',sender:[{address:'sender@fixture.invalid'}],recipients:[{address}]});
  const addOutbound=async(subject:string,parent:string|null=null,country='GB',workspace=workspaceId,address='alex@fixture.invalid')=>{
    const id=randomUUID();
    await admin.query(`insert into outbound_mail(id,user_id,workspace_id,company_id,connection_id,idempotency_key,request_hash,message_id,parent_id,content_ciphertext,status,sent_at,market_country_code)
      values($1::uuid,$2,$3,$4,$5,$1::uuid,$1::uuid::text,$1::uuid::text,$6,$7,'sent',now(),$8)`,[id,userId,workspace,companyId,connectionId,parent,mail(subject,address),country]);
    return id;
  };
  const wrong=await addOutbound('wrong-person',null,'GB',workspaceId,'other@fixture.invalid');
  const ancestor=await addOutbound('matching-ancestor',wrong,'GB',workspaceId,'Alex@Fixture.invalid');
  const parent=await addOutbound('selected',ancestor);
  for(const [country,role,status,label] of [['GB','SI','active','matching-style'],['MX','SI','active','wrong-country'],['GB','MSP','active','wrong-role'],['GB','SI','archived','archived']]){
    await admin.query("insert into user_outreach_memory(user_id,workspace_id,kind,external_id,title,content,market_codes,channel_roles,status) values($1,$2,'email-style',$3,$3,$3,$4,$5,$6)",[userId,workspaceId,label,[country],[role],status]);
  }
  for(let i=0;i<2;i++){
    const id=randomUUID(),sender=i===0?'alex@fixture.invalid':'other@fixture.invalid';
    const content=encryptMailboxContent(userId,{subject:i===0?'matching-inbound':'unrelated-inbound',bodyText:'Synthetic correspondence',sender:[{address:sender}],recipients:[{address:'sender@fixture.invalid'}]});
    await admin.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext,sent_at)
      values($1::uuid,$2,$3,'INBOX','fixture',$4,'inbound',$1::uuid::text,$5,now())`,[id,userId,connectionId,i+1,content]);
    await admin.query("insert into mailbox_message_company(user_id,message_id,company_id,source) values($1,$2,$3,'user-confirmed')",[userId,id,companyId]);
  }
  const result=await followUpContext(userId,parent);
  assert.deepEqual(result?.thread.map(item=>item.subject),['matching-ancestor']);
  assert.deepEqual(result?.stylePreferences.map(item=>item.content),['matching-style']);
  assert.deepEqual(result?.inbound.map(item=>item.subject),['matching-inbound']);
  assert.equal(await followUpContext(otherId,parent),null);
  assert.deepEqual(await followUpContext(userId,parent),result);
  const foreignCountry=await addOutbound('foreign-country',null,'MX');
  const countryParent=await addOutbound('country-parent',foreignCountry);
  assert.equal((await followUpContext(userId,countryParent))?.thread.length,0);
  const foreignWorkspace=await addOutbound('foreign-workspace',null,'GB',otherWorkspace);
  const workspaceParent=await addOutbound('workspace-parent',foreignWorkspace);
  assert.equal((await followUpContext(userId,workspaceParent))?.thread.length,0);
  const paid=await admin.query('select count(*)::int as count from paid_call_reservation where user_id=$1',[userId]);
  assert.equal(paid.rows[0].count,0);
  console.log(JSON.stringify({realSqlAndEncryption:true,normalizedAncestorMatch:true,unrelatedExcluded:true,countryAndWorkspaceIsolation:true,ownerIsolation:true,styleScope:true,inboundCorrespondence:true,repeatedReadUnchanged:true,paidCalls:0,mailSent:0}));
}finally{
  if(created){
    const client=await admin.connect();
    try{
      await client.query('begin');
      const owners=await client.query("select id from app_user where id=any($1::uuid[]) and display_name='Follow-up fixture' and email='follow-up-'||id::text||'@fixture.invalid' for update",[[userId,otherId]]);
      if(owners.rowCount!==2)throw new Error('Fixture identity mismatch');
      const paid=await client.query('select id from paid_call_reservation where user_id=any($1::uuid[])',[[userId,otherId]]);
      if(paid.rowCount)throw new Error('Unexpected paid activity; preserve fixture');
      await client.query('delete from outbound_mail where user_id=$1',[userId]);
      await client.query('delete from mailbox_message_company where user_id=$1',[userId]);
      await client.query('delete from market_workspace where id=any($1::uuid[]) and owner_id=$2',[[workspaceId,otherWorkspace],userId]);
      await client.query('delete from app_user where id=any($1::uuid[])',[[userId,otherId]]);
      await client.query('delete from sales_company where domain=$1',[domain]);
      await client.query('commit');console.log('Synthetic follow-up fixture removed.');
    }catch(error){await client.query('rollback');throw error;}finally{client.release();}
  }
  await getPool().end();await admin.end();
}
