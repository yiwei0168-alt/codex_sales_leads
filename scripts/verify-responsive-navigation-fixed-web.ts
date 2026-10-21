import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:https';
import {request} from 'node:http';
import {writeFile} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';

assert.equal(process.env.MA24_DISPOSABLE_NAV_UI,'1');
const database=process.env.MA24_NAV_DATABASE_CONTAINER!;assert.match(database,/^[a-f0-9]{64}$/);
const docker=(args:string[])=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
assert.match(docker(['inspect','--format','{{.Name}}',database]),/^\/ma24-pilot-fresh-[a-f0-9]{12}$/);
const upstream=new URL(process.env.MA24_NAV_WEB_BASE!);assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const proxy=createServer({key:docker(['exec',database,'cat','/tmp/ma24-server.key']),cert:docker(['exec',database,'cat','/tmp/ma24-server.crt'])},(incoming,outgoing)=>{
 const forward=request({hostname:upstream.hostname,port:upstream.port,path:incoming.url,method:incoming.method,headers:{...incoming.headers,'x-forwarded-proto':'https'}},response=>{outgoing.writeHead(response.statusCode??502,response.headers);response.pipe(outgoing);});forward.on('error',()=>{outgoing.writeHead(502);outgoing.end();});incoming.pipe(forward);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
const watchdog=setTimeout(()=>{console.error('Responsive navigation fixture watchdog expired');process.exit(1);},90000);watchdog.unref();
try{
 await new Promise<void>(done=>proxy.listen(0,'127.0.0.1',done));const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});const screenshots:string[]=[],errors:string[]=[];let nonReadRequests=0;
 const openContext=async(viewport:{width:number;height:number})=>{
  const context=await browser!.newContext({ignoreHTTPSErrors:true,viewport});const cookie=process.env.MA24_NAV_OWNER_COOKIE!,separator=cookie.indexOf('=');assert(separator>0);
  await context.addCookies([{name:cookie.slice(0,separator),value:cookie.slice(separator+1),url:base,httpOnly:true,secure:true,sameSite:'Lax'}]);
  await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==base)return route.abort();if(!['GET','HEAD'].includes(route.request().method())){nonReadRequests++;return route.abort();}return route.continue();});return context;
 };
 const context=await openContext({width:1366,height:900}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
 assert.equal((await page.goto(base+'/knowledge'))?.status(),200);await page.getByRole('button',{name:'个人记忆',exact:true}).click();const content=page.locator('section[aria-label="学习记忆"]');await expect(content).toBeVisible();
 const sidebar=page.locator('#primary-navigation'),trigger=page.getByRole('button',{name:'打开导航菜单',exact:true});
 await expect(sidebar).toBeVisible();await expect(trigger).toBeHidden();
 const closedSamples:unknown[]=[];
 const closed=async()=>{
  await expect(trigger).toHaveAttribute('aria-expanded','false');
  const sampled=await sidebar.evaluate(element=>({visibility:getComputedStyle(element).visibility,labels:[...element.querySelectorAll('.nav-item,.nav-item span')].map(item=>getComputedStyle(item).visibility)}));
  assert.equal(sampled.visibility,'hidden');assert(sampled.labels.every(value=>value==='hidden'));closedSamples.push(sampled);
  await expect(page.locator('.mobile-nav-backdrop')).toHaveCount(0);
  await expect(sidebar).not.toHaveAttribute('role','dialog');
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
 };
 const opened=async()=>{
  await trigger.click();await expect(sidebar).toHaveAttribute('role','dialog');await expect(sidebar).toHaveAttribute('aria-modal','true');
  await expect.poll(()=>sidebar.evaluate(element=>Math.round(element.getBoundingClientRect().x))).toBe(0);
  await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).toBe('hidden');
  await content.getByRole('button',{name:'当前有效',exact:true}).focus();assert(await sidebar.evaluate(element=>element.contains(document.activeElement)));
 };
 await page.setViewportSize({width:390,height:844});await closed();await content.getByRole('button',{name:'当前有效',exact:true}).focus();await expect(content.getByRole('button',{name:'当前有效',exact:true})).toBeFocused();
 const closedScreenshot=`tmp/ma24-navigation-closed-${randomUUID()}.png`;await page.screenshot({path:closedScreenshot,fullPage:true});screenshots.push(closedScreenshot);
 await opened();const openScreenshot=`tmp/ma24-navigation-open-${randomUUID()}.png`;await page.screenshot({path:openScreenshot,fullPage:true});screenshots.push(openScreenshot);
 await page.keyboard.press('Escape');await closed();await expect(trigger).toBeFocused();
 await opened();await page.locator('.mobile-nav-backdrop').click({position:{x:382,y:500}});await closed();
 await opened();await sidebar.getByRole('button',{name:'知识库',exact:true}).click();await closed();
 // The route can replace its client shell after the immediate close. Finish
 // that read transition before opening the next independent dialog scenario.
 await page.waitForLoadState('networkidle');
 if(!await content.isVisible())await page.getByRole('button',{name:'个人记忆',exact:true}).click();await expect(content).toBeVisible();
 await opened();await sidebar.getByRole('button',{name:'帮助',exact:true}).click();await expect(sidebar.locator('.footer-menu')).toBeVisible();
 await page.setViewportSize({width:960,height:900});await expect(sidebar).not.toHaveAttribute('role','dialog');await expect(sidebar.locator('.footer-menu')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');await content.getByRole('button',{name:'当前有效',exact:true}).focus();await expect(content.getByRole('button',{name:'当前有效',exact:true})).toBeFocused();await expect(sidebar).toBeVisible();
 await page.setViewportSize({width:959,height:900});await closed();await opened();await sidebar.getByRole('button',{name:'关闭导航菜单',exact:true}).click();await closed();
 await page.setViewportSize({width:1366,height:900});await page.getByRole('button',{name:'收起侧栏',exact:true}).click();await expect(sidebar).toBeHidden();
 await page.setViewportSize({width:320,height:740});await closed();await opened();await page.keyboard.press('Escape');await closed();
 await page.setViewportSize({width:1366,height:900});await expect(sidebar).toBeHidden();await page.getByRole('button',{name:'展开侧栏',exact:true}).click();await expect(sidebar).toBeVisible();
 await context.close();
 const initialMobile=await openContext({width:320,height:740}),initialPage=await initialMobile.newPage();initialPage.on('pageerror',error=>errors.push(error.message));
 assert.equal((await initialPage.goto(base+'/knowledge'))?.status(),200);await expect(initialPage.locator('#primary-navigation')).toBeHidden();
 assert(await initialPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await initialMobile.close();assert.deepEqual(errors,[]);assert.equal(nonReadRequests,0);
 const result={responsiveNavigationFixedWeb:'passed',actualChromeHttpsCompiledWeb:true,closedLabelsHiddenFromFirstResizeSample:true,
  desktopAndInitialMobile:true,viewports:['1366x900','960x900','959x900','390x844','320x740'],mobileOpenCloseEscapeBackdropAndNavigation:true,
  focusTrappedOnlyWhileMobileOpen:true,desktopResizeClearsDialogFooterAndScrollLock:true,desktopCollapsePreferencePreserved:true,
  contentFocusRestored:true,noHorizontalOverflow:true,noPageErrors:true,nonReadRequests,closedSamples,screenshots,actualModelCalls:0,realBusinessQualityAccepted:false,productionQualified:false};
 await writeFile('tmp/ma24-responsive-navigation-result.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{
 clearTimeout(watchdog);const timeout=setTimeout(()=>process.exit(1),15000);timeout.unref();
 try{await browser?.close();}finally{proxy.closeAllConnections();if(proxy.listening)await new Promise<void>(done=>proxy.close(()=>done()));clearTimeout(timeout);}
}
