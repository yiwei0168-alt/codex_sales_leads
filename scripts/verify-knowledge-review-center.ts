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
const migration=process.env.DATABASE_MIGRATION_URL;if(!migration)throw new Error("DATABASE_MIGRATION_URL is required");
const pool=new Pool({connectionString:databaseConnectionString(migration),ssl:databaseSslConfiguration(migration)});
const userId=randomUUID(),workspaceId=randomUUID(),email=`knowledge-review-${userId}@example.invalid`,password=randomBytes(32).toString("base64url");
let created=false;await mkdir("tmp",{recursive:true});const browser=await chromium.launch({channel:"chrome",headless:true});
try{await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Review UI fixture',$3,'admin','active')",[userId,email,hashPassword(password)]);await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Review UI fixture','Global','WW','Review center verification')",[workspaceId,userId]);created=true;
  const checks:string[]=[];for(const viewport of [{width:1366,height:900},{width:390,height:844}]){const context=await browser.newContext({viewport});await context.route("**/*",route=>{const url=new URL(route.request().url());return["localhost","127.0.0.1"].includes(url.hostname)?route.continue():route.abort();});const page=await context.newPage();await page.goto(base.href);await page.getByLabel("登录邮箱").fill(email);await page.getByLabel("密码",{exact:true}).fill(password);await page.getByRole("button",{name:"登录",exact:true}).click();
    if(viewport.width<600)await page.getByRole("button",{name:"打开导航菜单"}).click();await page.getByRole("button",{name:"知识库 & RAG"}).click();await expect(page.getByRole("button",{name:"进入复核中心"})).toBeVisible();await page.getByRole("button",{name:"进入复核中心"}).click();await expect(page.getByRole("tab",{name:"事实复核"})).toBeVisible();await expect(page.getByText("1029",{exact:true}).first()).toBeVisible();
    const factApi=await page.evaluate(async()=>{const response=await fetch("/api/knowledge/reviews?limit=1");return{status:response.status,body:await response.json()};});expect(factApi.status).toBe(200);expect(factApi.body).toMatchObject({total:1029,limit:1});
    await page.getByRole("tab",{name:"Gold 审核"}).click();await expect(page.getByText("0/300 已审核。Holdout 保持锁定。",{exact:true})).toBeVisible();const holdout=page.getByRole("button",{name:/holdout/i});await expect(holdout).toBeDisabled();const goldApi=await page.evaluate(async()=>{const response=await fetch("/api/knowledge/evaluation-reviews?split=development&limit=1&reviewed=false");return{status:response.status,body:await response.json()};});expect(goldApi.status).toBe(200);expect(goldApi.body).toMatchObject({total:190,reviewed:0,holdoutUnlocked:false});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);await page.screenshot({path:`tmp/knowledge-review-${viewport.width}x${viewport.height}.png`,fullPage:true});checks.push(`${viewport.width}:fact-queue-gold-progress-holdout-lock`);await context.close();}
  console.log(JSON.stringify({knowledgeReviewCenter:"passed",checks,factReviews:1029,goldReviewed:0,holdoutUnlocked:false,mutations:0,externalCalls:0}));
}finally{await browser.close();if(created){await pool.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);await pool.query("delete from app_user where id=$1 and email=$2",[userId,email]);}await pool.end();}
