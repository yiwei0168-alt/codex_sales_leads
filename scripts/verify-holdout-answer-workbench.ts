/** Read-only browser verification of the local frozen-answer review surface. */
import nextEnv from "@next/env";
import {randomBytes,randomUUID} from "node:crypto";
import {mkdir} from "node:fs/promises";
import {chromium,expect} from "@playwright/test";
import {Pool} from "pg";
import {hashPassword} from "../src/lib/auth/password";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const base=new URL(process.env.UI_VERIFY_BASE_URL||"http://localhost:3018");
if(base.protocol!=="http:"||!["localhost","127.0.0.1"].includes(base.hostname))throw new Error("Local UI only");
const migration=process.env.DATABASE_MIGRATION_URL;
if(!migration)throw new Error("DATABASE_MIGRATION_URL is required");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const userId=randomUUID(),workspaceId=randomUUID();
const email=`holdout-review-${userId}@example.invalid`,password=randomBytes(32).toString("base64url");
let created=false;
await mkdir("tmp",{recursive:true});
const browser=await chromium.launch({channel:"chrome",headless:true});
try{
  await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Holdout review fixture',$3,'admin','active')",[userId,email,hashPassword(password)]);
  await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Holdout review fixture','Global','WW','Review center verification')",[workspaceId,userId]);
  created=true;
  const checks:string[]=[];
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    await context.route("**/*",route=>["localhost","127.0.0.1"].includes(new URL(route.request().url()).hostname)?route.continue():route.abort());
    const page=await context.newPage();
    const unauthenticated=await page.request.get(new URL("/api/knowledge/holdout-answer-reviews",base).href);
    expect(unauthenticated.status()).toBe(401);
    await page.goto(base.href);
    await page.getByLabel("登录邮箱").fill(email);
    await page.getByLabel("密码",{exact:true}).fill(password);
    await page.getByRole("button",{name:"登录",exact:true}).click();
    if(viewport.width<600)await page.getByRole("button",{name:"打开导航菜单"}).click();
    await page.getByRole("button",{name:"知识库",exact:true}).click();
    await page.getByRole("navigation",{name:"知识库页签"}).getByRole("button",{name:"审核",exact:true}).click();
    await page.getByRole("button",{name:"进入复核中心"}).click();
    await page.getByRole("tab",{name:"冻结集对照"}).click();
    const result=await page.evaluate(async()=>{
      const response=await fetch("/api/knowledge/holdout-answer-reviews?offset=0&limit=5&pendingOnly=true",{cache:"no-store"});
      return{status:response.status,body:await response.json()};
    });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({candidateCount:100,reviewed:0,total:50});
    expect(result.body.items).toHaveLength(5);
    expect(result.body.items[0].paths.map((path:{path:string})=>path.path)).toEqual(["v3","vectorless"]);
    const changed=await page.evaluate(async caseId=>{
      const response=await fetch("/api/knowledge/holdout-answer-reviews",{method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({caseId,path:"v3",candidateSha256:"0".repeat(64),answerCorrect:true,
          preciseCitationCorrect:true,note:"stale candidate probe"})});return response.status;
    },result.body.items[0].caseId as string);
    expect(changed).toBe(409);
    await expect(page.getByRole("heading",{name:"已审核 Gold"})).toBeVisible();
    await expect(page.getByText("现行 v3",{exact:true})).toBeVisible();
    await expect(page.getByText("无向量主路",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"保存此路径结论"}).first()).toBeDisabled();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator(".knowledge-review-center").screenshot({path:`tmp/holdout-answer-review-${viewport.width}x${viewport.height}.png`});
    checks.push(`${viewport.width}:auth-frozen-input-two-paths-no-default-verdict`);
    await context.close();
  }
  console.log(JSON.stringify({holdoutAnswerWorkbench:"passed",checks,mutations:0,externalCalls:0}));
}finally{
  await browser.close();
  if(created){
    await pool.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
    await pool.query("delete from app_user where id=$1 and email=$2",[userId,email]);
  }
  await pool.end();
}
