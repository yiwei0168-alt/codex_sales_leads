import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
let script:string,css:string;
test.beforeAll(async()=>{
 script=(await build({entryPoints:['tests/browser/agent-library-fixture.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text;
 css=(await Promise.all(['globals','ipados','conversation-theme','intelligence-theme'].map(name=>readFile(`src/app/${name}.css`,'utf8')))).join('\n');
});
test('independent reads, preserved draft, safe stale actions and truthful saved state',async({page})=>{
 let failMemory=true,failSkill=false,skillReads=0,posts=0;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><div id="root"></div>'});
  if(!path.startsWith('/api/assistant/'))return route.abort();
  if(route.request().method()==='POST'){posts++;return route.fulfill({json:{id:'synthetic',version:1}});}
  if(path.endsWith('/memory')){await new Promise(resolve=>setTimeout(resolve,300));return route.fulfill({status:failMemory?503:200,json:failMemory?{error:'unavailable'}:{memories:[]}});}
  if(path.endsWith('/schedules'))return route.fulfill({json:{schedules:[]}});
  if(path.endsWith('/skills')){skillReads++;return route.fulfill({status:failSkill?503:200,json:failSkill?{error:'unavailable'}:{skills:[{id:'synthetic',name:'现有方法',scope:'account',current_version:1,enabled:false,published:false,owned:true}]}});}
  return route.abort();
 });
 await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await page.evaluate(()=>document.body.classList.add('conversation-theme'));
 await page.locator('summary').click();
 await expect(page.getByText('现有方法',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'记忆',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('正在读取记忆');
 await expect(page.getByRole('alert')).toContainText('读取失败');
 await expect(page.getByText(/尚无统一记忆/)).toHaveCount(0);
 await page.getByRole('button',{name:'Skill',exact:true}).click();
 await page.getByLabel('方法名称',{exact:true}).fill('保留草案');
 await page.getByLabel('使用说明').fill('合成方法说明，不执行工具。');
 failMemory=false;failSkill=true;
 await page.getByRole('button',{name:'刷新',exact:true}).click();
 await expect(page.getByRole('alert')).toContainText('上次读取内容');
 await expect(page.getByRole('button',{name:'启用',exact:true})).toBeDisabled();
 await expect(page.getByLabel('方法名称',{exact:true})).toHaveValue('保留草案');
 await page.getByRole('button',{name:'记忆',exact:true}).click();
 await expect(page.getByText(/尚无统一记忆/)).toBeVisible();
 failSkill=false;await page.getByRole('button',{name:'刷新',exact:true}).click();
 await page.getByRole('button',{name:'Skill',exact:true}).click();
 await expect(page.getByRole('button',{name:'保存方法',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'保存方法',exact:true}).click();
 await expect(page.getByRole('status').filter({hasText:'未启用草案'})).toBeVisible();
 await expect(page.getByRole('button',{name:'刷新',exact:true})).toBeEnabled();
 await expect(page.getByRole('alert')).toHaveCount(0);expect(posts).toBe(1);expect(skillReads).toBe(4);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.screenshot({path:`tmp/agent-library-${page.viewportSize()!.width}.png`});
});
