import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {tenantQuery} from '../src/lib/rag/db';
import {chromium,expect} from '@playwright/test';
import {verifyMa24RevisionHistoryClone} from './lib/verify-ma24-revision-history-clone';

assert.equal(process.env.MA24_DISPOSABLE_LIBRARY_UI,'1');
const database=process.env.MA24_LIBRARY_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_LIBRARY_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_LIBRARY_OWNER_COOKIE!,peer=process.env.MA24_LIBRARY_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Knowledge library fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_LIBRARY_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const other=(await admin.query('select id from app_user where email=$1',[owner.email.replace('-0@','-1@')])).rows[0];assert(other);
 const hash=(text:string)=>createHash('sha256').update(text).digest('hex');
 const api=async(path:string,actor=cookie)=>{const r=await fetch(upstream.origin+path,{headers:{cookie:actor},signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json()};};
 const read=(id:string,scope='private',actor=cookie)=>api(`/api/knowledge/library/${id}?scope=${scope}`,actor);
 const list=(scope='private',actor=cookie)=>api(`/api/knowledge/library?scope=${scope}`,actor);
 const collection=(await admin.query("select id from knowledge_collection where slug='company'")).rows[0].id;
 const create=async(title:string,visibility='private',binary=false,textTree=false)=>{
  const id=randomUUID(),current='Generated current original '+title,old='Generated old history '+title,contentHash=hash(current),oldHash=hash(old);
  await admin.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1,$2,$1::uuid::text,$3,'manual',$4,$5,$6)",[id,collection,title,contentHash,owner.id,visibility]);
  const revision=(await admin.query('insert into knowledge_document_revision(document_id,user_id,title,content_sha256,content,reconstructed) values($1,$2,$3,$4,$5,false) returning id',[id,owner.id,title,contentHash,current])).rows[0].id;
  await admin.query('insert into knowledge_document_revision(document_id,user_id,title,content_sha256,content,reconstructed) values($1,$2,$3,$4,$5,false)',[id,owner.id,'Historical '+title,oldHash,old]);
  await admin.query('insert into knowledge_chunk(document_id,chunk_index,content,token_estimate,content_sha256) values($1,0,$2,4,$3)',[id,'MUST NOT RETURN LEGACY CHUNK '+title,hash('legacy '+title)]);
  let asset:string|null=null,version:string|null=null,node:string|null=null;
  if(binary){asset=randomUUID();await admin.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')",[asset,id,`synthetic/${asset}.pdf`,hash('source '+title)]);}
  if(binary||textTree){version=randomUUID();await admin.query("insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at) values($1,$2,$3,$4,'synthetic-current-v1',$5,'ready',now())",[version,id,asset,binary?hash('source '+title):contentHash,hash('artifact '+title)]);
   const unit=(await admin.query("insert into knowledge_tree_node(version_id,ordinal,node_kind,title,unit_type,unit_index,source_location) values($1,0,'unit','Generated page','document',1,'{}') returning id",[version])).rows[0].id;
   node=(await admin.query("insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256) values($1,$2,0,'evidence','Generated block','document',1,$3,$4,$5) returning id",[version,unit,JSON.stringify({revisionId:revision,unitType:'document',unitIndex:1,start:0,end:current.length}),current,contentHash])).rows[0].id;
   await admin.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[id,version]);
  }
  return {id,title,current,old,contentHash,asset,version,node,revision};
 };
 const legacy=await create('Library legacy private'),sharedText=await create('Library current shared text','shared',false,true),binary=await create('Library binary private','private',true),sharedBinary=await create('Library binary shared','shared',true);
 assert.equal((await read(legacy.id)).body.item.content,legacy.current);assert.equal((await read(binary.id)).body.item.content,binary.current);assert.equal((await read(sharedText.id,'shared',peer)).body.item.content,sharedText.current);assert.equal((await read(sharedBinary.id,'shared',peer)).body.item.content,sharedBinary.current);
 assert.equal((await read(legacy.id,'private',peer)).status,404);assert.equal((await read(legacy.id,'shared',peer)).status,404);assert.equal((await read(legacy.id,'private','')).status,401);
 assert.deepEqual((await tenantQuery<{id:string}>(other.id,'select id from knowledge_document_revision where document_id=$1',[sharedText.id])).map(row=>row.id),[sharedText.revision]);
 assert.deepEqual((await api(`/api/knowledge/library/history?document=${sharedText.id}`,peer)).body.items,[]);
 assert.equal((await api(`/api/knowledge/tree?documentId=${sharedText.id}&nodeId=${sharedText.node}`,peer)).status,200);
 const withheld=async(id:string,scope='private',actor=cookie)=>{assert.equal((await read(id,scope,actor)).status,404);const rows=(await list(scope,actor)).body.items;const row=rows.find((entry:{id:string})=>entry.id===id);assert(row);assert.equal(row.contentAvailable,false);assert.equal(row.excerpt,null);assert.equal(row.assetId,null);const mixed=(await list('all',actor)).body.items.find((entry:{id:string})=>entry.id===id);assert(mixed);assert.equal(mixed.excerpt,null);assert.equal(mixed.contentAvailable,false);};
 await admin.query("update knowledge_document set status='archived' where id=$1",[legacy.id]);await withheld(legacy.id);assert.equal((await api(`/api/knowledge/library/history?document=${legacy.id}`)).body.items.length,2);await admin.query("update knowledge_document set status='active' where id=$1",[legacy.id]);
 const oldAsset=randomUUID();await admin.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')",[oldAsset,binary.id,`synthetic/${oldAsset}.pdf`,hash('older registered source')]);
 await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[binary.asset]);await withheld(binary.id);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[binary.asset]);assert.equal((await read(binary.id)).body.item.assetId,binary.asset);
 await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[sharedBinary.asset]);await withheld(sharedBinary.id,'shared',peer);assert.deepEqual(await tenantQuery(other.id,'select id from knowledge_document_revision where document_id=$1',[sharedBinary.id]),[]);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[sharedBinary.asset]);
 await admin.query("update knowledge_tree_version set status='failed' where id=$1",[sharedText.version]);await withheld(sharedText.id,'shared',peer);await admin.query("update knowledge_tree_version set status='ready' where id=$1",[sharedText.version]);
 await admin.query('update knowledge_document set content_sha256=$2 where id=$1',[sharedText.id,hash('missing current revision')]);await withheld(sharedText.id,'shared',peer);await admin.query('update knowledge_document set content_sha256=$2 where id=$1',[sharedText.id,sharedText.contentHash]);
 await admin.query("update knowledge_document set visibility='private' where id=$1",[sharedText.id]);assert.equal((await read(sharedText.id,'shared',peer)).status,404);assert.deepEqual(await tenantQuery(other.id,'select id from knowledge_document_revision where document_id=$1',[sharedText.id]),[]);await admin.query("update knowledge_document set visibility='shared' where id=$1",[sharedText.id]);
 const unindexed=await create('Library unindexed binary');await admin.query("insert into knowledge_asset(document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,'application/pdf',0,'datasheet','synthetic')",[unindexed.id,`synthetic/${randomUUID()}.pdf`,hash('unindexed binary')]);await withheld(unindexed.id);
 assert(!JSON.stringify((await list('all',peer)).body).includes(legacy.title));assert(!JSON.stringify((await list('all',peer)).body).includes('Generated old history'));
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const unknown=await create(`Library unknown delete ${width}`),confirmed=await create(`Library confirmed delete ${width}`);
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}});const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());let failList=false,dropDelete=true,deletes=0,release:(()=>void)|undefined;
  await context.route('**/*',async route=>{const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname==='/api/knowledge/library'){
   if(route.request().method()==='GET'&&failList)return route.fulfill({status:503,json:{}});
   if(route.request().method()==='DELETE'){deletes++;const response=await route.fetch();assert.equal(response.status(),200);if(dropDelete){await response.dispose();return route.abort('connectionreset');}await new Promise<void>(done=>{release=done;});failList=true;return route.fulfill({response});}
  }return route.continue();});
  try{
   await page.goto(base+'/knowledge');const library=page.getByRole('region',{name:'资料列表'}),rows=library.locator('.library-row');await library.getByRole('button',{name:binary.title,exact:true}).click();await library.getByText('查看已保存的检索正文',{exact:true}).click();await expect(library.locator('.library-body')).toContainText(binary.current);
   await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[binary.asset]);await library.getByRole('button',{name:'刷新当前资料'}).click();await expect(library.getByRole('alert')).toContainText('来源可能已失效');await expect(library.locator('.library-body')).toHaveCount(0);await expect(library.getByRole('link',{name:'打开原始资料'})).toHaveCount(0);await expect(library.getByRole('region',{name:'原文坐标'})).toHaveCount(0);await library.getByText('历史内容版本',{exact:true}).click();await expect(library.getByText('Historical '+binary.title,{exact:false})).toBeVisible();
   const shot=`tmp/ma24-library-source-unavailable-${width}-${randomUUID()}.png`;await page.screenshot({path:shot,fullPage:true});screenshots.push(shot);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[binary.asset]);await library.getByRole('button',{name:'重试读取资料'}).click();await expect(library.getByRole('link',{name:'打开原始资料'})).toHaveAttribute('href','/api/knowledge/assets/'+binary.asset);await library.getByRole('button',{name:'返回资料列表'}).click();await expect(rows.first()).toBeVisible();
   failList=true;await library.getByRole('button',{name:'刷新资料',exact:true}).click();await expect(library.getByRole('alert')).toContainText('列表读取失败');await expect(rows).toHaveCount(0);failList=false;await library.getByRole('button',{name:'重试读取列表'}).click();await expect(rows.first()).toBeVisible();
   await rows.filter({hasText:unknown.title}).getByRole('button',{name:'删除此私有知识'}).click();await expect(library.getByRole('alert')).toContainText('可能已删除');assert.equal((await admin.query('select count(*)::int n from knowledge_document where id=$1',[unknown.id])).rows[0].n,0);await library.getByRole('button',{name:'刷新资料',exact:true}).click();await expect(rows.filter({hasText:unknown.title})).toHaveCount(0);assert.equal(deletes,1);
   dropDelete=false;await rows.filter({hasText:confirmed.title}).getByRole('button',{name:'删除此私有知识'}).click();await expect.poll(()=>Boolean(release)).toBe(true);await expect(library.getByRole('button',{name:confirmed.title,exact:true})).toBeDisabled();release!();release=undefined;await expect(library.getByRole('status').filter({hasText:'私有知识已删除'})).toBeVisible();await expect(library.getByRole('alert').filter({hasText:'列表读取失败'})).toBeVisible();failList=false;await library.getByRole('button',{name:'重试读取列表'}).click();await expect(rows.filter({hasText:confirmed.title})).toHaveCount(0);assert.equal(deletes,2);assert.equal((await admin.query('select count(*)::int n from agent_run where user_id=$1',[owner.id])).rows[0].n,0);assert.deepEqual(errors,[]);
   results.push({width,sourceWithdrawalHidesBodyTreeAndOriginalLinks:true,explicitOwnerHistoryRetained:true,sourceRestorationUsesCurrentAsset:true,list503ClearsActionsAndRetries:true,actualDroppedDeleteAckNoAutomaticRetry:true,confirmedDeleteLockAndReadFailureNotice:true,modelTasksQueued:0});
  }finally{release?.();await context.close();await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[binary.asset]);}
 }
 const revisionHistory=await verifyMa24RevisionHistoryClone({admin,base,cookie,userId:owner.id,allowSelfSignedLoopback:true});
 const result={knowledgeLibraryFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsAndSourcesOnly:true,legacyAssetFreeTextPreserved:true,archivedCurrentBodyAndExcerptsBlocked:true,withdrawnCurrentAssetCannotFallBackToOlderRegisteredAsset:true,privateSharedAndAllExcerptGuardParity:true,currentSharedOriginalReadableButHistoryAndPrivateRevisionsDenied:true,textTreeMissingRevisionHashAndFailedVersionBlocked:true,unindexedBinaryBodyBlocked:true,publicEvidenceContractUnchanged:true,revisionHistory,results,screenshots,actualModelCalls:0,realDocumentQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-knowledge-library-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}}
