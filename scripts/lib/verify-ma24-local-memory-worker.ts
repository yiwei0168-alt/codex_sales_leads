import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve} from 'node:path';
import {Client} from 'pg';

/** Actual --once worker and local model, only in the owning disposable cluster.
 * The loopback relay forwards bytes unchanged and bounds/counts model requests. */
export async function verifyMa24LocalMemoryWorker(options:{adminUrl:string;appUrl:string;ownerEmail:string;disposableContainerId:string;graphWorker?:boolean;chinese?:boolean}){
 assert(/^[a-f0-9]{64}$/.test(options.disposableContainerId));assert(options.ownerEmail.endsWith('@example.invalid'));
 const adminUrl=new URL(options.adminUrl),appUrl=new URL(options.appUrl);
 assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(appUrl.host+appUrl.pathname,adminUrl.host+adminUrl.pathname);
 const admin=new Client({connectionString:options.adminUrl});await admin.connect();
 const directory=`tmp/ma24-real-memory-worker-${randomUUID()}`;await mkdir(directory,{recursive:true});
 const digest='500a1f067a9f782620b40bee6f7b0c89e17ae61f686b92c24933e4ca4b2b8b41';
 let chats=0,tags=0;const errors:string[]=[];
 const graphIds:string[]=[];let graphOwner:string|undefined;
 const cleanupGraph=async()=>{
  while(graphIds.length){
   const id=graphIds[0];assert(graphOwner);
   await new Promise<void>((done,reject)=>{
    const child=spawn(resolve('.venv-graphiti-local',process.platform==='win32'?'Scripts/python.exe':'bin/python'),['scripts/cleanup-memory-graph-probe.py'],
     {windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,GRAPHITI_TELEMETRY_ENABLED:'false',OPENAI_API_KEY:'',OPENROUTER_API_KEY:''}});
    let output='';child.stdout.on('data',data=>{output+=String(data);if(output.length>4096)child.kill();});child.stderr.on('data',()=>{});
    const timer=setTimeout(()=>child.kill(),20000);child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);try{assert.equal(code,0);const receipt=JSON.parse(output);assert.equal(receipt.removed,true);assert.equal(receipt.observationId,id);done();}catch{reject(new Error('Scoped synthetic graph cleanup failed'));}});
    child.stdin.end(JSON.stringify({ownerId:graphOwner,observationId:id}));
   });graphIds.shift();
  }
 };
 const relay=createServer(async(request,response)=>{
  try{
   assert(['/api/tags','/api/chat'].includes(request.url??''));assert.equal(request.method,request.url==='/api/tags'?'GET':'POST');
   let body=Buffer.alloc(0);for await(const chunk of request){body=Buffer.concat([body,Buffer.from(chunk)]);assert(body.length<=32768);}
   if(request.url==='/api/chat'){
    assert(++chats<=4,'Local model call cap exceeded');assert.equal(JSON.parse(body.toString()).model,'qwen3:8b');
   }else tags++;
   const upstream=await fetch(`http://127.0.0.1:11434${request.url}`,{method:request.method,redirect:'error',headers:{'content-type':'application/json'},
    ...(body.length?{body:new Uint8Array(body)}:{}),signal:AbortSignal.timeout(150000)});
   const text=await upstream.text();assert(text.length<=2*1024*1024);assert(upstream.ok,'Local model request failed');
   if(request.url==='/api/tags')assert(JSON.parse(text).models.some((row:{name:string;digest:string})=>row.name==='qwen3:8b'&&row.digest===digest));
   else await writeFile(`${directory}/chat-${chats}.json`,text,{flag:'wx'});
   response.writeHead(upstream.status,{'content-type':'application/json'});response.end(text);
  }catch(error){errors.push(error instanceof Error?error.message:'relay_error');response.writeHead(502);response.end('{}');}
 });
 try{
  await new Promise<void>(done=>relay.listen(0,'127.0.0.1',done));const address=relay.address();assert(address&&typeof address!=='string');
  const owner=(await admin.query('select id from app_user where email=$1',[options.ownerEmail])).rows[0]?.id;assert(owner);
  assert.equal((await admin.query("select count(*)::int n from agent_memory_extraction_job where status in ('queued','processing')")).rows[0].n,0,'Worker requires an empty synthetic queue');
  const before=(await admin.query(`select (select count(*)::int from product_fact) p,(select count(*)::int from knowledge_fact) k,
   (select count(*)::int from knowledge_fact_v3) v,(select count(*)::int from lead_scoring_policy) s`)).rows[0];
  const conversation=randomUUID();await admin.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic actual Worker')",[conversation,owner]);
  const queue=async(content:string)=>{
   const run=randomUUID(),message=randomUUID();
   await admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
    values($1,$2,$3,$1::uuid::text,$1::uuid::text,'{}','{}','completed','main-agent')`,[run,owner,conversation]);
   await admin.query("insert into assistant_message(id,user_id,conversation_id,role,intent,content,metadata) values($1,$2,$3,'user','general',$4,$5)",[message,owner,conversation,content,JSON.stringify({runId:run})]);
   await admin.query('insert into agent_memory_extraction_job(owner_id,run_id) values($1,$2)',[owner,run]);return {run,message};
  };
  const once=async(expectedRun?:string,graph=false)=>{
   const env={...process.env,DATABASE_URL:options.appUrl,DATABASE_MIGRATION_URL:'',ENABLE_LOCAL_MEMORY_EXTRACTION:'1',OLLAMA_LOCAL_URL:`http://127.0.0.1:${address.port}`,
    ENABLE_MEMORY_GRAPH_PROJECTION:graph?'1':'0',LANGSMITH_TRACING:'false',LANGCHAIN_TRACING_V2:'false',OPENAI_API_KEY:'',OPENROUTER_API_KEY:'',ANTHROPIC_API_KEY:'',GOOGLE_API_KEY:'',LANGSMITH_API_KEY:''};
   const result=await new Promise<{code:number|null;output:string}>((done,reject)=>{
    const child=spawn(process.execPath,['--import','tsx',graph?'scripts/run-memory-graph-worker.ts':'scripts/run-local-memory-worker.ts','--once'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';const collect=(data:Buffer)=>{output+=data.toString();if(output.length>16384)child.kill();};child.stdout.on('data',collect);child.stderr.on('data',collect);
    const timer=setTimeout(()=>child.kill(),180000);child.once('error',error=>{clearTimeout(timer);reject(error);});
    child.once('exit',code=>{clearTimeout(timer);done({code,output});});
   });
   assert.equal(result.code,0,graph?'Actual graph Worker failed':'Actual local memory Worker failed');
   const events=result.output.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
   const event=graph?'memory-graph-outbox':'local-memory-extraction';
   if(expectedRun)assert(events.some(row=>row.event===event&&(graph?row.observationId:row.runId)===expectedRun&&row.status===(graph?'delivered':'ready')));
   else assert(!events.some(row=>row.event===event));
  };
  const firstText=options.chinese?'我喜欢详细报告。':'I prefer long reports.';
  const correctionText=options.chinese?'我之前说我喜欢详细报告，那不对。纠正一下，我喜欢简短报告。':'I previously said I prefer long reports. That was wrong. I prefer concise reports.';
  const first=await queue(firstText);await once(first.run);
  const original=(await admin.query("select id,kind,source_receipt,valid_from,valid_until from agent_memory_observation where owner_id=$1 and source_receipt->>'runId'=$2",[owner,first.run])).rows;
  assert.equal(original.length,1);assert.equal(original[0].kind,'preference');assert.equal(original[0].source_receipt.messageId,first.message);
  const second=await queue(correctionText);await once(second.run);
  const corrected=(await admin.query('select id,content,source_receipt,valid_from,valid_until from agent_memory_observation where owner_id=$1 and corrects_id=$2',[owner,original[0].id])).rows;
  assert.equal(corrected.length,1);assert((options.chinese?['我喜欢简短报告','我喜欢简短报告。']:['I prefer concise reports','I prefer concise reports.']).includes(corrected[0].content));
  assert.equal(corrected[0].source_receipt.messageId,second.message);
  if(corrected[0].source_receipt.framingNormalization){
   assert.equal(corrected[0].source_receipt.framingNormalization.normalizer,'leading-self-report-v1');
   assert(correctionText.startsWith(corrected[0].source_receipt.framingNormalization.oldContentBefore));
  }
  for(const id of [original[0].id,corrected[0].id])for(const table of ['agent_memory_notice','agent_memory_graph_outbox'])
   assert.equal((await admin.query(`select count(*)::int n from ${table} where observation_id=$1`,[id])).rows[0].n,1);
  if(options.chinese){
   const third=await queue('客户说：“我喜欢详细报告。”');await once(third.run);
   assert.equal((await admin.query("select count(*)::int n from agent_memory_observation where owner_id=$1 and source_receipt->>'runId'=$2",[owner,third.run])).rows[0].n,0,'Quoted customer preference must not become account memory');
   for(const row of [...original,...corrected]){assert.equal(row.valid_from,null);assert.equal(row.valid_until,null);}
  }
  const calls=chats;await once();assert.equal(chats,calls);assert.equal(chats,options.chinese?3:2);assert.deepEqual(errors,[]);
  if(options.graphWorker){
   graphOwner=owner;graphIds.push(original[0].id,corrected[0].id);
   await writeFile(`${directory}/graph-fixture.json`,JSON.stringify({ownerId:owner,observationIds:graphIds})+'\n');
   await once(original[0].id,true);await once(corrected[0].id,true);await once(undefined,true);
   const delivered=(await admin.query(`select count(*)::int n from agent_memory_graph_outbox where observation_id=any($1::uuid[])
    and delivered_at is not null and lease_token is null and leased_at is null and attempt_count=1`,[graphIds])).rows[0].n;
   assert.equal(delivered,2);assert.equal(chats,calls);await cleanupGraph();
  }
  const after=(await admin.query(`select (select count(*)::int from product_fact) p,(select count(*)::int from knowledge_fact) k,
   (select count(*)::int from knowledge_fact_v3) v,(select count(*)::int from lead_scoring_policy) s`)).rows[0];assert.deepEqual(after,before);
  const result={actualWorkerCli:true,workerOnceInvocations:options.chinese?4:3,queueSelectionAndReadyVerified:true,preferenceAndNaturalCorrection:true,
   language:options.chinese?'zh-CN':'en',quotedCustomerPreferenceRejected:!!options.chinese,unknownBusinessDatesPreserved:!!options.chinese,
   correctionFramingNormalizationRecorded:!!corrected[0].source_receipt.framingNormalization,
   noticesAndOutboxExactlyOnce:true,emptyQueueMakesNoModelCall:true,formalFactAndPolicyCountsUnchanged:true,model:'qwen3:8b',modelDigest:digest,
   actualLocalChatCalls:chats,tagCalls:tags,rawDirectory:directory,rawResponseHashes:await Promise.all(Array.from({length:chats},async(_,i)=>{
    const {readFile}=await import('node:fs/promises');return createHash('sha256').update(await readFile(`${directory}/chat-${i+1}.json`)).digest('hex');})),
   actualGraphWorkerCli:options.graphWorker??false,graphWorkerOnceInvocations:options.graphWorker?3:0,graphOutboxDeliveredExactlyOnce:options.graphWorker??false,
   scopedGraphCleanupVerified:options.graphWorker??false,syntheticInputsOnly:true,cloudCalls:0,productionWrites:0,qualityAccepted:false};
  await writeFile(`${directory}/result.json`,JSON.stringify(result,null,2)+'\n');return result;
 }finally{try{await cleanupGraph();}finally{await new Promise<void>((done,reject)=>relay.close(error=>error?reject(error):done()));await admin.end();}}
}
