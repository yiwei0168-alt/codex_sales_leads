import nextEnv from "@next/env";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, expect, type Page } from "@playwright/test";
import { Pool } from "pg";
import { hashPassword } from "../src/lib/auth/password";
import { getPool } from "../src/lib/rag/db";
import { enqueueRun } from "../src/lib/assistant/main/repository";
import { defaultModelConfig } from "../src/lib/assistant/main/product";
import { requestApproval } from "../src/lib/assistant/main/approvals";
import { productTools } from "../src/lib/assistant/main/tools";
import { addManualCompany } from "../src/lib/sales/manual-company";
nextEnv.loadEnvConfig(process.cwd());
const base=process.env.UI_VERIFY_BASE_URL??"http://127.0.0.1:3000";
const db=process.env.DATABASE_MIGRATION_URL!;
if(!["localhost","127.0.0.1"].includes(new URL(base).hostname)||!["localhost","127.0.0.1"].includes(new URL(db).hostname))throw Error("Local fixtures only");
const pool=new Pool({connectionString:db});
const owner=randomUUID(), workspace=randomUUID(), doc=randomUUID(), admin=randomUUID();
const email=`ma15-${owner}@example.invalid`, adminEmail=`ma15-${admin}@example.invalid`, password=randomBytes(30).toString("base64url");
const browser=await chromium.launch({channel:"chrome",headless:true});
const checks:string[]=[];
await mkdir("tmp/ma15",{recursive:true});
async function noOverflow(page:Page,label:string){
  const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,offenders:[...document.querySelectorAll("main *")].filter(el=>el.getBoundingClientRect().right>innerWidth+2).slice(0,8).map(el=>({tag:el.tagName,cls:el.className}))}));
  if(overflow.scroll>overflow.width+1)throw Error(`${label}: ${JSON.stringify(overflow)}`);
}
try {
  for(const [id,address,role] of [[owner,email,"member"],[admin,adminEmail,"admin"]]) {
    await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'MA15 isolated fixture',$3,$4,'active')",[id,address,hashPassword(password),role]);
  }
  await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','MA15 fixture','Global','WW','Synthetic acceptance')",[workspace,owner]);
  const company=await addManualCompany(owner,{name:"MA15 Fixture Networks",country:"DE",website:`https://${owner}.invalid`,role:"Distributor"});
  await pool.query("insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility) values($1,(select id from knowledge_collection where slug='industry'),$2,'笔记本阅读与渠道开发资料','fixture',$2,$3,'private')",[doc,doc,owner]);
  await pool.query("insert into knowledge_chunk(document_id,chunk_index,content,token_estimate,content_sha256) values($1::uuid,0,$2,200,($1::uuid)::text)",[doc,"这是一份用于阅读验收的隔离资料。\n\n"+"渠道开发需要核对来源、公司角色和明确的业务目标。".repeat(160)+"\n\n资料末尾标记：完整正文已读取。\n\n| 渠道 | 联系方式 | 来源 |\n| --- | --- | --- |\n| 分销商 | 保存的联系方式 | "+"长来源内容".repeat(50)+" |"]);
  const run=await enqueueRun(owner,{content:"MA15 待审核开发计划",requestKey:randomUUID(),attachments:[]},defaultModelConfig());
  await pool.query("update agent_run set status='paused',control='pause' where id=$1",[run.id]);
  const context={userId:owner,runId:run.id,leaseToken:randomUUID(),role:"member" as const};
  await requestApproval(context,productTools.find(t=>t.id==="mail_send")!,{connectionId:randomUUID(),to:"review@example.invalid",subject:"开发合作提议",body:"这封邮件仅用于批准卡阅读验收，不会发送。\n\n"+"我们希望了解贵公司的渠道合作需求。".repeat(35),attachments:[{filename:"渠道合作资料.pdf",sha256:"a".repeat(64)}]});
  await requestApproval(context,productTools.find(t=>t.id==="mail_message_delete")!,{messageId:randomUUID()});
  for(const size of [{width:1366,height:768},{width:1440,height:900},{width:390,height:844}])for(const zoom of [1,1.25]) {
    // Layout viewport and device scale reproduce desktop browser zoom geometry.
    const viewport={width:Math.round(size.width/zoom),height:Math.round(size.height/zoom)};
    const ctx=await browser.newContext({viewport,deviceScaleFactor:zoom});
    await ctx.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await ctx.newPage();const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(base);await page.getByLabel("登录邮箱").fill(email);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录",exact:true}).click();
    await expect(page.getByRole("heading",{name:"今天想推进哪个市场？"})).toBeVisible();
    const nav=async(name:string)=>{if(viewport.width<960)await page.getByRole("button",{name:"打开导航菜单"}).click();await page.getByRole("button",{name,exact:true}).click();};
    if(viewport.width>=960){await expect(page.locator(".sidebar")).toHaveCSS("width","248px");await page.getByRole("button",{name:"收起侧栏"}).click();await page.getByRole("button",{name:"展开侧栏"}).click();}
    else {await page.getByRole("button",{name:"打开导航菜单"}).click();await page.keyboard.press("Escape");await expect(page.getByRole("button",{name:"打开导航菜单"})).toBeFocused();}
    await nav("知识库");await expect(page.getByRole("button",{name:"笔记本阅读与渠道开发资料",exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"审核",exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.querySelector(".topbar")!.getBoundingClientRect().bottom<=document.querySelector(".workspace-heading")!.getBoundingClientRect().top)).toBe(true);
    await expect(page.getByRole("heading",{name:"上传你的知识资料"})).toHaveCount(0);
    expect(await page.locator(".topbar").evaluate(header=>[...header.querySelectorAll("button")].filter(el=>el.getClientRects().length).every(el=>el.getBoundingClientRect().bottom<=header.getBoundingClientRect().bottom))).toBe(true);
    await noOverflow(page,"library");await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`tmp/ma15/library-${size.width}-${zoom}.png`,fullPage:true});
    await page.getByRole("button",{name:"笔记本阅读与渠道开发资料",exact:true}).click();await expect(page.locator(".library-body")).toContainText("完整正文已读取");
    await expect(page.locator(".library-body")).toHaveCSS("font-size","16px");await expect(page.getByRole("region",{name:"资料表格"})).toBeVisible();await noOverflow(page,"reader");await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`tmp/ma15/reader-${size.width}-${zoom}.png`,fullPage:true});await page.getByRole("button",{name:"返回资料列表"}).click();
    await page.getByRole("button",{name:"上传资料",exact:true}).click();await expect(page.getByLabel("文档标题")).toBeVisible();await noOverflow(page,"upload");await page.getByRole("button",{name:"收起上传"}).click();
    await page.getByRole("button",{name:"知识问答",exact:true}).click();await expect(page).toHaveURL(/tab=questions/);await page.reload();await expect(page.getByLabel("问题",{exact:true})).toBeVisible();
    await page.route("**/api/rag/query",route=>route.fulfill({json:{answer:"已保存证据支持以下渠道判断。".repeat(70),grounded:true,model:"isolated-fixture",latencyMs:0,warnings:[],citations:[{chunkId:doc,documentTitle:"隔离来源",sourceUrl:"https://example.invalid/source",visibility:"private",excerpt:"来源正文".repeat(50),score:.9}],comparison:{entities:[{key:"A"},{key:"B"}],differences:[],attributes:[{attributeKey:"规格对照",left:{status:"verified",value:"长规格内容".repeat(40)},right:{status:"verified",value:"另一个长规格内容".repeat(40)},isDifference:false}]}}}));
    await page.getByRole("button",{name:"提问",exact:true}).click();await expect(page.locator(".rag-answer")).toBeVisible();await expect(page.locator(".answer-sources")).not.toHaveAttribute("open","");await page.getByText("查看引用与来源",{exact:true}).click();await noOverflow(page,"answer-table");await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`tmp/ma15/answer-${size.width}-${zoom}.png`,fullPage:true});
    await nav("客户开发");await page.getByRole("button",{name:"开发信",exact:true}).click();await expect(page.getByLabel("选择开发公司")).toBeVisible();await page.getByLabel("选择开发公司").selectOption(company.externalId);await expect(page).toHaveURL(/company=/);await page.getByLabel("选择国家").selectOption("DE");await page.getByRole("button",{name:"邮箱",exact:true}).click();await expect(page).toHaveURL(/country=DE.*company=.*tab=mailbox/);await page.getByRole("button",{name:"开发信",exact:true}).click();await expect(page.getByLabel("选择开发公司")).toHaveValue(company.externalId);await noOverflow(page,"development");
    await nav("市场与线索");await page.getByRole("button",{name:"销售线索",exact:true}).click();await expect(page).toHaveURL(/markets\/DE\/leads/);await page.getByRole("button",{name:"渠道关系",exact:true}).click();await page.goBack();await expect(page.getByLabel("选择国家")).toHaveValue("DE");await noOverflow(page,"market");
    await page.getByRole("button",{name:"返回对话",exact:true}).click();await expect(page).toHaveURL(new RegExp(`/c/${run.conversation_id}$`));await expect(page.getByText("确认发送邮件",{exact:true})).toBeVisible();await expect(page.getByText("渠道合作资料.pdf",{exact:false})).toBeVisible();await expect(page.getByText("确认删除本地邮件",{exact:true})).toBeVisible();await noOverflow(page,"approval");await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`tmp/ma15/approval-${size.width}-${zoom}.png`,fullPage:true});
    if(size.width===1366&&zoom===1){await page.locator(".agent-approval").filter({hasText:"确认发送邮件"}).getByRole("button",{name:"确认此内容",exact:true}).click();await expect(page.getByText("已批准，等待执行结果",{exact:true})).toBeVisible();let interrupted=false;await page.route("**/api/assistant/runs?conversationId=*",route=>{if(!interrupted){interrupted=true;return route.fulfill({status:503,json:{error:"isolated connection interruption"}});}return route.continue();});await expect(page.getByText("任务状态暂不可用，正在重试",{exact:true})).toBeVisible({timeout:10000});await expect(page.getByText("任务状态暂不可用，正在重试",{exact:true})).toHaveCount(0,{timeout:10000});await expect(page.getByText("已批准，等待执行结果",{exact:true})).toBeVisible();}
    const input=page.locator(".ai-composer textarea");await input.fill("未发送的草稿保留在内存");await nav("知识库");await page.getByRole("button",{name:"返回对话",exact:true}).click();await expect(input).toHaveValue("未发送的草稿保留在内存");await page.reload();await expect(page.getByText("确认发送邮件",{exact:true})).toBeVisible();
    if(viewport.width<960)await page.getByRole("button",{name:"打开导航菜单"}).click();await expect(page.getByRole("button",{name:"新对话",exact:true})).toHaveCount(1);await page.getByRole("button",{name:"帮助",exact:true}).click();await page.getByRole("button",{name:"任务记录",exact:true}).click();await expect(page).toHaveURL(/\/tasks/);await expect(page.locator(".agent-task-history")).toContainText("已暂停");await expect(page.locator(".agent-task-history")).toContainText("MA15 待审核开发计划");await noOverflow(page,"tasks");
    await nav("新对话");await expect(page).toHaveURL(base+"/");await expect(page.getByRole("heading",{name:"今天想推进哪个市场？"})).toBeVisible();
    expect((await pool.query("select count(*)::int n from assistant_conversation where user_id=$1",[owner])).rows[0].n).toBe(1);
    expect(errors).toEqual([]);checks.push(`${size.width}x${size.height} @ ${zoom*100}%: navigation, URLs, drafts, library, answer/table, company context, approvals, no overflow`);
    await ctx.close();
  }
  const ctx=await browser.newContext();const page=await ctx.newPage();await page.goto(base);await page.getByLabel("登录邮箱").fill(adminEmail);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录",exact:true}).click();await page.getByRole("button",{name:"知识库",exact:true}).click();await expect(page.getByRole("button",{name:"审核",exact:true})).toBeVisible();await page.getByRole("button",{name:"审核",exact:true}).click();await expect(page).toHaveURL(/tab=review/);checks.push("Administrator review entry visible; member review hidden");await ctx.close();
  expect((await pool.query("select count(*)::int n from agent_tool_call where user_id=$1",[owner])).rows[0].n).toBe(0);
  expect((await pool.query("select count(*)::int n from paid_call_reservation where user_id=$1",[owner])).rows[0].n).toBe(0);
  await writeFile("tmp/ma15/acceptance.json",JSON.stringify({checks,zoomMethod:"layout viewport / zoom and deviceScaleFactor; equivalent geometry, not native toolbar zoom",externalActions:0},null,2));console.log(JSON.stringify({checks},null,2));
} catch(error) { console.error(error); throw error; } finally {
  await browser.close();
  await pool.query("delete from knowledge_document where id=$1 and owner_id=$2",[doc,owner]);
  for(const table of ["agent_run_event","agent_tool_call","agent_approval","agent_run","product_operation_metric"])await pool.query(`delete from ${table} where user_id=$1`,[owner]);
  await pool.query("delete from assistant_conversation where user_id=$1",[owner]);
  await pool.query("delete from market_workspace where id=$1 and owner_id=$2",[workspace,owner]);
  await pool.query("delete from sales_company where domain=$1",[`${owner}.invalid`]);
  await pool.query("delete from app_user where id=any($1::uuid[]) and display_name='MA15 isolated fixture'",[[owner,admin]]);
  await pool.end();await getPool().end();
}
