import { expect, test } from "@playwright/test";
import { installGlobalAuthFixture } from "./fixtures/global-auth";

test("shared KB/MCP lists stay identical across conversation modes and preserve navigation context", async ({ page }) => {
  await installGlobalAuthFixture(page);
  const resources: string[] = [];
  await page.route("**/agent-api/api/kb/databases", async route => {
    resources.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { success: true, databases: [{ kb_id: "shared-kb", name: "共享知识库", description: "同一数据源", type: "milvus", supports_documents: true }] } });
  });
  await page.route("**/agent-api/api/mcp/v1/servers", async route => {
    resources.push(new URL(route.request().url()).pathname);
    await route.fulfill({ json: { ok: true, data: { items: [1, 2].map(label => ({ id: `shared-${label}`, displayName: `分类 ${label} 共享服务`, label, description: "共享管理", transport: "http", url: "https://example.test/mcp", enabled: false, allowedTools: [], readOnlyTools: [] })) } } });
  });
  for (const mode of ["1", "2"]) {
    for (const resource of ["knowledge", "mcp"]) {
      await page.goto(`/${resource}?mode=${mode}`);
      await expect(page.getByRole("button", { name: "决策", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "工作", exact: true })).toHaveCount(0);
      if (resource === "knowledge") await expect(page.getByText("共享知识库", { exact: true })).toBeVisible();
      else {
        await expect(page.getByRole("heading", { name: "分类 1 共享服务", exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "分类 2 共享服务", exact: true })).toBeVisible();
      }
      await expect(page.getByRole("link", { name: "新对话", exact: true })).toHaveAttribute("href", `/chat?mode=${mode}`);
    }
  }
  expect(new Set(resources)).toEqual(new Set(["/agent-api/api/kb/databases", "/agent-api/api/mcp/v1/servers"]));
});

test("anonymous login starts empty and cannot submit without credentials", async ({ page }) => {
  await page.route("**/agent-api/auth/xiaozhi-status", route => route.fulfill({ status: 401, json: { error: "Authentication required" } }));
  let attempts = 0;
  await page.route("**/agent-api/auth/login", async route => { attempts++; await route.fulfill({ status: 401, json: { error: "Authentication required" } }); });
  await page.goto("/chat?mode=1");
  await expect(page.getByRole("textbox", { name: "用户名" })).toHaveValue("");
  await expect(page.getByLabel("密码", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "请输入用户名和密码" })).toHaveText("请输入用户名和密码");
  expect(attempts).toBe(0);
});
