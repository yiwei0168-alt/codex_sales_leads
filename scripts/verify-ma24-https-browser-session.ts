import nextEnv from "@next/env";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { chromium, request as playwrightRequest } from "@playwright/test";
import { Pool } from "pg";
import { databaseConnectionString, databaseSslConfiguration } from "../src/lib/rag/database-ssl";
import { hashPassword } from "../src/lib/auth/password";

nextEnv.loadEnvConfig(process.cwd());

const upstream = new URL(process.env.MA24_HTTPS_PROBE_UPSTREAM ?? "");
if (upstream.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstream.hostname)) {
  throw new Error("HTTPS probe upstream must be loopback HTTP");
}
const oldWeb = process.env.MA24_HTTPS_PROBE_OLD_WEB ? new URL(process.env.MA24_HTTPS_PROBE_OLD_WEB) : undefined;
if (oldWeb && (oldWeb.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(oldWeb.hostname))) {
  throw new Error("Old Web compatibility probe must target loopback HTTP");
}
const keyPath = process.env.MA24_HTTPS_PROBE_KEY;
const certPath = process.env.MA24_HTTPS_PROBE_CERT;
if (!keyPath || !certPath) throw new Error("HTTPS probe certificate and key paths are required");
const appUrl = process.env.DATABASE_URL;
const migrationUrl = process.env.DATABASE_MIGRATION_URL;
if (!appUrl || !migrationUrl) throw new Error("Both database connections are required");
const appDb = new URL(appUrl), migrationDb = new URL(migrationUrl);
if (appDb.hostname !== migrationDb.hostname || (appDb.port || "5432") !== (migrationDb.port || "5432") || appDb.pathname !== migrationDb.pathname) {
  throw new Error("Fixture database mismatch");
}

