import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import type { Client } from "pg";

export async function verifyMa24AgentLibraryClone(options: {
  admin: Client; base: string; cookie: string; userId: string;
}): Promise<unknown> {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    for (const viewport of [{ width: 390, height: 760 }, { width: 1366, height: 900 }]) {
      const context = await browser.newContext({ viewport });
      const [name, value] = options.cookie.split("=");
      assert(name && value);
      await context.addCookies([{ name, value, url: options.base }]);
      try {
        const page = await context.newPage();
        const pageErrors: string[] = [];
        page.on("pageerror", error => pageErrors.push(error.message));
        await page.goto(options.base);
        if (viewport.width < 700) await page.getByRole("button", { name: "打开导航菜单" }).click();
        await page.getByRole("button", { name: "账户与设置" }).click();
        await page.getByRole("button", { name: "账户信息与 Agent 设置" }).click();
        const library = page.locator(".agent-library");
        await library.getByText("Skill、记忆与定时任务", { exact: true }).click();
        await expect(library.getByRole("button", { name: "保存方法" })).toBeEnabled();
        const skillName = `MA24 F11 synthetic draft ${viewport.width}`;
        await library.getByRole("textbox", { name: "方法名称" }).fill(skillName);
        await library.getByRole("textbox", { name: "使用说明" }).fill("Use only the supplied account facts. Never send mail.");
        await library.getByRole("button", { name: "定时任务", exact: true }).click();
        await library.getByRole("textbox", { name: "任务名称" }).fill(`Unsubmitted schedule ${viewport.width}`);
        await library.getByRole("textbox", { name: "执行要求" }).fill("Read account tasks only");
        await page.route("**/api/assistant/memory", route =>
          route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic memory read interruption" }) }),
        { times: 1 });
        await library.getByRole("button", { name: "刷新", exact: true }).click();
        await expect(library.getByRole("button", { name: "创建周期任务" })).toBeEnabled();
        await expect(library.getByRole("textbox", { name: "任务名称" })).toHaveValue(`Unsubmitted schedule ${viewport.width}`);
        await library.getByRole("button", { name: "记忆", exact: true }).click();
        await expect(library.getByRole("alert")).toContainText("读取失败，请刷新重试");
        await expect(library.getByText("尚无统一记忆", { exact: false })).toHaveCount(0);
        await library.getByRole("button", { name: "Skill", exact: true }).click();
        await expect(library.getByRole("textbox", { name: "方法名称" })).toHaveValue(skillName);
        await expect(library.getByRole("button", { name: "保存方法" })).toBeEnabled();
        await library.getByRole("button", { name: "刷新", exact: true }).click();
        await library.getByRole("button", { name: "记忆", exact: true }).click();
        await expect(library.getByRole("alert")).toHaveCount(0);
        await library.getByRole("button", { name: "Skill", exact: true }).click();
        const post = page.waitForResponse(value => value.url().endsWith("/api/assistant/skills") && value.request().method() === "POST");
        await library.getByRole("button", { name: "保存方法" }).click();
        assert.equal((await post).status(), 200);
        await expect(library.getByRole("status").filter({ hasText: "未启用草案" })).toBeVisible();
        await expect(library.getByText(skillName, { exact: true })).toBeVisible();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        assert.deepEqual(pageErrors, []);
      } finally { await context.close(); }
    }
    const saved = (await options.admin.query<{ name: string; enabled: boolean; scope: string }>(
      "select name,enabled,scope from agent_skill where owner_id=$1 and name like 'MA24 F11 synthetic draft %' order by name", [options.userId],
    )).rows;
    assert.deepEqual(saved.map(item => item.name), ["MA24 F11 synthetic draft 1366", "MA24 F11 synthetic draft 390"]);
    assert(saved.every(item => !item.enabled && item.scope === "account"));
    assert.equal((await options.admin.query("select count(*)::int as n from agent_schedule where user_id=$1", [options.userId])).rows[0].n, 0);
    return { candidatePage: true, actualReadApis: ["skills", "memory", "schedules"],
      oneShotMemory503: true, otherSectionsIndependent: true, draftsRetained: true,
      actualSkillPost: 2, persistedDisabledAccountDrafts: 2, schedulesCreated: 0,
      viewports: ["390x760", "1366x900"], noHorizontalOverflow: true, pageErrors: 0,
      modelCalls: 0, productionWrites: 0 };
  } finally { await browser.close(); }
}
