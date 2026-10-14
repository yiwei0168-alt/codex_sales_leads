import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import { Pool, type Client } from "pg";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildLeadWorkflowGraph } from "../../src/lib/leads/workflow/graph";
import type { LeadWorkflowDependencies } from "../../src/lib/leads/workflow/graph";
import { checkpointInvocation } from "../../src/lib/leads/workflow/pause";
import { plan as checkpointPlan } from "../workflow-recovery-fixtures";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export async function verifyMa24RawJsonClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
  migrationDatabaseUrl: string; applicationDatabaseUrl: string;
}): Promise<unknown> {
  const collection = randomUUID();
  const documentId = randomUUID();
  const assetId = randomUUID();
  const versionId = randomUUID();
  const taskId = randomUUID();
  const checkpointActionId = randomUUID();
  const checkpointConversationId = randomUUID();
  const checkpointThread = `ma24-f12-checkpoint:${checkpointActionId}`;
  const observationId = randomUUID();
  const personalMemoryId = randomUUID();
  const title = `MA24 F12 synthetic coordinates ${documentId.slice(0, 8)}`;
  const sourceSha = "a".repeat(64);
  const longValue = "SYNTHETIC".repeat(180);
  const location = { unitType: "page", unitIndex: 1, blockId: "block-1", diagnosticKey: longValue };
  const content = "Synthetic evidence body for raw coordinate display.";
  const workspaceId = randomUUID();
  const runId = randomUUID();
  const companyDomain = `ma24-f12-${randomUUID()}.invalid`;
  const companyName = `MA24 F12 synthetic score ${runId.slice(0, 8)}`;
  const dimensions = { productFamilyMatch: 20, customerAndScenarioOverlap: 12,
    positioningCompatibility: 8, cooperationPathAndBuyingInfluence: 10,
    scaleAndChannelCoverage: 7, executionAndEnablement: 6,
    opportunityAndRisk: 5, diagnosticKey: longValue };
  const policy = { version: "synthetic-f12-v1", weights: { productAndUseCaseFit: 50,
    cooperationPathAndBuyingInfluence: 15, scaleAndChannelCoverage: 15,
    executionAndEnablement: 10, opportunityAndRisk: 10 } };
  const taskMetrics = { stage: "synthetic-generation", diagnosticKey: longValue,
    source: { kind: "fixture", page: 3, block: "task-raw-json" } };
  const memoryReceipt = { type: "synthetic-f12-memory-source", diagnosticKey: longValue,
    location: { page: 3, block: "memory-source" } };
  const memoryContent = `Synthetic F12 observation ${observationId.slice(0, 8)}`;
  await options.admin.query(
    "insert into product_operation_metric(id,user_id,stage,status,metrics) values($1,$2,'development-generation','completed',$3)",
    [taskId, options.userId, JSON.stringify(taskMetrics)],
  );
  await options.admin.query(
    "insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic F12 checkpoint')",
    [checkpointConversationId, options.userId],
  );
  await options.admin.query(
    "insert into assistant_action(id,user_id,conversation_id,action_type,status,payload,result) values($1,$2,$3,'lead-search','completed',$4,'{}'::jsonb)",
    [checkpointActionId, options.userId, checkpointConversationId, JSON.stringify({
      ...checkpointPlan, countryCode: "DE", countryName: "Germany", targetCount: 1,
      userRequest: "Synthetic F12 saved checkpoint display",
    })],
  );
  await options.admin.query(
    "insert into lead_workflow_job(user_id,action_id,graph_thread_id,status,phase,execution_mode) values($1,$2,$3,'completed','completed','inline')",
    [options.userId, checkpointActionId, checkpointThread],
  );
  const checkpointPool = new Pool({ connectionString: options.migrationDatabaseUrl });
  try {
    const graph = buildLeadWorkflowGraph({} as LeadWorkflowDependencies,
      new PostgresSaver(checkpointPool, undefined, { schema: "langgraph" }));
    await graph.updateState({ configurable: { thread_id: checkpointThread } }, {
      userId: options.userId, actionId: checkpointActionId, workspaceId: randomUUID(),
      graphThreadId: checkpointThread, phase: "completed",
      plan: { ...checkpointPlan, countryCode: "DE", countryName: "Germany", targetCount: 1 },
      candidates: [], correctedCandidates: [], assessments: [], assessmentReviews: [],
      creditsUsed: 13, modelUsage: [], stageMetrics: [], warnings: [longValue],
    }, "collect_evidence");
    const seeded = await graph.getState({ configurable: { thread_id: checkpointThread } });
    assert(seeded.next.length > 0 || seeded.values.result,
      "Synthetic F12 checkpoint must be resumable or terminal before the UI reads it");
  } finally { await checkpointPool.end(); }
  const checkpointAppPool = new Pool({ connectionString: options.applicationDatabaseUrl });
  try {
    const graph = buildLeadWorkflowGraph({} as LeadWorkflowDependencies,
      new PostgresSaver(checkpointAppPool, undefined, { schema: "langgraph" }));
    const snapshot = await graph.getState({ configurable: { thread_id: checkpointThread } });
    assert.equal(snapshot.values.userId, options.userId);
    assert.equal(snapshot.values.actionId, checkpointActionId);
    checkpointInvocation(snapshot, options.userId, checkpointActionId);
  } finally { await checkpointAppPool.end(); }
  await options.admin.query(
    `insert into agent_memory_observation(id,owner_id,kind,content,source_receipt,valid_from)
     values($1,$2,'experience',$3,$4,now()-interval '1 minute')`,
    [observationId, options.userId, memoryContent, JSON.stringify(memoryReceipt)],
  );
  await options.admin.query(
    "insert into market_workspace(id,owner_id,slug,name,market,country_code) values($1,$2,'global-sales','Synthetic score display','Germany','DE')",
    [workspaceId, options.userId],
  );
  const created = await fetch(`${options.base}/api/workspaces/current/companies`, {
    method: "POST", headers: { cookie: options.cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: companyName, country: "DE", website: `https://${companyDomain}`, role: "SI" }),
  });
  assert.equal(created.status, 200, `Synthetic company creation HTTP ${created.status}`);
  const company = await created.json() as { externalId: string; duplicate: boolean };
  assert.equal(company.duplicate, false);
  const companyRow = (await options.admin.query<{ id: string }>(
    "select id from sales_company where lower(domain)=lower($1)", [companyDomain],
  )).rows[0];
  assert(companyRow?.id);
  await options.admin.query(
    `insert into lead_search_run(id,workspace_id,provider,target_count,country_code,status,scoring_policy_version,scoring_policy_snapshot)
     values($1,$2,'synthetic-f12-score',1,'DE','completed','synthetic-f12-v1',$3)`,
    [runId, workspaceId, JSON.stringify(policy)],
  );
  await options.admin.query(
    "update workspace_company_market set search_run_id=$1 where workspace_id=$2 and candidate_id=$3",
    [runId, workspaceId, company.externalId],
  );
  await options.admin.query(
    `insert into lead_candidate_assessment(user_id,run_id,candidate_id,company_name,domain,official_website_url,
       eligible,total_score,confidence,gates,dimensions,account_tier,supply_model,brand_involvement,summary,model,prompt_version)
     values($1,$2,$3,$4,$5,$6,true,60,80,'{}',$7,'Standard','TBD','Standard','Synthetic saved score','synthetic','fixture')`,
    [options.userId, runId, company.externalId, companyName, companyDomain,
      `https://${companyDomain}/`, JSON.stringify(dimensions)],
  );
  await options.admin.query(
    "insert into knowledge_collection(id,slug,name,base_type) values($1,$2,'Synthetic coordinate display','company')",
    [collection, `ma24-f12-${documentId.slice(0, 8)}`],
  );
  await options.admin.query(
    `insert into knowledge_document(id,collection_id,external_id,title,source_type,content_sha256,owner_id,visibility)
     values($1,$2,$1::uuid::text,$3,'manual',$4,$5,'private')`,
    [documentId, collection, title, sourceSha, options.userId],
  );
  await options.admin.query(
    `insert into knowledge_asset(id,document_id,storage_key,source_sha256,mime_type,byte_size,document_type,source_nature)
     values($1,$2,$3,$4,'application/pdf',0,'datasheet','synthetic')`,
    [assetId, documentId, `synthetic/${assetId}.pdf`, sourceSha],
  );
  await options.admin.query(
    `insert into knowledge_tree_version(id,document_id,asset_id,source_sha256,extractor_version,artifact_sha256,status,ready_at)
     values($1,$2,$3,$4,'synthetic-v1',$5,'ready',now())`,
    [versionId, documentId, assetId, sourceSha, digest(content)],
  );
  const unit = (await options.admin.query<{ id: string }>(
    `insert into knowledge_tree_node(version_id,ordinal,node_kind,title,unit_type,unit_index,source_location)
     values($1,0,'unit','Page 1','page',1,$2) returning id`,
    [versionId, JSON.stringify({ unitType: "page", unitIndex: 1 })],
  )).rows[0].id;
  await options.admin.query(
    `insert into knowledge_tree_node(version_id,parent_id,ordinal,node_kind,title,unit_type,unit_index,source_location,content,content_sha256)
     values($1,$2,0,'evidence','Synthetic block','page',1,$3,$4,$5)`,
    [versionId, unit, JSON.stringify(location), content, digest(content)],
  );
  await options.admin.query("update knowledge_document set current_tree_version_id=$2 where id=$1", [documentId, versionId]);
  const memorySaved = await fetch(`${options.base}/api/knowledge/memories`, {
    method: "POST", headers: { cookie: options.cookie, "content-type": "application/json" },
    body: JSON.stringify({ id: personalMemoryId, mode: "create", kind: "email-style",
      title: "Synthetic F12 audit", content: "Synthetic private memory audit entry",
      marketCodes: [], channelRoles: [], externalUseApproved: false, confirmed: true }),
  });
  assert.equal(memorySaved.status, 200, `Synthetic memory save HTTP ${memorySaved.status}`);
  const observationResponse = await fetch(`${options.base}/api/knowledge/observations?view=current`,
    { headers: { cookie: options.cookie } });
  assert.equal(observationResponse.status, 200);
  const observationItems = (await observationResponse.json() as { items: Array<{ id: string; source_receipt: typeof memoryReceipt }> }).items;
  assert.deepEqual(observationItems.find(item => item.id === observationId)?.source_receipt, memoryReceipt);
  const auditResponse = await fetch(`${options.base}/api/knowledge/memories/history?offset=0`,
    { headers: { cookie: options.cookie } });
  assert.equal(auditResponse.status, 200);
  const audit = (await auditResponse.json() as { items: Array<{ memoryId: string; beforeState: unknown; afterState: unknown }> })
    .items.find(item => item.memoryId === personalMemoryId);
  assert(audit?.afterState);
  assert.equal(audit.beforeState, null);
  assert(!JSON.stringify(audit.afterState).includes("Synthetic private memory audit entry"));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: options.base });
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "知识库", exact: true }).click();
        await page.getByRole("textbox", { name: "搜索资料" }).fill(title);
        await page.getByRole("button", { name: "搜索", exact: true }).click();
        await page.locator(".library-title").filter({ hasText: title }).click();
        const tree = page.getByRole("region", { name: "原文坐标" });
        await tree.getByRole("button", { name: /Page 1/ }).click();
        await tree.getByRole("button", { name: /Synthetic block/ }).click();
        await expect(tree).toContainText(content);
        await tree.getByText("完整来源坐标", { exact: true }).click();
        const details = tree.locator(".raw-json-details");
        await expect(details.locator("pre")).toContainText(longValue);
        assert(await details.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await details.getByRole("button", { name: "复制 JSON" }).click();
        await expect(details.getByRole("status")).toContainText("已复制原始 JSON");
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), location);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.goto(`${options.base}/markets/DE/leads`);
        await page.getByRole("button", { name: `打开 ${companyName} 详情`, exact: true }).click();
        const scoreDialog = page.getByRole("dialog", { name: `${companyName} 公司详情` });
        await scoreDialog.getByRole("button", { name: "评分与证据", exact: true }).click();
        await expect(scoreDialog).toContainText("政策版本：synthetic-f12-v1");
        await expect(scoreDialog.locator("dl")).toContainText("40 / 50");
        const scoreDetails = scoreDialog.locator(".raw-json-details").filter({ hasText: "原始子项评分" });
        await expect(scoreDetails).not.toHaveAttribute("open");
        await scoreDetails.locator("summary").click();
        await expect(scoreDetails.locator("pre")).toContainText(longValue);
        assert(await scoreDetails.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await scoreDetails.getByRole("button", { name: "复制 JSON" }).click();
        await expect(scoreDetails.getByRole("status")).toContainText("已复制原始 JSON");
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), dimensions);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const taskResponse = await fetch(`${options.base}/api/tasks/${taskId}?kind=generation`,
          { headers: { cookie: options.cookie } });
        assert.equal(taskResponse.status, 200);
        const task = await taskResponse.json() as { details: { metrics: typeof taskMetrics } };
        assert.deepEqual(task.details.metrics, taskMetrics);
        await page.goto(`${options.base}/tasks/${taskId}?kind=generation`);
        await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
        const taskDetails = page.locator(".raw-json-details").filter({ hasText: "技术记录（原始结构，按需展开）" });
        await expect(taskDetails).not.toHaveAttribute("open");
        await taskDetails.locator("summary").click();
        await expect(taskDetails.locator("pre")).toContainText(longValue);
        assert(await taskDetails.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await taskDetails.getByRole("button", { name: "复制 JSON" }).click();
        await expect(taskDetails.getByRole("status")).toContainText("已复制原始 JSON");
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), task.details);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        const checkpointResponse = await fetch(`${options.base}/api/assistant/actions/${checkpointActionId}/progress`,
          { headers: { cookie: options.cookie } });
        assert.equal(checkpointResponse.status, 200);
        const checkpoint = await checkpointResponse.json() as { progress: { warnings: string[]; creditsUsed: number } };
        assert.equal(checkpoint.progress.creditsUsed, 13);
        assert.deepEqual(checkpoint.progress.warnings, [longValue]);
        await page.goto(`${options.base}/tasks/${checkpointActionId}?kind=search`);
        await expect(page.getByRole("heading", { name: "任务详情" })).toBeVisible();
        const checkpointDetails = page.locator(".raw-json-details")
          .filter({ hasText: "阶段成本与数量记录（已保存检查点）" });
        await expect(checkpointDetails).not.toHaveAttribute("open");
        await checkpointDetails.locator("summary").click();
        await expect(checkpointDetails.locator("pre")).toContainText(longValue);
        assert(await checkpointDetails.locator("pre")
          .evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await checkpointDetails.getByRole("button", { name: "复制 JSON" }).click();
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), checkpoint.progress);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "知识库", exact: true }).click();
        await page.getByRole("navigation", { name: "资料分区" }).getByRole("button", { name: "个人记忆" }).click();
        const learning = page.getByRole("region", { name: "学习记忆" });
        const observation = learning.locator("article").filter({ hasText: memoryContent });
        await expect(observation).toBeVisible();
        const receipt = observation.locator(".raw-json-details");
        await expect(receipt).not.toHaveAttribute("open");
        await receipt.locator("summary").click();
        await expect(receipt.locator("pre")).toContainText(longValue);
        assert(await receipt.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
        await receipt.getByRole("button", { name: "复制 JSON" }).click();
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), memoryReceipt);
        await page.getByRole("navigation", { name: "记忆来源" }).getByRole("button", { name: "原有记忆" }).click();
        await page.getByText("记忆变更审计", { exact: true }).click();
        const history = page.locator("article").filter({ hasText: `记忆 ${personalMemoryId.slice(0, 8)}` });
        await expect(history).toBeVisible();
        const snapshot = history.locator(".raw-json-details");
        await expect(snapshot).not.toHaveAttribute("open");
        await snapshot.locator("summary").click();
        await snapshot.getByRole("button", { name: "复制 JSON" }).click();
        assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())),
          { before: audit.beforeState, after: audit.afterState });
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    return { candidatePage: true, syntheticTreeRead: true, longCoordinateCharacters: longValue.length,
      rawJsonSecondary: true, wrappedWithoutHorizontalOverflow: true, copiedExactJson: true,
      savedCompanyScorePage: true, readableSubscore: "40 / 50", policyVersion: "synthetic-f12-v1",
      savedTaskDetailPage: true, taskDetailApi: 200, taskRawJsonCopiedFromApi: true,
      savedCheckpointPage: true, checkpointProgressApi: 200, checkpointRawJsonCopiedFromApi: true,
      memoryObservationApi: 200, memorySourceReceiptCopiedFromApi: true,
      memoryAuditTriggeredByActualSave: true, memoryAuditCopiedFromApi: true,
      viewports: ["390x760", "1366x900"], pageErrors: 0, modelCalls: 0, productionWrites: 0 };
  } finally { await browser.close(); }
}
