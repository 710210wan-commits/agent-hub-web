import { expect, test } from "@playwright/test";

const routes = [
  ["/chat", "今天要处理什么工作？"],
  ["/history", "历史对话"],
  ["/gis", "GIS 工作台"],
  ["/knowledge", "知识库"],
  ["/skills", "Skill"],
  ["/mcp", "MCP"],
  ["/settings", "设置"],
] as const;

test("all shell routes render and preserve work mode", async ({ page }) => {
  for (const [route, visibleText] of routes) {
    await page.goto(`${route}?mode=work`);
    await expect(page.getByText(visibleText, { exact: true }).first()).toBeVisible();
    for (const link of await page.getByRole("navigation", { name: "主导航" }).getByRole("link").all()) {
      await expect(link).toHaveAttribute("href", /mode=work/);
    }
  }

  await page.getByRole("button", { name: "日常" }).click();
  await expect(page).toHaveURL(/mode=daily/);
});

test("resource details and settings remain explicit placeholders", async ({ page }) => {
  await page.goto("/knowledge?mode=daily");
  await page.screenshot({ path: "e2e/screenshots/resource-template.png" });
  await page.getByRole("link", { name: /项目资料库/ }).click();
  await expect(page.getByText("详情能力待接入")).toBeVisible();
  await expect(page.getByRole("link", { name: "返回知识库" })).toHaveAttribute("href", "/knowledge?mode=daily");

  await page.goto("/settings?mode=daily");
  await expect(page.getByText("模型配置待接入")).toBeVisible();
  await page.getByRole("tab", { name: "API" }).click();
  await expect(page.getByText("API 配置待接入")).toBeVisible();
});

test("daily, work and explicit new chats keep independent local contexts", async ({ page }) => {
  await page.goto("/chat?mode=daily&scenario=completed&delay=50");
  await page.getByRole("textbox", { name: "消息" }).fill("日常上下文");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("综合现有资料，本周需重点关注三类风险。")).toBeVisible();

  await page.getByRole("button", { name: "办公" }).click();
  await expect(page.getByRole("heading", { name: "今天要处理什么工作？" })).toBeVisible();
  await expect(page.getByText("日常上下文")).toHaveCount(0);

  await page.getByRole("textbox", { name: "消息" }).fill("办公上下文");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("办公上下文")).toBeVisible();
  await page.getByRole("link", { name: "新对话" }).click();
  await expect(page.getByRole("heading", { name: "今天要处理什么工作？" })).toBeVisible();
  await expect(page.getByText("办公上下文")).toHaveCount(0);
});
