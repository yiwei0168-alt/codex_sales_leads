import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdir} from 'node:fs/promises';
import {chromium,expect} from '@playwright/test';
import {Pool} from 'pg';
import {hashPassword} from '../src/lib/auth/password';
const base=process.env.UI_VERIFY_BASE_URL??'http://127.0.0.1:3018';
const url=process.env.DATABASE_MIGRATION_URL!;
assert(['localhost','127.0.0.1'].includes(new URL(base).hostname)&&['localhost','127.0.0.1'].includes(new URL(url).hostname));
const pool=new Pool({connectionString:url}),user=randomUUID(),workspace=randomUUID();
const email=`mode-picker-${user}@example.invalid`,password=randomBytes(30).toString('base64url');
const browser=await chromium.launch({channel:'chrome',headless:true});
let created=false,taskRequests=0;
const screenshots:string[]=[],errors:string[]=[];
try{
 await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Mode picker fixture',$3,'member','active')",[user,email,hashPassword(password)]);created=true;
 await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Mode fixture','Global','WW','Synthetic UI only')",[workspace,user]);
 await mkdir('tmp/mode-picker',{recursive:true});
 for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:740}]){
  const context=await browser.newContext({viewport});
  await context.route('**/*',route=>{
   const request=route.request(),target=new URL(request.url());
   if(!['localhost','127.0.0.1'].includes(target.hostname))return route.abort();
   if(target.pathname==='/api/assistant/messages'&&request.method()==='POST'){taskRequests++;return route.abort();}
   return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.getByLabel('登录邮箱').fill(email);await page.getByLabel('密码',{exact:true}).fill(password);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  const group=page.getByRole('group',{name:'任务模式'}),text=page.locator('.ai-composer textarea');
  await expect(group.getByRole('radio',{name:'标准工作'})).toBeChecked();
  await text.fill('保留输入，切换模式不发送任务');
  await group.getByRole('radio',{name:'快速问答'}).check();
  await expect(page.locator('#agent-mode-hint')).toContainText('只读查询');
  await expect(text).toHaveValue('保留输入，切换模式不发送任务');
  await group.getByRole('radio',{name:'快速问答'}).focus();await page.keyboard.press('ArrowRight');
  await expect(group.getByRole('radio',{name:'标准工作'})).toBeChecked();
  await page.keyboard.press('ArrowRight');await expect(group.getByRole('radio',{name:'深入研究'})).toBeChecked();
  await page.keyboard.press('Enter');
  await expect(text).toHaveAttribute('placeholder','描述调查对象、范围和需要的结果…');
  await expect(page.locator('#agent-mode-hint')).toContainText('多步调查');
  const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
   composer:document.querySelector('.ai-composer')!.getBoundingClientRect().toJSON(),
   options:[...document.querySelectorAll('.agent-mode-option')].map(el=>el.getBoundingClientRect().toJSON())}));
  assert(geometry.scroll<=geometry.width+1,'Horizontal overflow');
  assert(geometry.options.every(box=>box.x>=0&&box.right<=geometry.width),'Mode option outside viewport');
  assert(geometry.composer.bottom<=viewport.height+1,'Composer clipped');
  if(viewport.width<=600)assert(geometry.options.every(box=>box.height>=40),'Touch option too small');
  const screenshot=`tmp/mode-picker/${viewport.width}.png`;await page.screenshot({path:screenshot});screenshots.push(screenshot);
  await page.locator('.ai-attachment-control > button').click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
  await context.close();
 }
 assert.equal(taskRequests,0);assert.deepEqual(errors,[]);
 assert.equal((await pool.query('select count(*)::int n from agent_run where user_id=$1',[user])).rows[0].n,0);
 console.log(JSON.stringify({viewports:3,keyboard:true,draftPreserved:true,attachmentDialog:true,noOverflow:true,taskRequests,paidCalls:0,screenshots}));
}finally{await browser.close();if(created){await pool.query('delete from market_workspace where id=$1 and owner_id=$2',[workspace,user]);await pool.query("delete from app_user where id=$1 and display_name='Mode picker fixture'",[user]);}await pool.end();}
