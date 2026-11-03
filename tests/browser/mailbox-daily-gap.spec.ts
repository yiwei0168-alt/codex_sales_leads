import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

let script:string,css:string;
const connectionId='22222222-2222-4222-8222-222222222222';
test.beforeAll(async()=>{
 const bundled=await build({stdin:{contents:`import {createRoot} from 'react-dom/client';
  import {MailboxDailySync} from './src/components/mailbox-daily-sync';
  createRoot(document.getElementById('root')).render(<div className="conversation-theme"><main style={{padding:16,maxWidth:800,margin:'auto'}}><MailboxDailySync connectionId="${connectionId}" active={true}/></main></div>);`,resolveDir:process.cwd(),sourcefile:'daily-gap-browser-fixture.tsx',loader:'tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
 script=bundled.outputFiles[0].text;
 css=(await Promise.all(['src/app/globals.css','src/app/ipados.css','src/app/conversation-theme.css','src/app/intelligence-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
});

test('a later success keeps older uncovered days visible, including after disabling',async({page},testInfo)=>{
 let enabled=true,posts=0;
 await page.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
  if(url.pathname==='/api/mailbox/daily-sync'){
   if(request.method()==='POST'){expect(request.postDataJSON()).toEqual({connectionId,enabled:false});enabled=false;posts++;return route.fulfill({json:{enabled}});}
   return route.fulfill({json:{schedules:[{connection_id:connectionId,enabled,next_run_at:'2026-11-04T00:00:00Z',last_status:'completed',last_error:null,uncovered_failed_days:2,first_uncovered_day:'2026-10-30',last_uncovered_day:'2026-11-01'}]}});
  }
  return route.abort('blockedbyclient');
 });
 await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 const checkbox=page.getByRole('checkbox',{name:'每天早晨 8:00 自动同步'});
 await expect(checkbox).toBeChecked();await expect(page.getByText(/最近任务：已完成/)).toBeVisible();
 const warning=page.getByRole('alert');await expect(warning).toContainText('仍有 2 天自动同步失败且尚未补齐');
 await expect(warning).toContainText('2026-10-30 至 2026-11-01');expect(posts).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:testInfo.outputPath('daily-gap-visible.png'),fullPage:true});
 // The controlled input changes only after POST and settings readback succeed.
 await checkbox.click();await expect(checkbox).not.toBeChecked();await expect(warning).toBeVisible();expect(posts).toBe(1);
});

test('completed coverage removes the retry warning while preserving the historical result',async({page})=>{
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
  if(url.pathname==='/api/mailbox/daily-sync')return route.fulfill({json:{schedules:[{connection_id:connectionId,enabled:true,next_run_at:'2026-11-04T00:00:00Z',last_status:'failed',last_error:'historical synthetic DNS failure',uncovered_failed_days:0,first_uncovered_day:null,last_uncovered_day:null}]}});
  return route.abort('blockedbyclient');
 });
 await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
 await expect(page.getByRole('checkbox')).toBeChecked();await expect(page.getByText(/最近任务：同步失败/)).toBeVisible();
 await expect(page.getByRole('alert')).toHaveCount(0);
 await expect(page.getByText(/按原范围继续/)).toHaveCount(0);
});
