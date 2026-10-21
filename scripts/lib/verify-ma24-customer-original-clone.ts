import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium,expect,type Route} from '@playwright/test';
import type {Client} from 'pg';
import {ma24BrowserContext,ma24FixtureFetch} from './ma24-browser-context';

export async function verifyMa24CustomerOriginalClone(options:{admin:Client;base:string;cookie:string;peerCookie:string;userId:string;allowSelfSignedLoopback?:boolean}){
 assert.equal(process.env.MA24_DISPOSABLE_READER_UI,'1');assert.equal(new URL(options.base).hostname,'127.0.0.1');
 const owner=(await options.admin.query('select email from app_user where id=$1',[options.userId])).rows[0];assert.match(owner.email,/^pilot-container-[a-f0-9]{12}-0@example\.invalid$/);
 const messages=(await options.admin.query("select m.id from mailbox_message m join mailbox_connection c on c.id=m.connection_id where m.user_id=$1 and c.email='ma24-reader@example.invalid' and m.uid_validity like 'ma24-corr-%' order by m.message_uid limit 2",[options.userId])).rows;assert.equal(messages.length,2);
 const get=(path:string,cookie=options.cookie)=>ma24FixtureFetch(options,options.base+path,{headers:{cookie}});
 const customers:Array<{id:string;name:string;messageId:string;body:string}>=[];
 for(let index=0;index<2;index++){
  const id=randomUUID(),name=`Generated original customer ${index}`;
  await options.admin.query("insert into mailbox_customer(id,user_id,identity_key,name,domain,country,customer_type,confirmed) values($1,$2,$3,$4,$5,'DE','inquiry',true)",[id,options.userId,'generated-original-'+id,name,`customer-${index}.example.invalid`]);
  await options.admin.query("insert into mailbox_customer_message(user_id,customer_id,message_id,source) values($1,$2,$3,'confirmed')",[options.userId,id,messages[index].id]);
  const response=await get('/api/mailbox/messages/'+messages[index].id);assert.equal(response.status,200);const data=await response.json() as {message:{id:string;bodyText:string}};assert.equal(data.message.id,messages[index].id);assert(data.message.bodyText.startsWith(`Generated company original ${index}`));
  const timeline=await get('/api/mailbox/customers?id='+id);assert.equal(timeline.status,200);const content=await timeline.json() as {customer:{id:string};events:Array<{id:string}>};assert.equal(content.customer.id,id);assert.deepEqual(content.events.map(row=>row.id),[messages[index].id]);
  assert.equal((await get('/api/mailbox/customers?id='+id,options.peerCookie)).status,404);assert.equal((await get('/api/mailbox/customers?id='+id,'')).status,401);
  customers.push({id,name,messageId:messages[index].id,body:data.message.bodyText});
 }
 const browser=await chromium.launch({channel:'chrome',headless:true}),results:unknown[]=[],screenshots:string[]=[];
 try{
  for(const viewport of [{width:1366,height:900},{width:1366,height:360},{width:390,height:760}]){
   const context=await ma24BrowserContext(browser,options,{viewport});const[name,value]=options.cookie.split('=');assert(name&&value);await context.addCookies([{name,value,url:options.base}]);
   try{
    const page=await context.newPage(),errors:string[]=[],mutations:string[]=[];let timelineReads=0,held:Route|null=null;
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{const path=new URL(request.url()).pathname;if(path==='/api/mailbox/customers'&&request.method()==='GET'&&new URL(request.url()).searchParams.has('id'))timelineReads++;if((path==='/api/mailbox/customers'||path.startsWith('/api/mailbox/messages/'))&&request.method()!=='GET')mutations.push(request.method());});
    await page.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>original(input,{...init,signal:undefined});});
    await page.goto(options.base);if(viewport.width<700)await page.getByRole('button',{name:'打开导航菜单'}).click();await page.getByRole('button',{name:'客户开发',exact:true}).click();await page.getByRole('navigation',{name:'客户开发页签'}).getByRole('button',{name:'邮箱'}).click();await page.getByRole('tab',{name:'客户与时间线',exact:true}).click();
    const list=page.locator('.customer-list'),timeline=page.getByRole('region',{name:'客户沟通时间线'}),dialog=page.getByRole('dialog',{name:'原邮件正文'});
    await list.getByRole('button',{name:new RegExp(customers[0].name)}).click();await page.route('**/api/mailbox/messages/'+customers[0].messageId,route=>{held=route;},{times:1});await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.getByRole('status')).toContainText('正在读取');await expect.poll(()=>Boolean(held)).toBe(true);await dialog.getByRole('button',{name:'关闭窗口'}).click();
    if(viewport.width<700)await timeline.getByRole('button',{name:'返回公司列表'}).click();await list.getByRole('button',{name:new RegExp(customers[1].name)}).click();await expect(timeline.getByRole('button',{name:'查看原邮件',exact:true})).toBeVisible();const readCount=timelineReads;
    await page.route('**/api/mailbox/messages/'+customers[1].messageId,route=>route.fulfill({status:503,json:{error:'synthetic-original-failure'}}),{times:1});await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('原邮件读取失败');await expect(dialog.locator('pre')).toHaveCount(0);await dialog.getByRole('button',{name:'重试原邮件'}).click();await expect(dialog.locator('pre')).toHaveText(customers[1].body);
    assert(held);const completed=page.waitForResponse(response=>response.url().endsWith('/'+customers[0].messageId));await (held as Route).fulfill({json:{message:{id:customers[0].messageId,bodyText:customers[0].body}}});await(await completed).finished();await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));await expect(dialog.locator('pre')).toHaveText(customers[1].body);assert.equal(timelineReads,readCount);
    const body=dialog.locator('.workspace-dialog-body');assert(await body.evaluate(el=>el.scrollWidth<=el.clientWidth+1));if(viewport.height<500){assert(await body.evaluate(el=>el.scrollHeight>el.clientHeight));await body.evaluate(el=>el.scrollTop=0);await body.hover();await page.mouse.wheel(0,500);await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);}assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    const screenshot=`tmp/ma24-customer-original-${viewport.width}x${viewport.height}-${customers[0].id.slice(0,8)}.png`;await page.screenshot({path:screenshot,fullPage:true});screenshots.push(screenshot);await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(timeline.getByRole('button',{name:'查看原邮件',exact:true})).toBeFocused();
    await page.route('**/api/mailbox/messages/'+customers[1].messageId,route=>route.fulfill({status:404,json:{error:'synthetic-unavailable'}}),{times:1});await timeline.getByRole('button',{name:'查看原邮件',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('原邮件当前不可读取');await expect(dialog.locator('pre')).toHaveCount(0);await dialog.getByRole('button',{name:'重试原邮件'}).click();await expect(dialog.locator('pre')).toHaveText(customers[1].body);assert.equal(timelineReads,readCount);assert.deepEqual(errors,[]);assert.deepEqual(mutations,[]);
    results.push({viewport,actualOwnedTimelineAndEncryptedOriginal:true,closedLateReadCannotReplaceOtherCompanyOriginal:true,original503And404LocalRetry:true,bodyReadDoesNotRefreshTimeline:true,reopenReadsCurrentSource:true,escapeAndFocusReturn:true,shortWindowBodyScroll:viewport.height<500,noHorizontalOverflow:true,pageErrors:0,mutations:0});
   }finally{await context.close();}
  }
  return {customerOriginalFixedPage:'passed',generatedCustomers:2,ownerTimelineAndPeerAnonymousRefusal:true,results,screenshots,actualModelCalls:0,mailSends:0,realCustomerQualityAccepted:false};
 }finally{await browser.close();}
}
