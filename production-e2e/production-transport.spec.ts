import { expect, test } from "@playwright/test";

test("production build defaults to real transport and blocks unsupported selections", async ({ page }) => {
  let agentApiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/agent-api/")) agentApiRequests += 1;
  });

  await page.goto("/chat?mode=daily&backend=mock&scenario=completed");
  await page.getByRole("button", { name: "知识库" }).click();
  await page.getByText("项目资料库", { exact: true }).click();
  await page.getByRole("textbox", { name: "消息" }).fill("生产配置检查");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByText("当前后端尚未接入所选能力")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "消息" })).toHaveValue("生产配置检查");
  expect(agentApiRequests).toBe(0);
});
