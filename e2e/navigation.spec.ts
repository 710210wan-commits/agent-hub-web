import { expect, test } from "@playwright/test";

import { installGlobalAuthFixture } from "./fixtures/global-auth";

test.beforeEach(async ({ page }) => {
  await installGlobalAuthFixture(page);
});

const routes = [
  ["/chat", "今天要处理什么工作？"],
  ["/history", "历史对话"],
  ["/knowledge", "知识库"],
  ["/skills", "Skill"],
  ["/mcp", "MCP"],
  ["/settings", "设置"],
] as const;

test("all shell routes render and preserve work mode", async ({ page }) => {
  for (const [route, visibleText] of routes) {
    await page.goto(`${route}?mode=2`);
    await expect(page.getByText(visibleText, { exact: true }).first()).toBeVisible();
    for (const link of await page.getByRole("navigation", { name: "主导航" }).getByRole("link").all()) {
      if ((await link.textContent())?.trim() === "GIS 工作台") {
        await expect(link).toHaveAttribute("href", "http://localhost:5000");
        await expect(link).toHaveAttribute("target", "_blank");
      } else {
        await expect(link).toHaveAttribute("href", /mode=2/);
      }
    }
  }

  await page.getByRole("button", { name: "决策" }).click();
  await expect(page).toHaveURL(/mode=1/);
});

test("GIS opens the legacy homepage in one new tab", async ({ page, context }) => {
  await context.route("http://localhost:5000/", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: "<main><h1>Legacy Cesium</h1></main>",
    });
  });
  await page.goto("/chat?mode=1");

  const legacyPagePromise = context.waitForEvent("page");
  await page.getByRole("link", { name: "GIS 工作台" }).click();
  const legacyPage = await legacyPagePromise;
  await legacyPage.waitForLoadState("domcontentloaded");

  await expect(legacyPage).toHaveURL("http://localhost:5000/");
  await expect(legacyPage.getByText("Legacy Cesium")).toBeVisible();
  expect(context.pages().filter((item) => item !== page)).toHaveLength(1);
  expect(await legacyPage.evaluate(() => window.opener === null)).toBe(true);
  await expect(page).toHaveURL(/\/chat\?mode=1/);
});

test("knowledge demo renders and settings remain explicit placeholders", async ({ page }) => {
  await page.goto("/knowledge?mode=1&demo=1");
  await page.screenshot({ path: "e2e/screenshots/resource-template.png" });
  await expect(page.getByRole("link", { name: /项目资料库/ })).toBeVisible();
  await expect(page.getByText(/当前为演示数据/)).toBeVisible();

  await page.goto("/settings?mode=1");
  await expect(page.getByText("模型配置待接入")).toBeVisible();
  await page.getByRole("tab", { name: "API" }).click();
  await expect(page.getByText("API 配置待接入")).toBeVisible();
});

test("daily chat remains usable when switching to the work agent", async ({ page }) => {
  await page.goto("/chat?mode=1&scenario=completed&delay=50");
  await page.getByRole("textbox", { name: "消息" }).fill("日常上下文");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("综合现有资料，本周需重点关注三类风险。")).toBeVisible();

  await page.getByRole("button", { name: "工作" }).click();
  await expect(page.getByRole("heading", { name: "今天要处理什么工作？" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "消息" })).toBeVisible();
});

test("legacy mode links normalize to numbers without losing deep-link state", async ({ page }) => {
  await page.goto("/chat?mode=daily&panel=open");
  await expect(page).toHaveURL(/mode=1&panel=open/);
  await expect(page.getByRole("button", { name: "决策", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.goto("/settings?mode=work&section=model");
  await expect(page).toHaveURL(/mode=2&section=model/);
  await expect(page.getByRole("button", { name: "工作", exact: true })).toHaveAttribute("aria-pressed", "true");
});
