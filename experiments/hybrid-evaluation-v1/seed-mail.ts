import {readFile,writeFile} from 'node:fs/promises';
import {bindRuntime,userId,otherUserId,id,json,local,sha,verifyDesign} from './runtime';

const designHash=await verifyDesign(),admin=await bindRuntime();
const {encryptMailboxContent}=await import('../../src/lib/mailbox/crypto');
const fixtures=JSON.parse(await readFile('experiments/hybrid-evaluation-v1/business-fixtures.json','utf8'));
try{
 const old=await admin.query("select to_regclass('eval_control.fixture_binding') as marker");
 if(old.rows[0].marker){
  const saved=await admin.query('select fixture_hash from eval_control.fixture_binding');
  if(saved.rows[0]?.fixture_hash!==sha(json(fixtures)))throw Error('Fixture binding drift');
  console.log(JSON.stringify({alreadySeeded:true}));
 }else{
 const client=await admin.connect();
 try{
  await client.query('begin');
  for(const [owner,email] of [[userId,'owner@benchmark.example.invalid'],[otherUserId,'other@benchmark.example.invalid']]){
   await client.query("insert into app_user(id,email,display_name,role,status) values($1,$2,'Synthetic evaluation account','member','active')",[owner,email]);
   await client.query("insert into mailbox_connection(id,user_id,provider,email,host,credential_ciphertext,status,display_name) values($1,$2,'alimail-imap',$3,'mail.example.invalid','not-a-real-credential','disabled','Synthetic mailbox')",[id(`connection/${owner}`),owner,email]);
  }
  for(const c of fixtures.companies){
   await client.query("insert into mailbox_customer(id,user_id,identity_key,name,domain,country,customer_type,confirmed) values($1,$2,$3,$4,$5,$6,'partner',true)",
    [id(c.id),userId,`domain:${c.domain}`,c.name,c.domain,c.country]);
  }
  for(const [i,m] of fixtures.mails.entries()){
   const content={subject:m.subject,bodyText:`${m.fact}. ${m.explicitDeadline?`Explicit requested deadline: ${m.explicitDeadline}.`:'No explicit deadline stated.'} No explicit responsible person stated.`,
    sender:[{name:m.sender,address:m.fromAddress}],recipients:[{name:m.recipient,address:m.toAddress}]};
   await client.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,internet_message_id,direction,sent_at,content_sha256,content_ciphertext,metadata)
    values($1,$2,$3,'Synthetic','v1',$4,$5,$6,$7,$8,$9,$10)`,[id(m.id),userId,id(`connection/${userId}`),i+1,`<${m.id}@benchmark.example.invalid>`,m.direction,m.date,
    sha(json(content)),encryptMailboxContent(userId,content),JSON.stringify({synthetic:true})]);
   await client.query("insert into mailbox_customer_message(user_id,customer_id,message_id,source) values($1,$2,$3,'confirmed')",[userId,id(m.companyId),id(m.id)]);
  }
  const sentinel={subject:'Other tenant sentinel',bodyText:'PRIVATE_OTHER_TENANT_SENTINEL',sender:[],recipients:[]};
  await client.query(`insert into mailbox_message(id,user_id,connection_id,folder_path,uid_validity,message_uid,direction,content_sha256,content_ciphertext)
   values($1,$2,$3,'Synthetic','v1',1,'inbound',$4,$5)`,[id('other-mail'),otherUserId,id(`connection/${otherUserId}`),sha(json(sentinel)),encryptMailboxContent(otherUserId,sentinel)]);
  await client.query('create table eval_control.fixture_binding(fixture_hash text primary key,design_hash text not null)');
  await client.query('insert into eval_control.fixture_binding values($1,$2)',[sha(json(fixtures)),designHash]);
  await client.query('commit');
 }catch(error){await client.query('rollback');throw error;}finally{client.release();}
 }
 const {productTools}=await import('../../src/lib/assistant/main/tools');
 const context={userId,runId:id('fixture-check'),leaseToken:'isolated-read-check',role:'member' as const,mode:'deep' as const};
 const execute=async(toolId:string,args:unknown)=>{const t=productTools.find(t=>t.id===toolId)!;return t.execute(t.input.parse(args),context);};
 const search=await execute('company_search',{query:'Harbor Circuit'});
 const timeline=await execute('customer_timeline',{customerId:id('c1')});
 const mail=await execute('mail_read',{messageId:id('c1-m4')});
 const forbidden=await execute('mail_read',{messageId:id('other-mail')});
 if(forbidden.data!==null||!JSON.stringify(search.data).includes(id('c1'))||!JSON.stringify(timeline.data).includes(id('c1-m4'))
  ||!JSON.stringify(mail.data).includes('purchase date not committed'))throw Error('Real tool fixture isolation/read check failed');
 const binding={designHash,fixtureHash:sha(json(fixtures)),userId,otherUserId,companyIds:Object.fromEntries(fixtures.companies.map((c:{id:string})=>[c.id,id(c.id)])),
  messageIds:Object.fromEntries(fixtures.mails.map((m:{id:string})=>[m.id,id(m.id)])),realReadChecks:['company_search','customer_timeline','mail_read','cross-tenant-denied'],
  mailRows:48,customerRows:12,productionDataAccess:false,knowledgeAndSalesFixturesSeeded:false,
  paginationDiscrepancy:'Design pageSize=5; production customer timeline/list pageSize=20. Do not alter production tools or claim the 12-customer fixture proves pagination.'};
 await writeFile(`${local}/mail-binding.json`,json(binding));console.log(json(binding));
}finally{await admin.end();const {getPool}=await import('../../src/lib/rag/db');await getPool().end();}
