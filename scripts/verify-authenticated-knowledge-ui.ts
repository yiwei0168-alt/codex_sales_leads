// Historical direct-RAG acceptance for the retired synchronous knowledge UI.
// Current product checks use knowledge:verify-ui and assistant:verify-entry.
import nextEnv from "@next/env";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import { Pool } from "pg";

import { hashPassword } from "../src/lib/auth/password";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";

nextEnv.loadEnvConfig(process.cwd());
const base = new URL(process.env.UI_VERIFY_BASE_URL || "http://localhost:3000");
if (base.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Local UI only");
const migration = process.env.DATABASE_MIGRATION_URL;
if (!migration) throw new Error("DATABASE_MIGRATION_URL is required for isolated fixtures");
const pool = new Pool({ connectionString: databaseConnectionString(migration), ssl: databaseSslConfiguration(migration) });
const userId = randomUUID();
const workspaceId = randomUUID();
const email = `knowledge-ui-${userId}@example.invalid`;
const password = randomBytes(32).toString("base64url");
let created = false;
const checks: string[] = [];
let hotPathLatency: { samples: number; p50Ms: number; p95Ms: number; maxMs: number } | null = null;
await mkdir("tmp", { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await pool.query("begin");
  try {
    await pool.query("insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'Knowledge UI fixture',$3,'member','active')", [userId, email, hashPassword(password)]);
    await pool.query("insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','Knowledge UI fixture','Global','WW','Isolated knowledge verification')", [workspaceId, userId]);
    await pool.query("commit");
    created = true;
  } catch (error) { await pool.query("rollback"); throw error; }

  for (const viewport of [{ width: 1366, height: 900 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport });
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (["localhost", "127.0.0.1"].includes(url.hostname)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(base.href);
    await page.getByLabel("登录邮箱").fill(email);
    await page.getByLabel("密码", { exact: true }).fill(password);
    await page.getByRole("button", { name: "登录", exact: true }).click();
    await expect(page.getByRole("button", { name: "知识库 & RAG" })).toBeVisible();

    const documentResponse = await page.evaluate(async () => {
      const response = await fetch("/api/rag/query", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "请打开 GS1010PE 的 datasheet", filters: { collections: ["product"] } }) });
      return { status: response.status, body: await response.json() };
    });
    const factResponse = await page.evaluate(async () => {
      const response = await fetch("/api/rag/query", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: "GS1010PE 有几个 PoE 输出口？", filters: { collections: ["product"] } }) });
      return { status: response.status, body: await response.json() };
    });
    const responses = { document: documentResponse, fact: factResponse };
    if (responses.document.status !== 200 || responses.fact.status !== 200) console.error(JSON.stringify(responses));
    expect(responses.document.status).toBe(200);
    expect(responses.document.body).toMatchObject({ kind: "document-links", reasonCode: "ok" });
    expect(responses.document.body.documents.length).toBeGreaterThan(0);
    expect(responses.fact.status).toBe(200);
    expect(responses.fact.body).toMatchObject({ kind: "fact-answer", reasonCode: "ok" });
    expect(responses.fact.body.factCitations.length).toBeGreaterThan(0);

    if (viewport.width === 1366) {
      const assetUrl = new URL(responses.document.body.documents[0].url, base).href;
      expect((await context.request.get(assetUrl)).status()).toBe(200);
      expect((await context.request.get(new URL(`/api/knowledge/assets/${randomUUID()}`, base).href)).status()).toBe(404);
      const anonymousContext = await browser.newContext();
      expect((await anonymousContext.request.get(assetUrl)).status()).toBe(401);
      await anonymousContext.close();
      checks.push("asset-authorized-open-missing-404-anonymous-denied");
    }

    if (viewport.width === 1366) {
      const probes = [
        { question: "请打开 GS1010PE 的 datasheet", kind: "document-links" },
        { question: "请打开 LT700 的 datasheet", kind: "document-links" },
        { question: "请打开 WU650 的 datasheet", kind: "document-links" },
        { question: "请打开 RE1200 的 datasheet", kind: "document-links" },
        { question: "GS1010PE 有几个 PoE 输出口？", kind: "fact-answer" },
      ];
      const samples: number[] = [];
      for (let index = 0; index < 30; index += 1) {
        const probe = probes[index % probes.length];
        const result = await page.evaluate(async ({ question, kind }) => {
          const startedAt = performance.now();
          const response = await fetch("/api/rag/query", { method: "POST", headers: { "content-type": "application/json" },
            body: JSON.stringify({ question, filters: { collections: ["product"] } }) });
          const body = await response.json();
          return { question, status: response.status, kind: body.kind, expectedKind: kind,
            error: typeof body.error === "string" ? body.error : undefined, elapsedMs: performance.now() - startedAt };
        }, probe);
        expect(result, JSON.stringify(result)).toMatchObject({ status: 200, kind: result.expectedKind });
        samples.push(result.elapsedMs);
      }
      samples.sort((left, right) => left - right);
      hotPathLatency = { samples: samples.length, p50Ms: Number(samples[Math.ceil(samples.length * 0.5) - 1].toFixed(2)),
        p95Ms: Number(samples[Math.ceil(samples.length * 0.95) - 1].toFixed(2)), maxMs: Number(samples.at(-1)!.toFixed(2)) };
    }

    if (viewport.width < 600) await page.getByRole("button", { name: "打开导航菜单" }).click();
    await page.getByRole("button", { name: /知识库/ }).click();
    await page.locator("#rag-question").fill("请打开 GS1010PE 的 datasheet");
    await page.getByRole("button", { name: "运行知识工作流" }).evaluate((element) => (element as HTMLButtonElement).click());
    await expect(page.getByText("document-links", { exact: true })).toBeVisible();
    await expect(page.getByText(/^原始资料 ·/)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `tmp/knowledge-ui-${viewport.width}x${viewport.height}.png`, fullPage: true });
    checks.push(`${viewport.width}:document-fact-langgraph-sql-ui-refresh-contract`);
    await context.close();
  }
  const paid = await pool.query("select count(*)::int n from paid_call_reservation where user_id=$1", [userId]);
  expect(paid.rows[0].n).toBe(0);
  console.log(JSON.stringify({ authenticatedKnowledgeUi: "passed", checks, hotPathLatency,
    paidCalls: 0, externalNetwork: 0, fixtureOnly: true }));
} finally {
  await browser.close();
  if (created) {
    await pool.query("delete from product_operation_metric where user_id=$1", [userId]);
    await pool.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
    await pool.query("delete from app_user where id=$1 and email=$2", [userId, email]);
  }
  await pool.end();
}