const admin = new Pool({ connectionString: databaseConnectionString(migrationUrl), ssl: databaseSslConfiguration(migrationUrl) });
const userId = randomUUID();
const workspaceId = randomUUID();
const email = `ma24-https-${userId}@fixture.invalid`;
const password = randomBytes(32).toString("base64url");
const companyName = `MA24 pilot fixture ${userId}`;
const companyDomain = `ma24-pilot-${userId}.invalid`;
let created = false;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const proxy = createServer({ key: await readFile(keyPath), cert: await readFile(certPath) }, (request, response) => {
  const forwarded = httpRequest({
    hostname: upstream.hostname, port: upstream.port, path: request.url,
    method: request.method, headers: { ...request.headers, host: upstream.host, "x-forwarded-proto": "https" },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  forwarded.on("error", (error) => { response.writeHead(502); response.end(error.message); });
  request.pipe(forwarded);
});

try {
  const setup = await admin.connect();
  try {
    await setup.query("begin");
    await setup.query(
      "insert into app_user(id,email,display_name,password_hash,role,status) values($1,$2,'HTTPS browser fixture',$3,'member','active')",
      [userId, email, hashPassword(password)],
    );
    await setup.query(
      "insert into market_workspace(id,owner_id,slug,name,market,country_code,objective) values($1,$2,'global-sales','HTTPS browser fixture','Global','WW','Synthetic pilot acceptance')",
      [workspaceId, userId],
    );
    await setup.query("commit");
    created = true;
  } catch (error) {
    await setup.query("rollback");
    throw error;
  } finally { setup.release(); }
  await new Promise<void>((resolve, reject) => {
    proxy.once("error", reject);
    proxy.listen(0, "127.0.0.1", resolve);
  });
  const address = proxy.address();
  if (!address || typeof address === "string") throw new Error("HTTPS proxy address unavailable");
  const base = `https://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const landing = await page.goto(base, { waitUntil: "domcontentloaded" });
  assert.equal(landing?.status(), 200);
  await page.getByRole("heading", { name: "登录销售线索工作台" }).waitFor();
  const before = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  assert.equal(before.authenticated, false);
  const anonymousTasks = await page.evaluate(async () => (await fetch("/api/tasks")).status);
  assert.equal(anonymousTasks, 401);
  await page.getByLabel("登录邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("navigation", { name: "主导航" }).waitFor();
  const cookies = await context.cookies(base);
  const sessionCookie = cookies.find((cookie) => cookie.name === "network_copilot_session");
  assert.ok(sessionCookie);
  assert.equal(sessionCookie.secure, true);
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.sameSite, "Lax");
  const active = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  assert.equal(active.authenticated, true);
  assert.equal(active.user?.role, "member");
  const tasks = await page.evaluate(async () => {
    const response = await fetch("/api/tasks");
    return { status: response.status, body: await response.json() };
  });
  assert.equal(tasks.status, 200);
  assert.ok(Array.isArray(tasks.body.items));
  assert.equal(tasks.body.items.length, 0);
  await page.getByRole("button", { name: "市场与线索" }).click();
  await page.getByRole("heading", { name: "市场与线索" }).waitFor();
  await page.getByRole("button", { name: "销售线索" }).click();
  await page.getByRole("heading", { name: "市场与线索" }).waitFor();
  const added = await page.evaluate(async ({ companyName, companyDomain }) => {
    const response = await fetch("/api/workspaces/current/companies", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: companyName, country: "DE", website: `https://${companyDomain}` }),
    });
    return { status: response.status, body: await response.json() };
  }, { companyName, companyDomain });
  assert.equal(added.status, 200);
  assert.equal(added.body.duplicate, false);
  const workspaceRead = await page.evaluate(async () => {
    const response = await fetch("/api/workspaces/current", { cache: "no-store" });
    return { status: response.status, body: await response.json() };
  });
  assert.equal(workspaceRead.status, 200);
  assert.ok(workspaceRead.body.companies.some((company: { displayName: string }) => company.displayName === companyName));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "市场与线索" }).click();
  await page.getByRole("button", { name: "销售线索" }).click();
  await page.locator(".results-panel .company-cell").filter({ hasText: companyName }).waitFor();
  if (oldWeb) {
    const oldClient = await playwrightRequest.newContext({ baseURL: oldWeb.href,
      extraHTTPHeaders: { cookie: `network_copilot_session=${sessionCookie.value}` } });
    try {
      const oldRead = await oldClient.get("/api/workspaces/current");
      assert.equal(oldRead.status(), 200);
      const oldWorkspace = await oldRead.json();
      assert.ok(oldWorkspace.companies.some((company: { displayName: string }) => company.displayName === companyName));
    } finally { await oldClient.dispose(); }
  }
  await page.getByRole("button", { name: "帮助" }).click();
  await page.getByRole("button", { name: "任务记录" }).click();
  await page.getByRole("heading", { name: "任务记录" }).waitFor();
  assert.deepEqual(pageErrors, []);
  await page.getByRole("button", { name: "账户与设置" }).click();
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.getByRole("heading", { name: "登录销售线索工作台" }).waitFor();
  const after = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
  assert.equal(after.authenticated, false);
  const paid = await admin.query<{ count: string }>("select count(*)::text as count from paid_call_reservation where user_id=$1", [userId]);
  assert.equal(paid.rows[0].count, "0");
  console.log(JSON.stringify({ httpsBrowserSession: "passed", browser: "chrome", secureCookie: true,
    httpOnlyCookie: true, sameSiteLax: true, loginFormAndLogoutUi: true,
    taskReadAndNavigation: true, leadNavigation: true, manualCompanyWriteReadUi: true,
    oldWebCompanyRead: Boolean(oldWeb), actualPaidCalls: 0 }));
} finally {
  await browser?.close();
  await new Promise<void>((resolve) => proxy.close(() => resolve()));
  if (created) {
    const cleanup = await admin.connect();
    try {
      await cleanup.query("begin");
      const owner = await cleanup.query(
        "select id from app_user where id=$1 and email=$2 and display_name='HTTPS browser fixture' for update", [userId, email],
      );
      assert.equal(owner.rowCount, 1);
      const paid = await cleanup.query<{ count: string }>(
        "select count(*)::text as count from paid_call_reservation where user_id=$1", [userId],
      );
      assert.equal(paid.rows[0].count, "0");
      await cleanup.query("delete from market_workspace where id=$1 and owner_id=$2", [workspaceId, userId]);
      await cleanup.query(
        "delete from sales_company where domain=$1 and canonical_name=$2 and source_kind='user-added' and not exists(select 1 from workspace_company where company_id=sales_company.id)",
        [companyDomain, companyName],
      );
      const removed = await cleanup.query(
        "delete from app_user where id=$1 and email=$2 and display_name='HTTPS browser fixture' returning id", [userId, email],
      );
      assert.equal(removed.rowCount, 1);
      await cleanup.query("commit");
      console.log("Synthetic HTTPS browser user, workspace and company removed.");
    } catch (error) {
      await cleanup.query("rollback");
      throw error;
    } finally { cleanup.release(); }
  }
  await admin.end();
}
