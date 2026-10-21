import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer as createTcpServer} from 'node:net';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {fetch as fetchLocal} from 'undici';
import type {Pool} from 'pg';
import {previewSkillAcceptanceOriginals,OriginalSourcesPendingError} from '../../src/lib/assistant/main/skill-acceptance-originals';

export async function verifySkillDraftFixedWeb(input:{pool:Pool;owner:string;email:string;password:string;bundleId:string;skillId:string;applicationDatabaseUrl:string;
 originalAsset:{id:string;storageKey:string;sourceSha256:string};expectedQuestion:string}){
 assert.equal(process.env.MA24_DISPOSABLE_REVIEW_IMAGE,'1');
 const image=process.env.MA24_REVIEW_IMAGE!,network=process.env.MA24_REVIEW_NETWORK!,db=process.env.MA24_REVIEW_DATABASE_CONTAINER!;
 assert.match(image,/^[a-zA-Z0-9][a-zA-Z0-9_.:/-]*$/);assert.match(network,/^ma24-pilot-net-[a-f0-9]{12}$/);assert.match(db,/^[a-f0-9]{64}$/);
 assert.match((await input.pool.query('select current_database() name')).rows[0].name,/^ma11_replay_[a-f0-9]{12}$/);
 assert.match(input.originalAsset.storageKey,/^knowledge\/ma24-review-original-[a-f0-9-]{36}\.txt$/);
 await assert.rejects(previewSkillAcceptanceOriginals({userId:input.owner},input.bundleId),error=>error instanceof OriginalSourcesPendingError&&error.missingCaseCount===4);
 const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
 const imageMeta=JSON.parse(docker(['image','inspect','--format','{"id":{{json .Id}},"revision":{{json (index .Config.Labels "org.opencontainers.image.revision")}}}',image]));
 assert.match(imageMeta.id,/^sha256:[a-f0-9]{64}$/);assert.match(imageMeta.revision,/^[a-f0-9]{40}$/);
 const ca=docker(['exec',db,'cat','/tmp/ma24-server.crt']),key=docker(['exec',db,'cat','/tmp/ma24-server.key']);
 const listener=createTcpServer();await new Promise<void>(done=>listener.listen(0,'127.0.0.1',done));const socket=listener.address();assert(socket&&typeof socket!=='string');const port=socket.port;await new Promise<void>(done=>listener.close(()=>done()));
 const runtime=new URL(input.applicationDatabaseUrl);runtime.hostname='pilot-db';runtime.port='5432';runtime.searchParams.set('sslmode','verify-full');
 let container:string|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 const proxy=createServer({key,cert:ca},(incoming,outgoing)=>{
  const forwarded=request({hostname:'127.0.0.1',port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});
  forwarded.on('error',()=>{outgoing.writeHead(502);outgoing.end('Disposable upstream unavailable');});incoming.pipe(forwarded);
 });
 try{
  container=docker(['run','--detach','--name',`ma24-review-web-${input.owner.slice(0,8)}`,'--network',network,'--publish',`127.0.0.1:${port}:3000`,
   '--env',`DATABASE_URL=${runtime}`,'--env',`DATABASE_SSL_CA=${ca}`,'--security-opt','no-new-privileges','--cap-drop=ALL',imageMeta.id]);assert.match(container,/^[a-f0-9]{64}$/);
  // Match an already-uploaded attachment using only this generated fixture;
  // pending capture must be rejected for coverage, not for a missing file.
  docker(['cp',input.originalAsset.storageKey,`${container}:/app/${input.originalAsset.storageKey}`]);
  let ready=false;for(let i=0;i<120;i++){try{ready=(await fetchLocal(`http://127.0.0.1:${port}/api/auth/session`)).ok;}catch{}if(ready)break;await new Promise(done=>setTimeout(done,200));}assert(ready,docker(['logs',container]));
  await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
  browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1366,height:900}}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(30000);
  await page.goto(base);await page.getByLabel('登录邮箱').fill(input.email);await page.getByLabel('密码',{exact:true}).fill(input.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByRole('navigation',{name:'主导航'}).waitFor();
  const session=(await context.cookies()).find(c=>c.name==='network_copilot_session');assert(session?.secure&&session.httpOnly);
  const endpoint='/api/assistant/skills/acceptance-reviews';
  const open=async()=>{await page.goto(base+'/knowledge');await page.getByRole('button',{name:'个人记忆',exact:true}).click();await page.getByRole('navigation',{name:'学习记忆分区'}).getByRole('button',{name:'Skill',exact:true}).click();
   await page.locator('.memory-skill-row').filter({hasText:'Candidate source fixture'}).getByRole('button',{name:'验收审核',exact:true}).click();
   const list=await context.request.get(`${base}${endpoint}?skillId=${input.skillId}`);assert.equal(list.status(),200);const index=(await list.json() as {items:Array<{id:string}>}).items.findIndex(row=>row.id===input.bundleId);assert(index>=0);
   await page.getByRole('button',{name:'打开验收',exact:true}).nth(index).click();await page.getByText(input.expectedQuestion,{exact:true}).waitFor();
  };
  await open();const materialResponse=await context.request.get(`${base}${endpoint}?id=${input.bundleId}&caseId=replay`);assert.equal(materialResponse.status(),200);
  const material=await materialResponse.json() as {artifactHash:string;observationHash:string;question:string};
  assert.equal(material.question,input.expectedQuestion);
  const originalsEndpoint='/api/assistant/skills/acceptance-originals';
  const originalGroup=page.getByRole('group',{name:'文件原件副本',exact:true});
  await expect(originalGroup.getByRole('alert')).toHaveText('本组还有 4 个样本未采集完整，请在完整验收记录中保存原件副本。');
  await expect(originalGroup.getByRole('button',{name:'保存原件副本',exact:true})).toHaveCount(0);
  const originalChecked=await context.request.get(`${base}${originalsEndpoint}?bundleId=${input.bundleId}`);assert.equal(originalChecked.status(),409);
  assert.equal((await originalChecked.json()).code,'original-sources-pending');
  const refusedCapture=await context.request.post(base+originalsEndpoint,{headers:{origin:base},data:{bundleId:input.bundleId,artifactHash:material.artifactHash,sourceManifestHash:'0'.repeat(64)}});
  assert.equal(refusedCapture.status(),409);assert.equal((await refusedCapture.json()).code,'original-sources-pending');
  assert.equal((await input.pool.query('select count(*)::int n from knowledge_asset_immutable_snapshot where asset_id=$1',[input.originalAsset.id])).rows[0].n,0);
  const falseVerdict={answer:false,citation:false,permission:false,injection:false};
  const post=async(revision:number,rationale:string)=>context.request.post(base+endpoint,{headers:{origin:base},data:{bundleId:input.bundleId,artifactHash:material.artifactHash,expectedRevision:revision,judgment:{caseId:'replay',observationHash:material.observationHash,revoked:false,baseline:falseVerdict,candidate:falseVerdict,rationale}}});
  for(const side of ['原流程','候选 Skill'])for(const metric of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])await page.getByLabel(`${side}：${metric}`,{exact:true}).selectOption('false');
  const save=async()=>{const response=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');await page.getByRole('button',{name:'保存本题判决',exact:true}).click();assert.equal((await response).status(),200);await page.getByText('本题判决已保存',{exact:true}).waitFor();};
  await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Synthetic real-route r1; all false');await save();
  await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic real-route r1; all false');
  await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Synthetic preserved draft r3; all false');assert.equal((await post(1,'Synthetic concurrent r2; all false')).status(),200);
  await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await expect(page.getByRole('button',{name:'保存本题判决',exact:true})).toBeDisabled();
  await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic preserved draft r3; all false');await page.getByText('查看最新判决',{exact:true}).click();await page.getByText('Synthetic concurrent r2; all false',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:800});
  const closeNavigation=page.getByRole('button',{name:'关闭导航菜单'}).first();if(await closeNavigation.isVisible())await closeNavigation.click();
  await page.keyboard.press('Escape');await page.mouse.move(380,780);
  await expect(page.locator('.mobile-nav-backdrop')).toBeHidden();
  await expect.poll(()=>page.locator('#primary-navigation').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await page.getByRole('button',{name:'已核对最新判决，继续使用草稿',exact:true}).scrollIntoViewIfNeeded();
  await mkdir('tmp/skill-review-fixed-web',{recursive:true});await page.screenshot({path:'tmp/skill-review-fixed-web/conflict-mobile.png'});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.setViewportSize({width:1366,height:900});
  await page.getByRole('button',{name:'已核对最新判决，继续使用草稿',exact:true}).click();await save();assert.equal((await post(1,'Synthetic stale write must fail')).status(),409);
  await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic preserved draft r3; all false');
  await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Synthetic confirmed r4 before readback failure; all false');
  let failReadback=true;
  const failRoute=async(route:import('@playwright/test').Route)=>{const url=new URL(route.request().url());if(failReadback&&route.request().method()==='GET'&&url.pathname===endpoint&&url.searchParams.get('id')===input.bundleId&&!url.searchParams.has('caseId')){failReadback=false;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Synthetic summary readback unavailable'})});}else await route.continue();};
  await page.route('**/api/assistant/skills/acceptance-reviews?*',failRoute);await save();await expect(page.getByText('判决已保存，但最新状态暂时无法读取；请重新核对后继续。',{exact:false})).toBeVisible();await expect(page.getByRole('button',{name:'撤销本题判决',exact:true})).toBeDisabled();await page.unroute('**/api/assistant/skills/acceptance-reviews?*',failRoute);
  await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic confirmed r4 before readback failure; all false');
  let initialRace=true;
  const raceRoute=async(route:import('@playwright/test').Route)=>{const url=new URL(route.request().url());if(initialRace&&url.pathname===endpoint&&url.searchParams.get('caseId')==='replay'){initialRace=false;assert.equal((await post(4,'Synthetic concurrent initial material r5; all false')).status(),200);}await route.continue();};
  await page.route('**/api/assistant/skills/acceptance-reviews?*',raceRoute);await open();await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic concurrent initial material r5; all false');await page.unroute('**/api/assistant/skills/acceptance-reviews?*',raceRoute);
  await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Synthetic draft to discard');assert.equal((await post(5,'Synthetic adopted latest r6; all false')).status(),200);await page.getByRole('button',{name:'重新核对并保留草稿',exact:true}).click();await page.getByRole('button',{name:'采用最新判决',exact:true}).click();await expect(page.getByRole('textbox',{name:'判决依据',exact:true})).toHaveValue('Synthetic adopted latest r6; all false');
  const revoked=page.waitForResponse(r=>new URL(r.url()).pathname===endpoint&&r.request().method()==='POST');await page.getByRole('button',{name:'撤销本题判决',exact:true}).click();assert.equal((await revoked).status(),200);await page.getByText('当前判决 r7（已撤销）',{exact:true}).waitFor();
  const judgments=(await input.pool.query('select revision,reviewer_id,reviewer_kind,judgment from agent_skill_acceptance_judgment where bundle_id=$1 order by revision',[input.bundleId])).rows;
  assert.deepEqual(judgments.map(row=>row.revision),[1,2,3,4,5,6,7]);assert(judgments.every(row=>row.reviewer_id===input.owner&&row.reviewer_kind==='human'&&Object.values(row.judgment.baseline).every(v=>v===false)&&Object.values(row.judgment.candidate).every(v=>v===false)));assert.equal(judgments[2].judgment.rationale,'Synthetic preserved draft r3; all false');assert.equal(judgments[3].judgment.rationale,'Synthetic confirmed r4 before readback failure; all false');assert.equal(judgments[6].judgment.revoked,true);
  assert.equal((await input.pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);assert.deepEqual(errors,[]);
  const result={skillReviewDraftFixedWeb:'passed',database:(await input.pool.query('select current_database() name')).rows[0].name,image,immutableImageId:imageMeta.id,sourceCommit:imageMeta.revision,actualChromeAndHttpAndDatabase:true,secureSession:true,
   initialRevisionRaceReconciled:true,dirtyDraftKeptUntilExplicitChoice:true,staleRevision409:true,confirmedWriteWithReadbackFaultPreserved:true,adoptLatest:true,revokedRevision:7,humanRevisionCount:7,
   allSyntheticVerdictsFalse:true,skillRemainedDisabled:true,mobileNoHorizontalOverflow:true,realQualityApproval:false,modelCalls:0};
  Object.assign(result,{incompleteOriginalSourcesExplained:true,missingOriginalCaseCount:4,partialOriginalCaptureRefused:true,originalSnapshotCount:0});
  await writeFile('tmp/skill-review-fixed-web/result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return {humanRevisionCount:judgments.length,expectedQuestion:input.expectedQuestion};
 }finally{await browser?.close();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));if(container)docker(['rm','--force','--volumes',container]);}
}
