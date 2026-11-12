import { expect, test } from "@playwright/test";

import { installGlobalAuthFixture } from "./fixtures/global-auth";

test.beforeEach(async ({ page }) => {
  await installGlobalAuthFixture(page);
});

test("canonical real transport disables unsupported selections before network", async ({ page }) => {
  let conversationRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/agent-api/conversations")) conversationRequests += 1;
  });

  await page.goto("/chat?mode=daily&backend=real");
  await expect(page.getByRole("button", { name: "知识库" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Skill" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "MCP" })).toBeDisabled();
  await expect(page.getByText("当前持久会话暂未支持能力组合")).toBeVisible();
  await expect(page.getByRole("button", { name: "继续生成" })).toHaveCount(0);
  expect(conversationRequests).toBe(0);
});
