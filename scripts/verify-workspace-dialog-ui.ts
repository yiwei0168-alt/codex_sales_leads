import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{WorkspaceDialog}from'./src/components/workspace-dialog';function App(){const[mode,setMode]=React.useState(''),[busy,setBusy]=React.useState(false);return <><main style={{height:3000}}><button onClick={()=>setMode('dialog')}>打开确认窗口</button><button onClick={()=>setMode('drawer')}>打开管理抽屉</button></main>{mode&&<WorkspaceDialog title="管理 / 连接邮箱" drawer={mode==='drawer'} busy={busy} onClose={()=>setMode('')}><button onClick={()=>setBusy(!busy)}>{busy?'结束测试操作':'开始测试操作'}</button>{Array.from({length:15},(_,i)=><details key={i} open><summary>连接设置 {i+1}</summary><label>备注 {i+1}<textarea defaultValue={'本地布局测试。'.repeat(12)}/></label></details>)}<button onClick={()=>setMode('')}>完成并关闭</button></WorkspaceDialog>}</>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const css=(await Promise.all(['src/app/globals.css','src/app/ipados.css','src/app/conversation-theme.css','src/app/intelligence-theme.css','src/app/agent-mode-picker.css'].map(path=>readFile(path,'utf8')))).join('\n');
const server=createServer((req,res)=>{if(req.url==='/component.js'){res.setHeader('content-type','application/javascript');res.end(bundle.outputFiles[0].text);}else if(req.url==='/styles.css'){res.setHeader('content-type','text/css');res.end(css);}else{res.setHeader('content-type','text/html');res.end('<!doctype html><html lang="zh"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body class="conversation-theme"><div id="root"></div><script src="/component.js"></script></body></html>');}});
await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));const address=server.address();assert(address&&typeof address!=='string');
const browser=await chromium.launch({channel:'chrome',headless:true}),results=[];
try{
 await mkdir('tmp/workspace-dialog-ui',{recursive:true});
 for(const viewport of [{width:1366,height:900},{width:1366,height:360},{width:390,height:760},{width:320,height:480}]){
  for(const mode of ['dialog','drawer']){
   const page=await browser.newPage({viewport}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
   await page.goto(`http://127.0.0.1:${address.port}`);
   const opener=page.getByRole('button',{name:mode==='dialog'?'打开确认窗口':'打开管理抽屉'});await opener.click();
   const dialog=page.getByRole('dialog'),body=page.locator('.workspace-dialog-body');await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:'关闭窗口'})).toBeFocused();
   const bounds=await dialog.boundingBox();assert(bounds&&bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=viewport.width+1&&bounds.y+bounds.height<=viewport.height+1);
   if(mode==='drawer'&&viewport.width<=700){assert.equal(bounds.x,0);assert.equal(bounds.width,viewport.width);}
   assert.equal(await dialog.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.getByRole('button',{name:'开始测试操作'}).click();await page.keyboard.press('Escape');await expect(dialog).toBeVisible();await expect(page.getByRole('button',{name:'关闭窗口'})).toBeDisabled();
   await page.getByRole('button',{name:'结束测试操作'}).click();
   for(let i=0;i<24;i++){await page.keyboard.press('Tab');assert(await page.evaluate(()=>Boolean(document.activeElement?.closest('dialog'))));}
   await body.evaluate(el=>el.scrollTop=0);const region=await body.boundingBox();assert(region);
   await page.mouse.move(region.x+region.width/2,region.y+Math.min(60,region.height/2));await page.mouse.wheel(0,800);
   await expect.poll(()=>body.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);assert.equal(await page.evaluate(()=>scrollY),0);
   await body.evaluate(el=>el.scrollTop=el.scrollHeight);await page.mouse.wheel(0,800);assert.equal(await page.evaluate(()=>scrollY),0);
   await expect(page.getByRole('button',{name:'完成并关闭'})).toBeVisible();
   await page.screenshot({path:`tmp/workspace-dialog-ui/${mode}-${viewport.width}-${viewport.height}.png`,fullPage:false});
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();assert.deepEqual(errors,[]);
   results.push({mode,...viewport,mobileDrawerFullWidth:mode==='drawer'&&viewport.width<=700,opaque:true,internalScroll:true,backgroundUnchanged:true,focusTrap:true,focusRestored:true,busyEscapeBlocked:true});await page.close();
  }
 }
 await writeFile('tmp/workspace-dialog-ui/result.json',JSON.stringify({actualComponent:true,productionStyles:true,syntheticContent:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();await new Promise<void>(done=>server.close(()=>done()));}
