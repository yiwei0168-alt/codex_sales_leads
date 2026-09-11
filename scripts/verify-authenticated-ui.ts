import nextEnv from "@next/env";
import {randomBytes,randomUUID} from "node:crypto";
import {chromium,expect} from "@playwright/test";
import {Agent,fetch as localFetch} from "undici";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const base=new URL(process.env.UI_VERIFY_BASE_URL||"http://localhost:3000");
if(!["localhost","127.0.0.1"].includes(base.hostname)||base.protocol!=="http:")throw new Error("Only a local development server is allowed");
// No model/search/mail credentials are used by this probe. Credentials stay in memory.
const localTransport=new Agent();
try{
  const response=await localFetch(new URL("/api/auth/session",base),{dispatcher:localTransport,signal:AbortSignal.timeout(10_000)});
  await response.body?.cancel();
  if(response.status>=500)throw new Error("Local server is not ready");
}finally{await localTransport.close();}
const {getPool}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {addManualCompany}=await import("../src/lib/sales/manual-company");
const {setSpendBudget,setTaskSpendBudget}=await import("../src/lib/billing/repository");
const userId=randomUUID(),workspaceId=randomUUID();
const conversationId=randomUUID(),actionId=randomUUID();
const email=`ui-verification-${userId}@example.invalid`,password=randomBytes(32).toString("base64url");
const domain=`ui-verification-${userId}.invalid`;
const application=process.env.DATABASE_URL,migration=process.env.DATABASE_MIGRATION_URL;
if(!application||!migration)throw new Error("Application and migration connections are required for isolated fixture setup");
const a=new URL(application),m=new URL(migration);
if(a.hostname!==m.hostname||(a.port||"5432")!==(m.port||"5432")||a.pathname!==m.pathname)throw new Error("Fixture target differs from application database");
// Privileged fixture setup/cleanup only. Browser APIs and addManualCompany use the real application role.
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});let created=false;
const checks:string[]=[];let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
  const client=await pool.connect();
  try{
    await client.query("begin");
    await client.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'UI acceptance fixture',$3,'member','active')",[userId,email,hashPassword(password)]);
    await client.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','UI acceptance fixture','Global','WW','Isolated local UI verification')",[workspaceId,userId]);
    await client.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'UI task fixture')",[conversationId,userId]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','proposed',$4)",[actionId,userId,conversationId,JSON.stringify({countryCode:"GB",countryName:"United Kingdom",roles:["SI"],targetCount:1,userRequest:"Local UI fixture"})]);
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(userId,1_000_000);await setTaskSpendBudget(userId,actionId,0);
  for(const [country,role] of [["GB","SI"],["MX","Retailer"]] as const){
    await addManualCompany(userId,{name:`UI Fixture ${country}`,country,website:`https://${domain}`,role});
  }
  browser=await chromium.launch({channel:"chrome",headless:true});
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();const errors:string[]=[];
    page.on("pageerror",()=>errors.push("client-runtime-error"));
    // No response mocking: real local UI/API/database. Block browser egress and unsafe writes.
    await context.route("**/*",route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==base.origin)return route.abort();
      if(!["GET","HEAD"].includes(request.method())&&!['/api/auth/login','/api/auth/logout'].includes(url.pathname))return route.abort();
      return route.continue();
    });
    await page.goto(base.href);await page.getByLabel("登录邮箱").fill(email);
    await page.getByLabel("密码",{exact:true}).fill(password);
    await page.getByRole("button",{name:"登录",exact:true}).click();
    await expect(page.locator(".nav-item").filter({hasText:"销售线索"})).toBeVisible({timeout:30_000});
    checks.push(`${viewport.width}:real-login`);
    const workspaceResponse=await context.request.get(new URL("/api/workspaces/current",base).href);
    expect(workspaceResponse.status()).toBe(200);
    const workspace=await workspaceResponse.json();
    expect(workspace.id).toBe(workspaceId);expect(workspace.companies).toHaveLength(2);
    expect(new Set(workspace.companies.map((company:{id:string})=>company.id)).size).toBe(2);
    for(const country of ["GB","MX"]){
      await page.goto(new URL(`/markets/${country}/leads`,base).href);
      await expect(page.getByLabel("选择国家")).toHaveValue(country);
      const detail=page.getByRole("button",{name:`打开 UI Fixture ${country} 详情`,exact:true});
      await expect(detail).toBeVisible();
      await expect(page.getByRole("button",{name:`打开 UI Fixture ${country==='GB'?'MX':'GB'} 详情`,exact:true})).toHaveCount(0);
      await page.screenshot({path:`tmp/auth-ui-${viewport.width}-${country}-leads.png`,fullPage:true});
      const overflow=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,
        elements:[...document.querySelectorAll("body *")].filter(el=>el.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(el=>({tag:el.tagName,className:el.className,right:el.getBoundingClientRect().right}))}));
      expect(overflow.scroll,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.width+1);
      await detail.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto(new URL(`/markets/${country}/channel-map`,base).href);
      await expect(page.getByRole("heading",{name:"渠道节点与关系"})).toBeVisible();
      await expect(page.getByRole("img",{name:"当前国家渠道关系图"})).toBeVisible();
      await expect(page.getByLabel("选择国家")).toHaveValue(country);
      await page.screenshot({path:`tmp/auth-ui-${viewport.width}-${country}-map.png`,fullPage:true});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      checks.push(`${viewport.width}:${country}:country-detail-map`);
    }
    for(const label of ["任务进程","知识库 & RAG","邮箱学习"]){
      await page.locator(".nav-item").filter({hasText:label}).click();
      await expect(page.locator(".nav-item.active")).toContainText(label);
    }
    for(const path of ["/api/tasks","/api/tasks/markets","/api/tasks/usage","/api/budget"]){
      const read=await context.request.get(new URL(path,base).href);expect(read.status(),path).toBe(200);
    }
    await page.goto(new URL(`/tasks/${actionId}?kind=search`,base).href);
    await page.getByText("任务预算与成本",{exact:true}).click();
    await expect(page.getByText(/任务上限 \$0.000000/)).toBeVisible();
    const taskBudget=await context.request.get(new URL(`/api/budget?actionId=${actionId}`,base).href);
    expect((await taskBudget.json()).taskLimit.limit_micros).toBe("0");
    checks.push(`${viewport.width}:task-budget-real-api`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);checks.push(`${viewport.width}:navigation-apis-no-runtime-error`);
    await context.close();
  }
  const calls=await pool.query("select count(*)::int as n from paid_call_reservation where user_id=$1",[userId]);
  expect(calls.rows[0].n).toBe(0);
  console.log(JSON.stringify({authenticatedUi:"passed",checks,paidCalls:0,realMailSent:0,fixtureOnly:true}));
}finally{
  await browser?.close();
  if(created){
    const client=await pool.connect();
    try{
      await client.query("begin");
      const owner=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
      if(owner.rowCount!==1)throw new Error("Fixture identity mismatch; refusing cleanup");
      await client.query("delete from task_spend_limit where user_id=$1",[userId]);
      await client.query("delete from assistant_conversation where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
      await client.query("delete from sales_company where domain=$1 and not exists(select 1 from workspace_company where company_id=sales_company.id)",[domain]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1 and email=$2",[userId,email]);
      await client.query("commit");console.log("Temporary synthetic user/workspace/company removed; no customer records changed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await pool.end();
  await getPool().end();
}
