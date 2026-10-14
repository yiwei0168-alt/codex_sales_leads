import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

export async function verifyMa24SkillReplayRawJsonClone(options: {
  admin: Client; base: string; cookie: string; userId: string; migrationDatabaseUrl: string;
}): Promise<unknown> {
  // This process only uses the disposable restored database for the synthetic replay.
  process.env.DATABASE_URL = options.migrationDatabaseUrl;
  const [{ digest }, { knowledgeCompareTool }, { importSkill },
    { prepareHistoricalSkillReplay }, { runSkillReplay }, { storeHistoricalSkillReplay }, { getPool }] = await Promise.all([
    import("../../src/lib/assistant/main/contracts"),
    import("../../src/lib/assistant/main/knowledge-compare-tool"),
    import("../../src/lib/assistant/main/skills"),
    import("../../src/lib/assistant/main/skill-replay-snapshot"),
    import("../../src/lib/assistant/main/skill-replay"),
    import("../../src/lib/assistant/main/skill-review-store"),
    import("../../src/lib/rag/db"),
  ]);
  const conversation = randomUUID(), run = randomUUID(), call = randomUUID();
  const question = "Compare AP3000 and AP3600 interface tables for this synthetic UI check.";
  const skillName = `MA24 F12 replay receipt ${run.slice(0, 8)}`;
  try {
    await options.admin.query("insert into assistant_conversation(id,user_id,title) values($1,$2,'Synthetic F12 replay')",
      [conversation, options.userId]);
    await options.admin.query(`insert into agent_run(id,user_id,conversation_id,request_key,request_hash,input,model_config,status,execution_kind)
      values($1,$2,$3,$1::uuid::text,$1::uuid::text,$4,'{}','completed','main-agent')`,
      [run, options.userId, conversation, JSON.stringify({ content: question })]);
    await options.admin.query("insert into assistant_message(user_id,conversation_id,role,intent,content,metadata) values($1,$2,'user','general',$3,$4)",
      [options.userId, conversation, question, JSON.stringify({ runId: run })]);
    const args = { entities: ["AP3000", "AP3600"], attributes: ["ethernet_ports"] };
    const output = await knowledgeCompareTool.execute(args,
      { userId: options.userId, runId: run, leaseToken: randomUUID(), role: "member" });
    assert(["success", "partial"].includes(output.status));
    await options.admin.query(`insert into agent_tool_call(id,user_id,run_id,call_key,tool_id,tool_version,input_hash,input,effect,status,output)
      values($1,$2,$3,$1::uuid::text,'knowledge_compare','1',$4,$5,'read','completed',$6)`,
      [call, options.userId, run, digest(args), JSON.stringify(args), JSON.stringify(output)]);
    const skill = await importSkill({ userId: options.userId, role: "member" },
      { name: skillName, source: "synthetic-probe", files: { "SKILL.md": "Read original interface tables independently." }, dependencies: [] });
    const snapshot = await prepareHistoricalSkillReplay({ userId: options.userId },
      { skillId: skill.id, version: 1, runIds: [run] });
    assert.equal(snapshot.bindings[0].calls[0].id, call);
    const result = await runSkillReplay(snapshot.suite,
      async () => ({ kind: "answer", text: "Synthetic UI storage answer only." }));
    const stored = await storeHistoricalSkillReplay({ userId: options.userId }, snapshot, result);
    const api = await fetch(`${options.base}/api/assistant/skills/reviews?id=${stored.id}`,
      { headers: { cookie: options.cookie } });
    assert.equal(api.status, 200);
    const detail = await api.json() as { snapshot: { suite: { cases: Array<{ receipts: unknown[] }> } } };
    assert.deepEqual(detail.snapshot.suite.cases[0].receipts, snapshot.suite.cases[0].receipts);
    const anonymous = await fetch(`${options.base}/api/assistant/skills/reviews?id=${stored.id}`);
    assert.equal(anonymous.status, 401);
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
          const errors: string[] = [];
          page.on("pageerror", error => errors.push(error.message));
          await page.goto(options.base);
          if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
          await page.getByRole("button", { name: "知识库", exact: true }).click();
          await page.getByRole("navigation", { name: "资料分区" }).getByRole("button", { name: "个人记忆" }).click();
          await page.getByRole("navigation", { name: "记忆来源" }).getByRole("button", { name: "学习记忆" }).click();
          await page.getByRole("navigation", { name: "学习记忆分区" }).getByRole("button", { name: "Skill" }).click();
          const skill = page.getByRole("region", { name: "Skill" }).locator("article").filter({ hasText: skillName });
          await expect(skill).toBeVisible();
          await skill.getByRole("button", { name: "评测审核" }).click();
          const reviews = page.getByRole("region", { name: "Skill 评测审核" });
          await reviews.getByRole("button", { name: "打开审核" }).click();
          await expect(reviews.getByRole("heading", { name: question })).toBeVisible();
          const raw = reviews.locator(".raw-json-details").filter({ hasText: "查看本题原始证据与来源坐标" });
          await expect(raw).not.toHaveAttribute("open");
          await raw.locator("summary").click();
          await expect(raw.locator("pre")).toContainText("knowledge_compare");
          assert(await raw.locator("pre").evaluate(element => element.scrollWidth <= element.clientWidth + 1));
          await raw.getByRole("button", { name: "复制 JSON" }).click();
          await expect(raw.getByRole("status")).toContainText("已复制原始 JSON");
          assert.deepEqual(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())), detail.snapshot.suite.cases[0].receipts);
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    } finally { await browser.close(); }
    assert.equal((await options.admin.query("select count(*)::int as n from agent_skill_replay_review where replay_id=$1", [stored.id])).rows[0].n, 0);
    return { candidatePage: true, persistedReplay: true, readOnlySourceRevalidated: true,
      receiptCopiedFromApi: true, anonymousDenied: true, defaultCollapsed: true,
      viewports: ["390x760", "1366x900"], noHorizontalOverflow: true,
      reviewsWritten: 0, modelCalls: 0, productionWrites: 0 };
  } finally { await getPool().end(); }
}
