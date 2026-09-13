import nextEnv from "@next/env";
import {randomBytes,randomUUID} from "node:crypto";
import {chromium,expect} from "@playwright/test";
import {Agent,fetch as localFetch} from "undici";
import {Pool} from "pg";
import {databaseConnectionString,databaseSslConfiguration} from "../src/lib/rag/database-ssl";
import {PostgresSaver} from "@langchain/langgraph-checkpoint-postgres";

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
const {getPool,tenantTransaction}=await import("../src/lib/rag/db");
const {hashPassword}=await import("../src/lib/auth/password");
const {addManualCompany}=await import("../src/lib/sales/manual-company");
const {persistDevelopmentDraft,updateDevelopmentDraft}=await import("../src/lib/outreach/repository");
const {developmentDependencyVersion}=await import("../src/lib/outreach/dependency-version");
const {setSpendBudget,setTaskSpendBudget,reservePaidCall,settlePaidCall}=await import("../src/lib/billing/repository");
const {completeTaskCostAllocation}=await import("../src/lib/billing/task-cost-completion");
const {companyCostKey,costRoundKey}=await import("../src/lib/billing/company-cost-context");
const {buildLeadWorkflowGraph}=await import("../src/lib/leads/workflow/graph");
const {candidate:progressCandidate,correctedCandidate:progressCorrected,assessment:progressAssessment,plan:progressPlan}=await import("./workflow-recovery-fixtures");
const userId=randomUUID(),workspaceId=randomUUID();
const progressActionId=randomUUID(),progressThread=`ui-progress:${userId}`;
const progressSaver=new PostgresSaver(getPool(),undefined,{schema:"langgraph"});
// Seed only a checkpoint. No graph node or business dependency is ever executed.
const seedGraph=buildLeadWorkflowGraph({} as import("../src/lib/leads/workflow/graph").LeadWorkflowDependencies,progressSaver);
const seedProgress=async(completed=false,owner=userId)=>{
  const candidates=['a','b'].map(suffix=>({...progressCandidate,candidateId:`progress-${suffix}`,domain:`progress-${suffix}-${userId}.invalid`}));
  const corrected=candidates.map(candidate=>({...progressCorrected,...candidate,correction:{...progressCorrected.correction,originalDomain:candidate.domain}}));
  await seedGraph.updateState({configurable:{thread_id:progressThread}}, {userId:owner,actionId:progressActionId,workspaceId,graphThreadId:progressThread,
    phase:"correcting-evidence",plan:{...progressPlan,countryCode:"GB",countryName:"United Kingdom"},candidates,
    correctedCandidates:completed?corrected:[corrected[1]],assessments:completed?candidates.map(candidate=>({...progressAssessment,candidateId:candidate.candidateId})):[],
    creditsUsed:13,modelUsage:[],stageMetrics:[],warnings:[]},"collect_evidence");
};
const conversationId=randomUUID(),actionId=randomUUID();
const costActionId=randomUUID(),costRunId=randomUUID();
const completionScenarios=[
  {reason:"target-met",label:"目标已满足",accepted:5},
  {reason:"provider-unavailable",label:"搜索服务不可用",accepted:2},
  {reason:"maximum-rounds",label:"达到搜索轮次安全上限",accepted:2},
  {reason:"confirmed-exhaustion",label:"已达到有记录的搜索耗尽条件",accepted:2},
  {reason:"processing-incomplete",label:"校正或评分未完成，已有结果和费用保留",accepted:2},
  {reason:"role-unresolved",label:"仍有公司角色待判，未认定市场耗尽",accepted:2},
  {reason:"qualified-shortfall",label:"最终审核或保存后合格数量不足",accepted:2},
  {reason:"budget-blocked",label:"付费调用被费用门禁阻止：budget-exceeded",accepted:2},
  {reason:"legacy-unknown",label:"",accepted:null},
].map(item=>({...item,id:randomUUID()}));
const email=`ui-verification-${userId}@example.invalid`,password=randomBytes(32).toString("base64url");
const domain=`ui-verification-${userId}.invalid`;
const manuallyAddedDomains:string[]=[];
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
    await client.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'assistant','budget-change','Synthetic budget proposal',$3)",[userId,conversationId,JSON.stringify({budgetProposal:{scope:"task",limitUsd:"0"}})]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','proposed',$4)",[actionId,userId,conversationId,JSON.stringify({countryCode:"GB",countryName:"United Kingdom",roles:["SI"],targetCount:1,userRequest:"Local UI fixture"})]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','cancelled',$4)",[progressActionId,userId,conversationId,JSON.stringify({countryCode:"GB",countryName:"United Kingdom",roles:["Distributor"],targetCount:2,userRequest:"Synthetic checkpoint UI fixture"})]);
    await client.query("insert into lead_workflow_job(user_id,action_id,graph_thread_id,status,phase,stop_requested,paused_at) values($1,$2,$3,'cancelled','correcting-evidence',true,now())",[userId,progressActionId,progressThread]);
    await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload) values($1,$2,$3,'lead-search','proposed',$4)",[costActionId,userId,conversationId,JSON.stringify({countryCode:"GB",countryName:"United Kingdom",roles:["SI"],targetCount:2,userRequest:"Synthetic cost UI fixture"})]);
    for(const scenario of completionScenarios){
      const result=scenario.accepted===null?{}:{discovered:9,assessed:7,qualified:scenario.accepted,accepted:scenario.accepted,creditsUsed:7,
        ...(scenario.reason==='budget-blocked'?{}:{targetCompletionReason:scenario.reason}),pendingRoleCount:scenario.reason==='role-unresolved'?1:0};
      await client.query("insert into assistant_action(id,user_id,conversation_id,action_type,status,payload,result,error_message) values($1,$2,$3,'lead-search',$4,$5,$6,$7)",
        [scenario.id,userId,conversationId,scenario.reason==='budget-blocked'?'failed':'completed',
          JSON.stringify({countryCode:"GB",countryName:"United Kingdom",roles:["SI"],targetCount:5,userRequest:"Synthetic completion UI fixture"}),
          JSON.stringify(result),scenario.reason==='budget-blocked'?scenario.label:null]);
    }
    await client.query("commit");created=true;
  }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  await setSpendBudget(userId,1_000_000);await setTaskSpendBudget(userId,actionId,0);
  for(const [country,role] of [["GB","SI"],["MX","Retailer"]] as const){
    await addManualCompany(userId,{name:`UI Fixture ${country}`,country,website:`https://${domain}`,role});
  }
  const evidenceDate=new Date();evidenceDate.setUTCFullYear(evidenceDate.getUTCFullYear()-2);
  await pool.query(`update workspace_company_market set record=jsonb_set(record,'{evidence}',$3::jsonb)
    where workspace_id=$1 and country_code=$2`,[workspaceId,"GB",JSON.stringify([{id:"ui-old-evidence",
    title:"Synthetic historical evidence",sourceUrl:`https://${domain}/historical`,sourceType:"Company website",
    capturedAt:evidenceDate.toISOString().slice(0,10),claim:"Historical fixture evidence",summary:"Synthetic saved facts only",
    status:"Corroborated",confidence:80}])]);
  const costDomains=[domain,`rejected-${userId}.invalid`];
  await pool.query(`insert into lead_search_run(id,workspace_id,provider,target_count,country_code,market_name,objective,metadata)
    values($1,$2,'synthetic-ui-fixture',2,'GB','United Kingdom','new-market',$3)`,
    [costRunId,workspaceId,JSON.stringify({assistantActionId:costActionId,graphThreadId:costActionId})]);
  const costQuery=await pool.query<{id:string}>(`insert into lead_search_query(run_id,query_text,role_hint,lead_type,language,region,result_count,credits_used)
    values($1,'Synthetic fixture only','SI','channel','en','United Kingdom',2,0) returning id`,[costRunId]);
  for(const value of costDomains)await pool.query(`insert into lead_search_result(run_id,query_id,url,domain,title,snippet)
    values($1,$2,$3,$4,'Synthetic cost identity','Fixture only')`,[costRunId,costQuery.rows[0].id,`https://${value}`,value]);
  const costReservation=await reservePaidCall(userId,{operationId:costActionId,stage:"synthetic-ui-cost",
    tariffKey:"synthetic-ui-cost",tariffVersion:"fixture-v1",maximumChargeMicros:11,requestBytes:0,
    costAttribution:{version:"company-cost-attribution-v1",kind:"task-shared",roundKey:costRoundKey(costActionId),companyKeys:[]}});
  await settlePaidCall(userId,costReservation,{reportedMicros:0,latencyMs:0,responseBytes:0,inputTokens:0,outputTokens:0,succeeded:true});
  await tenantTransaction(userId,client=>completeTaskCostAllocation(client,userId,costActionId,costRoundKey(costActionId),costDomains.map(value=>companyCostKey(value,"GB"))));
  browser=await chromium.launch({channel:"chrome",headless:true});
  for(const viewport of [{width:1366,height:900},{width:390,height:844}]){
    const context=await browser.newContext({viewport});
    const page=await context.newPage();const errors:string[]=[];
    const editableCompanyPaths=new Set<string>();
    const approvableDraftPaths=new Set<string>();
    // Exercise the real browser cookie policy. The standalone HTTP client does not share
    // Chromium's localhost Secure-cookie behavior when verifying an HTTP production build.
    const readLocal=async(url:string)=>{
      if(new URL(url).origin!==base.origin)throw new Error("Read probe must remain local");
      const result=await page.evaluate(async target=>{
        const response=await fetch(target,{credentials:"same-origin",cache:"no-store"});
        return {status:response.status,body:await response.json()};
      },url);
      return {status:()=>result.status,json:async()=>result.body};
    };
    page.on("pageerror",()=>errors.push("client-runtime-error"));
    // No response mocking: real local UI/API/database. Block browser egress and unsafe writes.
    await context.route("**/*",route=>{
      const request=route.request(),url=new URL(request.url());
      if(url.origin!==base.origin)return route.abort();
      if(request.method()==="PATCH"&&editableCompanyPaths.has(url.pathname))return route.continue();
      if(request.method()==="PATCH"&&approvableDraftPaths.has(url.pathname)){
        const input=request.postDataJSON();
        if(input.approve===true&&typeof input.body==='string'&&input.body.startsWith('Reviewed synthetic saved draft for production UI acceptance'))return route.continue();
      }
      if(request.method()==="POST"&&url.pathname==="/api/workspaces/current/companies"){
        const input=request.postDataJSON();
        if(input.country==="GB"&&input.website===`https://ui-map-${viewport.width}-${userId}.invalid`)return route.continue();
      }
      if(!["GET","HEAD"].includes(request.method())&&!['/api/auth/login','/api/auth/logout'].includes(url.pathname))return route.abort();
      return route.continue();
    });
    await page.goto(base.href);await page.getByLabel("登录邮箱").fill(email);
    await page.getByLabel("密码",{exact:true}).fill(password);
    await page.getByRole("button",{name:"登录",exact:true}).click();
    await expect(page.locator(".nav-item").filter({hasText:"销售线索"})).toBeVisible({timeout:30_000});
    checks.push(`${viewport.width}:real-login`);
    await page.getByRole("button",{name:"AI 销售助理",exact:true}).click();
    await expect(page.getByLabel("提案累计上限（美元）")).toHaveValue("0");
    await expect(page.getByRole("button",{name:"确认预算提案"})).toBeDisabled();
    await page.getByLabel("选择本对话的搜索任务").selectOption(actionId);
    page.once("dialog",dialog=>dialog.dismiss());await page.getByRole("button",{name:"确认预算提案"}).click();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.screenshot({path:`tmp/auth-ui-${viewport.width}-budget-proposal.png`,fullPage:true});
    checks.push(`${viewport.width}:saved-budget-proposal-no-mutation`);
    const workspaceResponse=await readLocal(new URL("/api/workspaces/current",base).href);
    expect(workspaceResponse.status()).toBe(200);
    const workspace=await workspaceResponse.json();
    const gbCompany=workspace.companies.find((company:{displayName:string})=>company.displayName==="UI Fixture GB");
    if(!gbCompany)throw new Error("GB fixture identity missing");
    editableCompanyPaths.add(`/api/workspaces/current/companies/${encodeURIComponent(gbCompany.id)}`);
    expect(workspace.id).toBe(workspaceId);expect(workspace.companies).toHaveLength(2+manuallyAddedDomains.length);
    expect(new Set(workspace.companies.map((company:{id:string})=>company.id)).size).toBe(2+manuallyAddedDomains.length);
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
      if(country==="GB"){
        await expect(page.getByText("超过一年未核实",{exact:true})).toBeVisible();
        await page.getByRole("button",{name:"评分与证据",exact:true}).click();
        await page.getByRole("button",{name:/^Historical fixture evidence/}).click();
        await expect(page.getByRole("dialog",{name:"证据详情",exact:true})).toBeVisible();
        await expect(page.getByText(/超过一年仅提醒，不自动判无效/)).toBeVisible();
        await page.getByRole("button",{name:"关闭证据",exact:true}).click();
        await page.getByRole("button",{name:"概览",exact:true}).click();
        checks.push(`${viewport.width}:old-evidence-reminder-retained-no-research`);
        const role=viewport.width===1366?"Distributor":"MSP";
        const tier=viewport.width===1366?"Priority Distributor":"KA";
        const selectedPath=viewport.width===1366?"OEM/ODM":"Other";
        for(const [label,value] of [["修改主角色",role],["修改账户等级",tier],["修改合作路径",selectedPath]]){
          const saved=page.waitForResponse(response=>response.request().method()==="PATCH"
            &&editableCompanyPaths.has(new URL(response.url()).pathname));
          await page.getByLabel(label,{exact:true}).selectOption(value);
          expect((await saved).status()).toBe(200);
          await expect(page.getByLabel(label,{exact:true})).toHaveValue(value);
        }
        await expect(page.getByText("主角色已修改，当前评分待更新。旧分数仅供历史参考。",{exact:true})).toBeVisible();
        const changed=await (await readLocal(new URL("/api/workspaces/current",base).href)).json();
        expect(changed.companies.find((company:{id:string})=>company.id===gbCompany.id))
          .toMatchObject({primaryBusinessRole:role,accountTier:tier,selectedCooperationPath:selectedPath,assessmentNeedsRefresh:true});
        expect(changed.companies.find((company:{country:string})=>company.country==="MX"))
          .toMatchObject({primaryBusinessRole:"Retailer",accountTier:"Standard"});
        const memory=await pool.query("select content,market_codes,context from user_outreach_memory where user_id=$1 and external_id=$2",[userId,`company-override:${gbCompany.id}`]);
        expect(memory.rows).toHaveLength(1);
        expect(JSON.parse(memory.rows[0].content)).toMatchObject({primaryBusinessRole:role,accountTier:tier,selectedCooperationPath:selectedPath});
        expect(memory.rows[0].market_codes).toEqual(["GB"]);
        expect(memory.rows[0].context.companyExternalId).toBe(gbCompany.id);
        await page.screenshot({path:`tmp/auth-ui-${viewport.width}-company-edit.png`,fullPage:true});
        checks.push(`${viewport.width}:role-tier-path-user-memory-country-isolation`);
      }
      await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.goto(new URL(`/markets/${country}/channel-map`,base).href);
      await expect(page.getByRole("heading",{name:"渠道节点与关系"})).toBeVisible();
      await expect(page.getByRole("img",{name:"当前国家渠道关系图"})).toBeVisible();
      await expect(page.getByLabel("选择国家")).toHaveValue(country);
      await page.screenshot({path:`tmp/auth-ui-${viewport.width}-${country}-map.png`,fullPage:true});
      if(country==="GB"){
        const manualDomain=`ui-map-${viewport.width}-${userId}.invalid`,manualName=`UI Map ${viewport.width}`;
        manuallyAddedDomains.push(manualDomain);
        await page.getByText("添加公司",{exact:true}).click();
        const add=async()=>{
          await page.getByLabel("公司名称",{exact:true}).fill(manualName);
          await page.getByLabel("官网（可选）",{exact:true}).fill(`https://${manualDomain}`);
          await page.getByRole("combobox",{name:/^主角色（可选，人工指定不代表已核实）/}).selectOption("SI");
          const response=page.waitForResponse(value=>value.request().method()==="POST"&&new URL(value.url()).pathname==="/api/workspaces/current/companies");
          await page.getByRole("button",{name:"加入当前国家",exact:true}).click();
          const saved=await response;expect(saved.status()).toBe(200);return saved.json();
        };
        const added=await add();expect(added.duplicate).toBe(false);
        const current=await (await readLocal(new URL("/api/workspaces/current",base).href)).json();
        expect(current.companies.filter((company:{domain:string})=>company.domain===manualDomain))
          .toEqual([expect.objectContaining({country:"GB",primaryBusinessRole:"SI",userAdded:true,assessmentNeedsRefresh:true})]);
        await expect(page.getByRole("img",{name:"当前国家渠道关系图"}).getByText(manualName,{exact:true})).toBeVisible();
        expect((await add()).duplicate).toBe(true);
        await expect(page.getByRole("dialog")).toBeVisible();await page.keyboard.press("Escape");
        const after=await (await readLocal(new URL("/api/workspaces/current",base).href)).json();
        expect(after.companies.filter((company:{domain:string})=>company.domain===manualDomain)).toHaveLength(1);
        await page.screenshot({path:`tmp/auth-ui-${viewport.width}-manual-map.png`,fullPage:true});
        checks.push(`${viewport.width}:manual-map-add-persist-duplicate-no-model`);
      }
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      checks.push(`${viewport.width}:${country}:country-detail-map`);
    }
    for(const label of ["任务进程","知识库 & RAG","邮箱学习"]){
      await page.locator(".nav-item").filter({hasText:label}).click();
      await expect(page.locator(".nav-item.active")).toContainText(label);
    }
    for(const path of ["/api/tasks","/api/tasks/markets","/api/tasks/usage","/api/budget"]){
      const read=await readLocal(new URL(path,base).href);expect(read.status(),path).toBe(200);
    }
    await page.goto(new URL(`/tasks/${actionId}?kind=search`,base).href);
    await page.getByText("任务预算与成本",{exact:true}).click();
    await expect(page.getByText(/任务上限 \$0.000000/)).toBeVisible();
    const taskBudget=await readLocal(new URL(`/api/budget?actionId=${actionId}`,base).href);
    const taskBudgetData=await taskBudget.json();
    expect(taskBudgetData.taskLimit.limit_micros).toBe("0");
    expect(taskBudgetData.modelUsage).toEqual([]);
    await page.getByText("模型用量与缓存观测",{exact:true}).click();
    await expect(page.getByText("暂无可用观测记录，不能推断用量或费用为零。",{exact:true})).toBeVisible();
    await page.screenshot({path:`tmp/auth-ui-${viewport.width}-model-usage.png`,fullPage:true});
    checks.push(`${viewport.width}:usage-observations-real-sql-empty-not-zero`);
    checks.push(`${viewport.width}:task-budget-real-api`);
    await page.goto(new URL(`/tasks/${costActionId}?kind=search`,base).href);
    await page.getByText("任务预算与成本",{exact:true}).click();
    await page.getByText("按公司分摊费用",{exact:true}).click();
    const companyCosts=page.locator("details").filter({has:page.locator("summary",{hasText:"按公司分摊费用"})}).last();
    await expect(companyCosts.getByRole("heading",{name:`${costDomains[0]} · GB`,exact:true})).toBeVisible();
    await expect(companyCosts.getByRole("heading",{name:`${costDomains[1]} · GB`,exact:true})).toBeVisible();
    await expect(companyCosts.getByText("$0.000006 · 1/1 次有记录",{exact:true})).toHaveCount(2);
    await expect(companyCosts.getByText("$0.000005 · 1/1 次有记录",{exact:true})).toHaveCount(2);
    await expect(companyCosts.getByText("$0.000000 · 1/1 次有记录",{exact:true})).toHaveCount(2);
    await expect(companyCosts.getByText("未知 · 0/1 次有记录",{exact:true})).toHaveCount(4);
    await page.screenshot({path:`tmp/auth-ui-${viewport.width}-company-cost.png`,fullPage:true});
    const firstCosts=await (await readLocal(new URL(`/api/budget?actionId=${costActionId}`,base).href)).json();
    await page.getByRole("button",{name:"刷新任务预算",exact:true}).click();
    await expect(companyCosts.getByRole("heading")).toHaveCount(2);
    const secondCosts=await (await readLocal(new URL(`/api/budget?actionId=${costActionId}`,base).href)).json();
    expect(secondCosts.companyCosts).toEqual(firstCosts.companyCosts);
    checks.push(`${viewport.width}:company-cost-domain-country-coverage-real-api`);
    for(const scenario of completionScenarios){
      await page.goto(new URL(`/tasks/${scenario.id}?kind=search`,base).href);
      const panel=page.locator('section.panel').filter({has:page.getByRole('heading',{name:'United Kingdom · 销售线索搜索',exact:true})}).last();
      await expect(panel.getByText(/目标 5 家/)).toBeVisible();
      const value=(label:string)=>panel.locator('dl > div').filter({has:page.locator('dt').filter({hasText:new RegExp(`^${label}$`)})}).locator('dd');
      await expect(value('发现')).toHaveText(scenario.accepted===null?'尚无记录':'9');
      await expect(value('已评估')).toHaveText(scenario.accepted===null?'尚无记录':'7');
      await expect(value('合格')).toHaveText(scenario.accepted===null?'尚无记录':String(scenario.accepted));
      await expect(value('最终保存')).toHaveText(scenario.accepted===null?'尚无记录':String(scenario.accepted));
      if(scenario.accepted===null){
        await expect(panel.getByText(/^缺口 /)).toHaveCount(0);
        await expect(panel.locator('dl[aria-label="已保存待处理数量"] dd')).toHaveText(['尚无记录','尚无记录']);
      }else if(scenario.reason==='target-met'){
        await expect(panel.getByText('停止原因：目标已满足',{exact:true})).toBeVisible();
        await expect(panel.getByText(/^缺口 /)).toHaveCount(0);
      }else{
        await expect(panel.getByText(`缺口 3 家；${scenario.label}`,{exact:true})).toBeVisible();
        if(scenario.reason==='budget-blocked')await expect(panel.getByRole('alert')).toHaveText(scenario.label);
        else await expect(panel.getByText('运行结束，目标未填满 · 目标 5 家',{exact:true})).toBeVisible();
        if(scenario.reason==='role-unresolved')await expect(panel.getByText('角色待判 1 家（未计入最终合格）',{exact:true})).toBeVisible();
      }
      if(['confirmed-exhaustion','processing-incomplete','budget-blocked'].includes(scenario.reason))
        await expect(panel.getByRole('button',{name:'建立缺口续搜计划（不执行）',exact:true})).toHaveCount(0);
      const before=await (await readLocal(new URL(`/api/tasks/${scenario.id}?kind=search`,base).href)).json();
      await page.getByRole('button',{name:'刷新',exact:true}).click();
      await expect(value('最终保存')).toHaveText(scenario.accepted===null?'尚无记录':String(scenario.accepted));
      const after=await (await readLocal(new URL(`/api/tasks/${scenario.id}?kind=search`,base).href)).json();
      expect(after.action.result).toEqual(before.action.result);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      checks.push(`${viewport.width}:completion-${scenario.reason}-counts-refresh`);
    }
    const draftCompanies=(await (await readLocal(new URL('/api/workspaces/current',base).href)).json()).companies as import('../src/lib/domain').CompanyRecord[];
    const draftCompany=draftCompanies.find(item=>item.country==='GB'&&item.domain===domain)!;
    const draftIdentity=await pool.query<{company_id:string}>('select company_id from workspace_company_market where workspace_id=$1 and candidate_id=$2',[workspaceId,draftCompany.id]);
    const savedDraft=await persistDevelopmentDraft({userId,workspaceId,companyId:draftIdentity.rows[0].company_id,company:draftCompany,
      dependencyVersion:await developmentDependencyVersion(userId),knowledge:[],templates:[]},
      {strategy:{objective:'Synthetic partnership',personalizationAngle:'Fixture context',valuePropositions:['Fixture value'],recommendedProducts:[],targetTitles:[],likelyObjections:[],callToAction:'Fixture CTA',followUpPlan:['Fixture follow-up'],evidenceIds:[],knowledgeIds:[]},
        draft:{language:'en',subjectOptions:['Saved fixture subject'],body:'Original fixture draft',wordCount:3,placeholders:[]},
        evidenceIds:[],knowledgeIds:[],templateIds:[],warnings:[],model:'synthetic',promptVersion:'ui-fixture',generationMetrics:{modelCalls:0,latencyMs:0}},{});
    const manualBody=`Reviewed synthetic saved draft for production UI acceptance ${viewport.width}`;
    expect(await updateDevelopmentDraft(userId,savedDraft.id,{body:manualBody})).toBe(true);
    const approvePath=`/api/development-strategies/${savedDraft.id}`;
    approvableDraftPaths.add(approvePath);
    const draftUrl=new URL(`/api/development-strategies?company=${encodeURIComponent(draftCompany.id)}`,base).href;
    const readDraft=async()=>(await (await readLocal(draftUrl)).json()).result;
    expect(await readDraft()).toMatchObject({id:savedDraft.id,status:'generated',contextReview:'current',draft:{body:manualBody}});
    const openSavedDraft=async()=>{
      await page.goto(new URL('/markets/GB/leads',base).href);
      await page.getByRole('button',{name:'打开 UI Fixture GB 详情',exact:true}).click();
      await page.getByRole('button',{name:'打开开发助手（不自动生成）',exact:true}).click();
      await expect(page.getByLabel('开发信草稿',{exact:true})).toHaveValue(manualBody);
    };
    await openSavedDraft();
    await page.getByRole('button',{name:'确认并批准',exact:true}).click();
    await expect(page.getByRole('button',{name:'已批准',exact:true})).toBeDisabled();
    const repeatStatuses=await page.evaluate(async({path,body})=>Promise.all([1,2].map(async()=>{
      const response=await fetch(path,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({body,approve:true})});
      return response.status;
    })),{path:approvePath,body:manualBody});
    expect(repeatStatuses).toEqual([200,200]);
    await openSavedDraft();
    await pool.query("insert into user_outreach_memory(user_id,workspace_id,kind,external_id,title,content,market_codes) values($1,$2,'email-style',$3,'Fixture style','Synthetic style update',ARRAY['GB'])",[userId,workspaceId,`ui-draft-${viewport.width}`]);
    expect((await readDraft()).contextReview).toBe('changed');
    await openSavedDraft();
    await expect(page.getByText('公司角色、路径、证据或可用知识/关系记录已变化：请复核历史策略。不会自动重生成或产生费用。',{exact:true})).toBeVisible();
    const mxCompany=draftCompanies.find(item=>item.country==='MX'&&item.domain===domain)!;
    const mxDraft=await (await readLocal(new URL(`/api/development-strategies?company=${encodeURIComponent(mxCompany.id)}`,base).href)).json();
    expect(mxDraft.result).toBeNull();
    await pool.query("update outreach_draft set input_snapshot='{}'::jsonb where id=$1 and user_id=$2",[savedDraft.id,userId]);
    expect((await readDraft()).contextReview).toBe('legacy-unknown');
    await openSavedDraft();
    await expect(page.getByText('此历史策略没有完整上下文版本记录，请核对当前角色、路径、证据与知识后使用。',{exact:true})).toBeVisible();
    expect((await pool.query('select revision,manual_body,status from outreach_draft where id=$1',[savedDraft.id])).rows[0]).toMatchObject({revision:2,manual_body:manualBody,status:'approved'});
    const approvals=await pool.query("select changes from workspace_audit_event where actor_user_id=$1 and entity_id=$2 and action='outreach-draft.approved'",[userId,savedDraft.id]);
    expect(approvals.rows).toHaveLength(1);
    expect(approvals.rows[0].changes).toMatchObject({actor:'user',countryCode:'GB',revision:2,approvedDrafts:1,generatedArtifacts:0,mailSent:null,usageBoundary:'explicit-draft-approval-not-sending'});
    expect(JSON.stringify(approvals.rows[0].changes)).not.toContain(manualBody);
    await page.getByLabel('开发信草稿',{exact:true}).fill(`${manualBody} Edited after approval.`);
    await page.getByRole('button',{name:'确认并批准',exact:true}).click();
    await expect(page.getByRole('button',{name:'已批准',exact:true})).toBeDisabled();
    const revisedApprovals=await pool.query("select changes->>'revision' as revision from workspace_audit_event where actor_user_id=$1 and entity_id=$2 and action='outreach-draft.approved' order by created_at,id",[userId,savedDraft.id]);
    expect(revisedApprovals.rows.map(row=>row.revision)).toEqual(['2','3']);
    expect(await updateDevelopmentDraft(userId,savedDraft.id,{body:`${manualBody} Saved without approval.`})).toBe(true);
    expect((await readDraft()).status).toBe('generated');
    checks.push(`${viewport.width}:ui-approval-concurrent-replay-single-country-event`);
    checks.push(`${viewport.width}:saved-strategy-manual-body-approval-refresh-dependency-country-legacy`);
    await seedProgress();
    await page.goto(new URL(`/tasks/${progressActionId}?kind=search`,base).href);
    const pending=page.locator('dl[aria-label="已保存待处理数量"]');
    await expect(pending.locator('dd')).toHaveText(['1','1']);
    await seedProgress(true);
    await page.getByRole('button',{name:'刷新',exact:true}).click();
    await expect(pending.locator('dd')).toHaveText(['0','0']);
    const progress=await (await readLocal(new URL(`/api/assistant/actions/${progressActionId}/progress`,base).href)).json();
    expect(progress.progress.creditsUsed).toBe(13);
    await seedProgress(false,randomUUID());
    await page.getByRole('button',{name:'刷新',exact:true}).click();
    await expect(page.getByText('进度读取失败，可刷新重试',{exact:true})).toBeVisible();
    await expect(pending.locator('dd')).toHaveText(['尚无记录','尚无记录']);
    await seedProgress(true);
    await page.getByRole('button',{name:'刷新',exact:true}).click();
    await expect(pending.locator('dd')).toHaveText(['0','0']);
    await expect(page.getByText('进度读取失败，可刷新重试',{exact:true})).toHaveCount(0);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    checks.push(`${viewport.width}:saved-pending-counts-refresh-zero-owner-failure-recovery`);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    expect(errors).toEqual([]);checks.push(`${viewport.width}:navigation-apis-no-runtime-error`);
    // Revoke access on the next request, even when the browser retains a valid cookie.
    const identity=await pool.query("update app_user set status='disabled' where id=$1 and email=$2 returning id",[userId,email]);
    expect(identity.rowCount).toBe(1);
    try{const denied=await readLocal(new URL("/api/budget",base).href);expect(denied.status()).toBe(401);}
    finally{await pool.query("update app_user set status='active' where id=$1 and email=$2",[userId,email]);}
    checks.push(`${viewport.width}:disabled-user-session-denied`);
    await context.close();
  }
  const calls=await pool.query("select count(*)::int as n from paid_call_reservation where user_id=$1",[userId]);
  expect(calls.rows[0].n).toBe(1);
  const unexpected=await pool.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-ui-cost'",[userId]);
  expect(unexpected.rows).toHaveLength(0);
  expect((await pool.query('select action_id,status from lead_workflow_job where user_id=$1',[userId])).rows).toEqual([{action_id:progressActionId,status:'cancelled'}]);
  expect((await pool.query('select id from workflow_artifact_event where user_id=$1',[userId])).rows).toHaveLength(0);
  console.log(JSON.stringify({authenticatedUi:"passed",checks,paidCalls:0,syntheticReservations:1,realMailSent:0,fixtureOnly:true}));
}finally{
  await browser?.close();
  await progressSaver.deleteThread(progressThread);
  if(created){
    const client=await pool.connect();
    try{
      await client.query("begin");
      const owner=await client.query("select id from app_user where id=$1 and email=$2 for update",[userId,email]);
      if(owner.rowCount!==1)throw new Error("Fixture identity mismatch; refusing cleanup");
      const realAccounting=await client.query("select id from paid_call_reservation where user_id=$1 and tariff_key<>'synthetic-ui-cost' limit 1",[userId]);
      if(realAccounting.rowCount)throw new Error("Unexpected paid accounting; preserve fixture for reconciliation");
      await client.query("delete from user_outreach_memory where user_id=$1",[userId]);
      await client.query("delete from outreach_draft where user_id=$1",[userId]);
      await client.query("delete from paid_cost_observation where user_id=$1",[userId]);
      await client.query("delete from paid_call_reservation where user_id=$1",[userId]);
      await client.query("delete from lead_search_run where id=$1 and workspace_id=$2",[costRunId,workspaceId]);
      await client.query("delete from task_spend_limit where user_id=$1",[userId]);
      await client.query("delete from assistant_conversation where user_id=$1",[userId]);
      await client.query("delete from market_workspace where id=$1 and owner_id=$2",[workspaceId,userId]);
      await client.query("delete from sales_company where domain=any($1::text[]) and not exists(select 1 from workspace_company where company_id=sales_company.id)",[[domain,...manuallyAddedDomains]]);
      await client.query("delete from spend_budget_change where user_id=$1",[userId]);
      await client.query("delete from user_spend_budget where user_id=$1",[userId]);
      await client.query("delete from app_user where id=$1 and email=$2",[userId,email]);
      await client.query("commit");console.log("Temporary synthetic user/workspace/company removed; no customer records changed.");
    }catch(error){await client.query("rollback");throw error;}finally{client.release();}
  }
  await pool.end();
  await getPool().end();
}
