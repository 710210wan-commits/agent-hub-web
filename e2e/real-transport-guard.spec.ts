import { expect, test } from "@playwright/test";

import { installGlobalAuthFixture } from "./fixtures/global-auth";

test.beforeEach(async ({ page }) => {
  await installGlobalAuthFixture(page);
});

test("canonical real transport loads unavailable catalog without creating a Turn before send", async ({ page }) => {
  let conversationRequests = 0;
  let catalogRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/agent-api/conversations")) conversationRequests += 1;
    if (request.url().includes("/agent-api/api/conversation-capabilities")) catalogRequests += 1;
  });

  await page.goto("/chat?mode=1&backend=real");
  await expect(page.getByRole("button", { name: "知识库" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Skill" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "MCP" })).toBeDisabled();
  await expect(page.getByText("知识库：暂不可用")).toBeVisible();
  await expect(page.getByText("Skill：暂不可用")).toBeVisible();
  await expect(page.getByText("MCP：暂不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: "继续生成" })).toHaveCount(0);
  expect(conversationRequests).toBe(0);
  // Development hydration/auth generations may abort and reload the catalog.
  expect(catalogRequests).toBeGreaterThan(0);
});
