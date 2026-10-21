import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {Client} from 'pg';
import {chromium,expect} from '@playwright/test';

assert.equal(process.env.MA24_DISPOSABLE_TREE_UI,'1');
const database=process.env.MA24_TREE_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_TREE_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const adminUrl=new URL(process.env.DATABASE_MIGRATION_URL!);assert.equal(adminUrl.hostname,'127.0.0.1');assert.equal(adminUrl.pathname,'/network_copilot_local');
const cookie=process.env.MA24_TREE_OWNER_COOKIE!,peer=process.env.MA24_TREE_PEER_COOKIE!;assert(cookie&&peer&&cookie!==peer);
const admin=new Client({connectionString:adminUrl.toString()});await admin.connect();
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
 forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const results:unknown[]=[],screenshots:string[]=[];
const watchdog=setTimeout(()=>{console.error('Knowledge tree fixture watchdog expired');process.exit(1);},180000);watchdog.unref();
try{
 const owner=(await admin.query('select id,email from app_user where email=$1',[process.env.MA24_TREE_OWNER_EMAIL])).rows[0];assert(owner);assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const digest=(value:string)=>createHash('sha256').update(value).digest('hex'),location={unitType:'page',unitIndex:1,rawCoordinate:'Generated coordinate '+ 'X'.repeat(600)};
 const doc=randomUUID(),collection=randomUUID(),asset=randomUUID(),version=randomUUID(),unit=randomUUID(),a=randomUUID(),b=randomUUID(),title='MA24 generated tree recovery';
 const sourceSha=digest('Generated source identity only');
 await admin.query("insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic tree recovery','company')",[collection,'ma24-tree-'+doc.slice(0,8)]);
 await admin.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private')",[doc,collection,title,sourceSha,owner.id]);
 await admin.query("insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature) values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')",[asset,doc,`synthetic/${asset}.pdf`,sourceSha]);
 await admin.query("insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at) values($1,$2,$3,$4,'synthetic-v1',$5,'ready',now())",[version,doc,asset,sourceSha,digest('Generated tree fixture')]);
 await admin.query("insert into knowledge_tree_node(id,version_id,ordinal,node_kind,title,unit_type,unit_index,source_location) values($1,$2,0,'unit','Generated page 1','page',1,$3)",[unit,version,JSON.stringify({unitType:'page',unitIndex:1})]);
 for(const [index,id,label] of [[0,a,'A'],[1,b,'B']] as const){const content=`Generated ${label} actual stored content`;await admin.query("insert into knowledge_tree_node(id,version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256) values($1,$2,$3,$4,'evidence',$5,'page',1,$6,$7,$8)",[id,version,unit,index,'Block '+label,JSON.stringify(location),content,digest(content)]);}
 await admin.query('update knowledge_document set current_tree_version_id=$2 where id=$1',[doc,version]);
 const api=async(nodeId:string,actor=cookie)=>{const r=await fetch(upstream.origin+`/api/knowledge/tree?documentId=${doc}&nodeId=${nodeId}`,{headers:{cookie:actor},signal:AbortSignal.timeout(15000)});return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};};
 assert.equal((await api(a,peer)).status,404);assert.equal((await api(a,'')).status,401);const owned=await api(b);assert.equal(owned.status,200);assert.equal(owned.body.evidence.content,'Generated B actual stored content');assert.match(owned.cache??'',/no-store/);
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 for(const width of [1366,390]){
  const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:900}});const separator=cookie.indexOf('=');await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));let holdA=false,dirFails=false,writes=0,ready=false,release:(()=>void)|undefined;
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==base)return route.abort();if(url.pathname!=='/api/knowledge/tree')return route.continue();
   if(route.request().method()!=='GET'){writes++;return route.abort();}
   if(!url.searchParams.has('nodeId')&&url.searchParams.get('parentId')===unit&&dirFails)return route.fulfill({status:503,json:{error:'Synthetic directory read failure'}});
   if(url.searchParams.get('nodeId')===a&&holdA){const response=await route.fetch();assert.equal(response.status(),200);ready=true;await new Promise<void>(done=>{release=done;});return route.fulfill({response}).catch(()=>{});}
   return route.continue();
  });
  try{
   await page.goto(base+'/knowledge');const library=page.getByRole('region',{name:'资料列表'});await library.getByRole('button',{name:title,exact:true}).click();const tree=page.getByRole('region',{name:'原文坐标'}),preview=tree.locator('.knowledge-tree-evidence');const open=async()=>{await tree.getByRole('button',{name:/Generated page 1/}).click();await expect(tree.getByRole('button',{name:/Block B/})).toBeVisible();};await open();
   holdA=true;await tree.getByRole('button',{name:/Block A/}).click();await expect.poll(()=>ready).toBe(true);await tree.getByRole('button',{name:/Block B/}).click();await expect(preview).toContainText('Generated B actual stored content');release!();release=undefined;holdA=false;await expect(preview).not.toContainText('Generated A actual stored content');
   await preview.getByText('完整来源坐标',{exact:true}).click();await preview.getByRole('button',{name:'复制 JSON',exact:true}).click();await expect(preview.getByRole('status')).toContainText('已复制');assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),location);
   const shot=`tmp/ma24-tree-selected-${width}-${randomUUID()}.png`;await tree.scrollIntoViewIfNeeded();await page.screenshot({path:shot,fullPage:true});screenshots.push(shot);
   holdA=true;ready=false;await tree.getByRole('button',{name:/Block A/}).click();await expect.poll(()=>ready).toBe(true);await tree.getByRole('button',{name:'返回目录',exact:true}).click();await expect(tree.getByRole('button',{name:/Generated page 1/})).toBeVisible();release!();release=undefined;holdA=false;await expect(preview).toHaveCount(0);
   dirFails=true;await tree.getByRole('button',{name:/Generated page 1/}).click();await expect(tree.getByRole('alert')).toContainText('坐标读取失败');await expect(tree.locator('.knowledge-tree-list button')).toHaveCount(0);dirFails=false;await tree.getByRole('button',{name:'重试读取目录'}).click();await expect(tree.getByRole('button',{name:/Block B/})).toBeVisible();
   await tree.getByRole('button',{name:/Block B/}).click();await expect(preview).toContainText('Generated B actual stored content');await admin.query("update knowledge_asset set registration_status='withdrawn' where id=$1",[asset]);assert.equal((await api(b)).status,404);await tree.getByRole('button',{name:/Block B/}).click();await expect(tree.getByRole('alert')).toContainText('来源可能已失效');await expect(preview).toHaveCount(0);await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[asset]);await tree.getByRole('button',{name:/Block B/}).click();await expect(preview).toContainText('Generated B actual stored content');await expect(tree.getByRole('alert')).toHaveCount(0);
   holdA=true;ready=false;await tree.getByRole('button',{name:/Block A/}).click();await expect.poll(()=>ready).toBe(true);await library.getByRole('button',{name:'返回资料列表',exact:true}).click();release!();release=undefined;holdA=false;await expect(page.getByRole('region',{name:'原文坐标'})).toHaveCount(0);await library.getByRole('button',{name:title,exact:true}).click();await expect(page.getByRole('region',{name:'原文坐标'}).getByRole('button',{name:/Generated page 1/})).toBeVisible();await expect(page.locator('.knowledge-tree-evidence')).toHaveCount(0);assert.equal(writes,0);assert.deepEqual(errors,[]);assert(await tree.evaluate(element=>element.scrollWidth<=element.clientWidth+1));
   results.push({width,actualOwnedTreeAndNoStore:true,peerAnonymousDenied:true,heldOldReadCannotReplaceNewSelection:true,heldReadCannotCrossDirectoryOrReaderUnmount:true,directory503ClearsOldNodesAndRetry:true,withdrawnAsset404ClearsEvidenceAndRestorationRecovers:true,rawCoordinatesCopiedExactly:true,writes});
  }finally{release?.();await context.close();await admin.query("update knowledge_asset set registration_status='registered' where id=$1",[asset]);}
 }
 const result={knowledgeTreeFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,generatedAccountsAndTreeOnly:true,results,screenshots,actualModelCalls:0,realDocumentQualityAccepted:false,productionQualified:false};await writeFile('tmp/ma24-knowledge-tree-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));await admin.end();clearTimeout(timeout);}}
