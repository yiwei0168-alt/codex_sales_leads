import assert from 'node:assert/strict';
import {spawn,type ChildProcess} from 'node:child_process';
import {createServer} from 'node:net';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
import type {Pool} from 'pg';
import {fetch as localFetch} from 'undici';

async function freePort(){
 const server=createServer();await new Promise<void>((accept,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',accept);});
 const address=server.address();assert(address&&typeof address!=='string');
 await new Promise<void>((accept,reject)=>server.close(error=>error?reject(error):accept()));return address.port;
}
async function ready(base:string,child:ChildProcess){
 const deadline=Date.now()+45000;
 while(Date.now()<deadline){
  if(child.exitCode!==null)throw new Error('Isolated candidate Web exited before readiness');
  try{const response=await localFetch(`${base}/api/auth/session`,{signal:AbortSignal.timeout(2000)});await response.body?.cancel();if(response.status===200)return;}
  catch{ /* Wait for the owned loopback server. */ }
  await new Promise(accept=>setTimeout(accept,500));
 }
 throw new Error('Isolated candidate Web did not become ready');
}
async function stop(child:ChildProcess){
 if(!child.pid||child.exitCode!==null)return;
 const closed=new Promise<void>(accept=>child.once('close',()=>accept()));
 if(process.platform==='win32'){
  const killer=spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  await new Promise<void>((accept,reject)=>{killer.once('error',reject);killer.once('exit',code=>code===0?accept():reject(new Error('Isolated candidate Web did not stop')));});
 }else child.kill('SIGTERM');
 await closed;
}

export async function verifyMa24SkillReviewUiClone(input:{pool:Pool;owner:string;email:string;password:string;applicationDatabaseUrl:string;migrationDatabaseUrl:string;bundleId:string;skillId:string}){
 assert(/^ma11_replay_[a-f0-9]{12}$/.test((await input.pool.query('select current_database() as name')).rows[0].name));
 const buildId=(await readFile(resolve('.next/BUILD_ID'),'utf8')).trim();assert(buildId);
 const port=await freePort(),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,[resolve('node_modules/next/dist/bin/next'),'start','-H','127.0.0.1','-p',String(port)],{
  cwd:process.cwd(),env:{...process.env,NODE_ENV:'production',DATABASE_URL:input.applicationDatabaseUrl,DATABASE_MIGRATION_URL:input.migrationDatabaseUrl},
  windowsHide:true,stdio:['ignore','pipe','pipe']});
 let output='';for(const stream of [child.stdout,child.stderr])stream?.on('data',part=>{output=`${output}${part}`.slice(-8000);});
 let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  await ready(base,child);browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1366,height:900}});
  await page.goto(base);await page.getByLabel('登录邮箱').fill(input.email);await page.getByLabel('密码',{exact:true}).fill(input.password);
  const login=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/auth/login'&&response.request().method()==='POST');
  await page.getByRole('button',{name:'登录',exact:true}).click();assert.equal((await login).status(),200);
  await page.goto(`${base}/knowledge`);
  await page.getByRole('button',{name:'个人记忆'}).click();
  await page.getByRole('navigation',{name:'学习记忆分区'}).getByRole('button',{name:'Skill',exact:true}).click();
  const row=page.locator('.memory-skill-row').filter({hasText:'Candidate source fixture'});
  await expect(row).toBeVisible();await row.getByRole('button',{name:'验收审核'}).click();
  const review=page.getByRole('region',{name:'Skill 验收审核'});
  await expect(review).toBeVisible();
  const bundleIndex=async()=>{
   const list=await page.evaluate(async skillId=>{
    const response=await fetch(`/api/assistant/skills/acceptance-reviews?skillId=${skillId}&offset=0`,{cache:'no-store'});
    if(!response.ok)throw new Error(`Skill review list HTTP ${response.status}`);
    return response.json();
   },input.skillId) as {items:Array<{id:string}>};
   const index=list.items.findIndex(item=>item.id===input.bundleId);assert(index>=0,'Synthetic review bundle not listed');return index;
  };
  await review.getByRole('button',{name:'打开验收'}).nth(await bundleIndex()).click();
  try{await expect(review.getByText('Synthetic original task',{exact:true})).toBeVisible({timeout:10000});}
  catch{throw new Error(`Expected synthetic review material unavailable: ${(await review.innerText()).slice(0,1100)}`);}
  const selectedCase=await review.getByRole('navigation',{name:'验收题目'}).locator('select').inputValue();
  const material=await page.evaluate(async ({bundleId,caseId})=>{
   const response=await fetch(`/api/assistant/skills/acceptance-reviews?id=${encodeURIComponent(bundleId)}&caseId=${encodeURIComponent(caseId)}`,{cache:'no-store'});
   if(!response.ok)throw new Error(`Skill review material HTTP ${response.status}`);
   return response.json();
  },{bundleId:input.bundleId,caseId:selectedCase}) as {receipts:unknown[]};
  const rawReceipts=review.locator('.raw-json-details').filter({hasText:'完整证据记录与坐标'});
  await expect(rawReceipts).not.toHaveAttribute('open');
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin:base});
  await rawReceipts.locator('summary').click();
  await rawReceipts.getByRole('button',{name:'复制 JSON'}).click();
  assert.deepEqual(JSON.parse(await page.evaluate(()=>navigator.clipboard.readText())),material.receipts);
  await expect(review.getByText('合成测试材料',{exact:false})).toBeVisible();
  await page.setViewportSize({width:390,height:800});
  const closeNavigation=page.getByRole('button',{name:'关闭导航菜单'}).first();
  if(await closeNavigation.isVisible())await closeNavigation.click();
  await expect(page.locator('.mobile-nav-backdrop')).toBeHidden();
  await expect.poll(()=>page.locator('#primary-navigation').evaluate(element=>element.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  await expect(review.getByText('Synthetic original task',{exact:true})).toBeVisible();
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
  await page.screenshot({path:'tmp/ma24-skill-review-page-clone-mobile.png'});
  await page.setViewportSize({width:1366,height:900});
  for(const side of ['原流程','候选 Skill'])for(const metric of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])
   await review.getByLabel(`${side}：${metric}`).selectOption('false');
  const rationale='Synthetic isolated UI-to-database verification; no quality approval';
  await review.getByLabel('判决依据').fill(rationale);
  const saveResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/assistant/skills/acceptance-reviews'&&response.request().method()==='POST');
  await review.getByRole('button',{name:'保存本题判决'}).click();
  const savedHttp=await saveResponse;
  if(savedHttp.status()!==200){
   const requestHeaders=await savedHttp.request().allHeaders();
   throw new Error(`Skill review save HTTP ${savedHttp.status()}: ${(await savedHttp.text()).slice(0,400)}; browser URL ${page.url()}; POST URL ${savedHttp.url()}; origin ${requestHeaders.origin??'none'}; sec-fetch-site ${requestHeaders['sec-fetch-site']??'none'}`);
  }
  try{await expect(review.getByText('本题判决已保存')).toBeVisible({timeout:10000});}
  catch{throw new Error(`Skill review save notice missing: ${(await review.innerText()).slice(0,900)}`);}
  const saved=(await input.pool.query<{revision:number;reviewer_kind:string;judgment:{rationale:string;revoked:boolean}}>(
   'select revision,reviewer_kind,judgment from agent_skill_acceptance_judgment where bundle_id=$1 and owner_id=$2 order by revision',[input.bundleId,input.owner])).rows;
  assert.equal(saved.length,1);assert.equal(saved[0].revision,1);assert.equal(saved[0].reviewer_kind,'human');
  assert.equal(saved[0].judgment.rationale,rationale);assert.equal(saved[0].judgment.revoked,false);
  await page.reload();await page.getByRole('button',{name:'个人记忆'}).click();
  await page.getByRole('navigation',{name:'学习记忆分区'}).getByRole('button',{name:'Skill',exact:true}).click();
  await page.locator('.memory-skill-row').filter({hasText:'Candidate source fixture'}).getByRole('button',{name:'验收审核'}).click();
  const refreshed=page.getByRole('region',{name:'Skill 验收审核'});
  await refreshed.getByRole('button',{name:'打开验收'}).nth(await bundleIndex()).click();
  await expect(refreshed.getByText('当前判决 r1')).toBeVisible();
  await refreshed.getByRole('button',{name:'撤销本题判决'}).click();await expect(refreshed.getByText('判决已撤销')).toBeVisible();
  const revoked=(await input.pool.query<{revision:number;judgment:{revoked:boolean}}>(
   'select revision,judgment from agent_skill_acceptance_judgment where bundle_id=$1 and owner_id=$2 order by revision desc limit 1',[input.bundleId,input.owner])).rows[0];
  assert.equal(revoked.revision,2);assert.equal(revoked.judgment.revoked,true);
  assert.equal((await input.pool.query('select enabled from agent_skill where id=$1',[input.skillId])).rows[0].enabled,false);
  return {candidateWebBuildId:buildId,syntheticBundle:true,pageOpened:true,materialFromDatabase:true,exactRawReceiptCopiedFromDatabase:true,
   savedHumanRouteRevision:1,refreshRestoredRevision:true,revokedRevision:2,skillRemainedDisabled:true,
   mobileNoHorizontalOverflow:true,modelCalls:0,productionChanged:false};
 }catch(error){
  const diagnostic=output.split(/\r?\n/).filter(line=>/permission denied|does not exist|ECONN|error:/i.test(line)).slice(-6).join(' | ')
   .replaceAll(input.email,'<synthetic-email>').replaceAll(input.password,'<synthetic-password>')
   .replaceAll(input.applicationDatabaseUrl,'<clone-db>').replaceAll(input.migrationDatabaseUrl,'<clone-db>').slice(0,900);
  throw new Error(`Skill review UI clone failed: ${error instanceof Error?error.message:'unknown'}; server diagnostic: ${diagnostic||'none'}`);
 }finally{await browser?.close();await stop(child);}
}
