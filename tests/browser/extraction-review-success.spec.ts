import {test,expect} from '@playwright/test';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';

let script:string,css:string;
test.beforeAll(async()=>{
  const bundle=await build({entryPoints:['tests/browser/extraction-review-fixture.tsx'],bundle:true,write:false,
    platform:'browser',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','process.env':'{}'}});
  script=bundle.outputFiles[0].text;
  css=(await Promise.all(['src/app/globals.css','src/app/conversation-theme.css'].map(path=>readFile(path,'utf8')))).join('\n');
});

test('reviewer excludes an occluded success block and can return to pending completion',async({page},testInfo)=>{
  const sha='a'.repeat(64),jobId='12345678-1234-4234-8234-123456789abc';
  const hidden='By 2023, LTE and 5G will cover 70% of the world';
  let saved=false;const posted:unknown[]=[];
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><div id="root"></div>'});
    if(url.pathname==='/api/knowledge/uploads/review'&&route.request().method()==='GET'){
      if(url.searchParams.get('format')==='image')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#f7f9fc"/><rect x="24" y="24" width="912" height="130" fill="#102c61"/><rect x="180" y="370" width="600" height="120" fill="#b55f5f"/></svg>'});
      if(url.searchParams.get('view')==='successful')return route.fulfill({json:{jobId,title:'ITU development PDF',artifactSha256:sha,sourceSha256:sha,
        decisionSha256:sha,view:'successful',visualState:'ready',total:1,resolved:saved?1:0,pendingTotal:1,pendingResolved:1,offset:0,
        blocks:[{block:{id:'page-8-block-4',unitType:'page',unitIndex:8,blockType:'paragraph',bbox:[65.4,446.5,883.2,476.8],text:hidden},
          judgment:saved?{revision:1,decision:'decoration',evidence_text:'',note:'Hidden by the red card'}:null,
          candidate:{blockId:'page-8-visual-review',unitIndex:8,unitType:'page',coordinateSpace:'pdf-page-render',imageFile:'page.png'},
          previewBlockId:'page-8-visual-review'}]}});
      return route.fulfill({json:{jobId,title:'ITU development PDF',artifactSha256:sha,sourceSha256:sha,decisionSha256:sha,
        view:'pending',visualState:'ready',total:1,resolved:1,pendingTotal:1,pendingResolved:1,offset:0,
        blocks:[{block:{id:'page-8-visual-review',unitType:'page',unitIndex:8,blockType:'reviewed-text',text:'Reviewed diagram'},
          judgment:{revision:1,decision:'evidence',evidence_text:'Reviewed diagram',note:'Checked original'},candidate:null}]}});
    }
    if(url.pathname==='/api/knowledge/uploads/review'&&route.request().method()==='POST'){
      const body=route.request().postDataJSON();posted.push(body);saved=true;return route.fulfill({json:{revision:1,indexingResumed:false}});
    }
    return route.abort('blockedbyclient');
  });
  await page.goto('https://ui.test/');await page.addStyleTag({content:css});await page.addScriptTag({content:script});
  await expect(page.getByText('待审核对象已核对 1 / 1 个')).toBeVisible();
  await page.getByRole('button',{name:'复核成功抽取文字'}).click();
  await expect(page.getByText(/有疑问时保持原抽取文字/)).toBeVisible();
  await expect(page.locator('.extraction-review pre').filter({hasText:hidden}).first()).toBeVisible();
  await expect(page.getByText(/65.4, 446.5, 883.2, 476.8/)).toBeVisible();
  await expect(page.locator('img[src*="blockId=page-8-visual-review"]')).toHaveCount(1);
  expect(await page.locator('img[src*="blockId=page-8-visual-review"]').evaluate((image:HTMLImageElement)=>image.naturalWidth)).toBe(960);
  await page.screenshot({path:`tmp/extraction-success-review-${testInfo.project.name}.png`});
  await page.getByLabel('核对结论').selectOption('decoration');
  await page.getByLabel('核对依据 / 备注').fill('Hidden by the red card');
  await page.getByRole('button',{name:'保存本条审核'}).click();
  await expect(page.getByText('已记录判决 1 个')).toBeVisible();
  expect(posted).toEqual([{jobId,artifactSha256:sha,blockId:'page-8-block-4',expectedRevision:0,
    decision:'decoration',evidenceText:'',note:'Hidden by the red card'}]);
  await page.getByRole('button',{name:'待审核对象'}).click();
  await expect(page.getByRole('button',{name:'完成审核并提交后续处理'})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
