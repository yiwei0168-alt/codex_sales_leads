import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
let script:string,css:string;
test.beforeAll(async()=>{
 script=(await build({entryPoints:['tests/browser/run-history-fixture.tsx'],bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})).outputFiles[0].text;
 css=(await Promise.all(['globals','ipados','conversation-theme','intelligence-theme'].map(name=>readFile(`src/app/${name}.css`,'utf8')))).join('\n');
});
test('history replay stays unique and failed instruction keeps its draft',async({page})=>{
 let posts=0,eventReads=0;
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),path=url.pathname;
  if(path==='/')return route.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><div id="root"></div>'});
  if(path==='/api/assistant/runs')return route.fulfill({json:{runs:[{id:'run',conversation_id:'conversation',status:'paused',result:null}]}});
  if(path.endsWith('/events')){eventReads++;return route.fulfill({contentType:'text/event-stream',body:url.searchParams.get('after')==='0'?Array.from({length:40},(_,i)=>`id: ${i+1}\nevent: tool_result\ndata: ${JSON.stringify({tool:'knowledge_search',status:'success',callId:`call-${i+1}`})}\n\n`).join(''):''});}
  if(path.endsWith('/control')){posts++;await new Promise(resolve=>setTimeout(resolve,350));return route.fulfill({status:posts===1?503:200,json:{ok:posts!==1}});}
  return route.abort();
 });
 await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});await page.evaluate(()=>document.body.classList.add('conversation-theme'));
 await page.locator('summary').filter({hasText:'查看执行详情（40 条）'}).click();
 await expect(page.locator('.agent-run-event')).toHaveCount(16);
 await page.getByRole('button',{name:'加载更早记录（剩余 24 条）'}).click();
 await expect(page.locator('.agent-run-event')).toHaveCount(40);
 const before=eventReads;await page.getByRole('button',{name:'重新建立轮询'}).click();await expect.poll(()=>eventReads).toBeGreaterThan(before);
 await expect(page.locator('.agent-run-event')).toHaveCount(40);
 const input=page.getByRole('textbox',{name:'追加任务要求'}),send=page.getByRole('button',{name:'追加',exact:true});
 await input.fill('失败时请保留');await send.click();await expect(send).toBeDisabled();await expect(page.getByRole('button',{name:'继续',exact:true})).toBeDisabled();
 await expect(page.getByRole('alert')).toContainText('操作失败');await expect(input).toHaveValue('失败时请保留');
 const after=eventReads;await page.getByRole('button',{name:'重新建立轮询'}).click();await expect.poll(()=>eventReads).toBeGreaterThan(after);await expect(page.getByRole('alert')).toContainText('操作失败');
 await send.click();await input.fill('请求期间编辑的新要求');await expect(send).toBeEnabled();await expect(input).toHaveValue('请求期间编辑的新要求');
 await send.click();await expect(input).toHaveValue('');expect(posts).toBe(3);
 await expect(page.getByRole('alert')).toHaveCount(0);await expect(page.locator('.agent-run-event')).toHaveCount(40);
});
