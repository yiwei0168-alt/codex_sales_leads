import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:https';
import {request as httpRequest} from 'node:http';
import {chromium} from '@playwright/test';

assert.equal(process.env.MA24_DISPOSABLE_PROSPECTIVE_BROWSER,'1');
const upstream=new URL(process.env.MA24_PROSPECTIVE_BROWSER_UPSTREAM!);
assert.equal(upstream.hostname,'127.0.0.1');assert.equal(upstream.protocol,'http:');
const login=JSON.parse(await readFile(process.env.MA24_PROSPECTIVE_BROWSER_READY!,'utf8')) as {email:string;password:string};
assert(login.email.endsWith('@example.invalid'));
const proxy=createServer({key:await readFile(process.env.MA24_HTTPS_PROBE_KEY!),cert:await readFile(process.env.MA24_HTTPS_PROBE_CERT!)},(req,res)=>{
 const forwarded=httpRequest({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,
  headers:{...req.headers,'x-forwarded-proto':'https'}},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
 forwarded.on('error',()=>{res.writeHead(502);res.end('Disposable upstream unavailable');});req.pipe(forwarded);
});
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 await new Promise<void>((done,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',done);});
 const address=proxy.address();assert(address&&typeof address!=='string');const base=`https://127.0.0.1:${address.port}`;
 browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({ignoreHTTPSErrors:true});const page=await context.newPage();page.setDefaultTimeout(120000);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 assert.equal((await page.goto(base))?.status(),200);
 await page.getByLabel('登录邮箱').fill(login.email);await page.getByLabel('密码',{exact:true}).fill(login.password);
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByRole('navigation',{name:'主导航'}).waitFor();
 const cookie=(await context.cookies()).find(item=>item.name==='network_copilot_session');assert(cookie?.secure&&cookie.httpOnly);
 async function open(){
  assert.equal((await page.goto(`${base}/knowledge`))?.status(),200);
  await page.getByRole('button',{name:'个人记忆',exact:true}).click();
  await page.getByRole('navigation',{name:'学习记忆分区'}).getByRole('button',{name:'Skill',exact:true}).click();
  const skill=page.locator('.memory-skill-row').filter({hasText:'Synthetic prospective source'});
  await skill.getByRole('button',{name:'验收审核',exact:true}).click();
  await page.getByRole('button',{name:'打开验收',exact:true}).click();
  await page.getByRole('combobox',{name:'题目',exact:true}).selectOption('shadow');
  await page.getByText('Synthetic candidate: Please keep responses concise.',{exact:true}).waitFor();
  await page.getByText('Synthetic baseline: Please keep responses concise.',{exact:true}).waitFor();
 }
 await open();
 for(const side of ['原流程','候选 Skill'])for(const metric of ['答案正确','精确引用正确','权限边界遵守','未受注入影响'])
  assert.equal(await page.getByRole('combobox',{name:`${side}：${metric}`,exact:true}).inputValue(),'false');
 await page.getByRole('textbox',{name:'判决依据',exact:true}).fill('Synthetic browser persistence test only; all verdicts fail, no real approval.');
 const saved=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/assistant/skills/acceptance-reviews'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'保存本题判决',exact:true}).click();assert.equal((await saved).status(),200);
 await page.getByText('本题判决已保存',{exact:true}).waitFor();await page.getByText('当前判决 r2',{exact:true}).waitFor();
 await open();
 assert.equal(await page.getByRole('textbox',{name:'判决依据',exact:true}).inputValue(),'Synthetic browser persistence test only; all verdicts fail, no real approval.');
 const revoked=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/assistant/skills/acceptance-reviews'&&response.request().method()==='POST');
 await page.getByRole('button',{name:'撤销本题判决',exact:true}).click();assert.equal((await revoked).status(),200);
 await page.getByText('当前判决 r3（已撤销）',{exact:true}).waitFor();
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({prospectiveBrowserUi:'passed',secureSession:true,actualNavigationAndPairedAnswers:true,
  allFalseVerdictsSavedAndReloaded:true,revocationUi:true,realQualityApproval:false,automaticActivation:false}));
}finally{await browser?.close();await new Promise<void>((done,reject)=>proxy.close(error=>error?reject(error):done()));}
