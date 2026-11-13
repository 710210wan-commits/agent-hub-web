import { expect, test } from "@playwright/test";
import { installGlobalAuthFixture } from "./fixtures/global-auth";

test.beforeEach(async ({ page }) => {
  await installGlobalAuthFixture(page);
});

test("mock chat streams final text without fabricating selectable capabilities", async ({ page }) => {
  await page.goto("/chat?mode=1&scenario=completed&delay=600");
  await expect(page.getByRole("heading", { name: "今天想聊些什么？" })).toBeVisible();
  await expect(page.getByRole("button", { name: "附件（待接入）" })).toBeDisabled();
  await page.screenshot({ path: "e2e/screenshots/chat-empty.png" });

  for (const name of ["知识库", "Skill", "MCP"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByRole("checkbox")).toHaveCount(0);

  await page.getByRole("textbox", { name: "消息" }).fill("分析本周风险");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByTestId("activity-line")).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/chat-running.png" });
  await expect(page.getByText("综合现有资料，本周需重点关注三类风险。")).toBeVisible();
  await expect(page.getByRole("button", { name: "已完成 3 个步骤" })).toBeVisible();
  await expect(page.getByRole("button", { name: "知识库", exact: true })).toBeDisabled();
});

test("manual stop preserves partial text and offers mock continuation", async ({ page }) => {
  await page.goto("/chat?mode=1&scenario=completed&delay=800");
  await page.getByRole("textbox", { name: "消息" }).fill("生成一段回答");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("综合现有资料，")).toBeVisible();
  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText("综合现有资料，")).toBeVisible();
  await expect(page.getByText("生成已停止")).toBeVisible();
  await expect(page.getByRole("button", { name: "继续生成" })).toBeVisible();
  await page.getByRole("button", { name: "继续生成" }).click();
  await expect(page.getByText("综合现有资料，本周需重点关注三类风险。")).toBeVisible();
  await expect(page.getByText("综合现有资料，综合现有资料，")).toHaveCount(0);
});

test("mock disconnected scenario keeps text and shows truthful warning", async ({ page }) => {
  await page.goto("/chat?mode=1&scenario=disconnected");
  await page.getByRole("textbox", { name: "消息" }).fill("测试断流");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("已保留的部分正文。")).toBeVisible();
  await expect(page.getByText("连接已断开，服务端任务可能仍在运行")).toBeVisible();
});
