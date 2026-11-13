import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
const origin = "http://127.0.0.1:3203";
test.beforeEach(async ({ request }) => { expect((await request.post(`${origin}/__reset`)).ok()).toBe(true); });
async function control(request: APIRequestContext, data: Record<string, unknown>) {
  expect((await request.post(`${origin}/__control`, { data })).ok()).toBe(true);
}
async function state(request: APIRequestContext) { return (await request.get(`${origin}/__state`)).json(); }
async function login(page: Page) {
  await page.goto("/chat?mode=1");
  await page.getByRole("textbox", { name: "用户名" }).fill("alice");
  await page.getByLabel("密码").fill("test-only-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
}
async function choose(page: Page) {
  await expect(page.getByRole("button", { name: /^知识库/ })).toBeEnabled();
  await page.getByRole("button", { name: /^知识库/ }).click();
  await page.getByRole("checkbox", { name: "Alice 可选知识库" }).check();
  await page.getByRole("button", { name: /^知识库/ }).click();
  await page.getByRole("button", { name: /^Skill/ }).click();
  await page.getByRole("checkbox", { name: "飞机查询" }).check();
  await page.getByRole("button", { name: /^Skill/ }).click();
}
async function send(page: Page, text: string) {
  await page.getByRole("textbox", { name: "消息" }).fill(text);
  await page.getByRole("button", { name: "发送" }).click();
}
async function conversationId(page: Page) {
  await expect(page).toHaveURL(/conversation=[0-9a-f-]+/);
  return new URL(page.url()).searchParams.get("conversation")!;
}
const selected = { knowledgeBaseIds: ["kb-alice"], skillIds: ["built-in:aircraft-region-query"], mcpServerIds: [] };

test("catalog → selection → activity → final → history; edits only affect next Turn", async ({ page, request }) => {
  await login(page); await choose(page); await send(page, "能力验收问题");
  const id = await conversationId(page);
  await expect(page.getByText("正在准备…")).toBeVisible();
  await page.getByRole("button", { name: /^知识库/ }).click();
  await page.getByRole("checkbox", { name: "Alice 可选知识库" }).uncheck();
  await page.getByRole("button", { name: /^知识库/ }).click();
  await control(request, { action: "advance", conversationId: id, phase: "tool" });
  await expect(page.getByText("正在使用工具…")).toBeVisible();
  await expect(page.getByText(/SECRET_TOOL/)).toHaveCount(0);
  await control(request, { action: "advance", conversationId: id, phase: "complete", answer: "能力验收最终正文" });
  await expect(page.getByText("能力验收最终正文")).toBeVisible();
  await send(page, "第二轮能力");
  await expect.poll(async () => (await state(request)).submissions.length).toBe(2);
  const submissions = (await state(request)).submissions;
  expect(submissions[0].body.capabilitySelection).toEqual(selected);
  expect(submissions[1].body.capabilitySelection).toEqual({ ...selected, knowledgeBaseIds: [] });
  await control(request, { action: "advance", conversationId: id, phase: "complete" });
  await page.reload();
  await expect(page.getByText("知识库 · kb-alice", { exact: true })).toBeVisible();
  await page.goto("/history?mode=1");
  await page.getByRole("link", { name: /能力验收问题/ }).click();
  await expect(page.getByText("能力验收最终正文")).toBeVisible();
  expect(await page.getByLabel("本轮能力").first().locator("input,button").count()).toBe(0);
});

test("unknown acceptance retry retains request and snapshot and creates one Turn", async ({ page, request }) => {
  await login(page); await choose(page);
  await control(request, { action: "unknown-next-submit" });
  await send(page, "未知结果问题");
  await expect(page.getByRole("button", { name: "重试发送" })).toBeVisible();
  await page.getByRole("button", { name: /^知识库/ }).click();
  await page.getByRole("checkbox", { name: "Alice 可选知识库" }).uncheck();
  await page.getByRole("button", { name: "重试发送" }).click();
  const id = await conversationId(page);
  const current = await state(request);
  expect(current.submissions).toHaveLength(2);
  expect(current.submissions[0].body).toEqual(current.submissions[1].body);
  expect(current.submissions[0].body.capabilitySelection).toEqual(selected);
  expect(current.conversations.find((item: { conversationId: string }) => item.conversationId === id).turnCount).toBe(1);
});

test("empty selection is explicit and revoked capability ends safely", async ({ page, request }) => {
  await login(page); await send(page, "空选择问题");
  const id = await conversationId(page);
  expect((await state(request)).submissions[0].body.capabilitySelection).toEqual({ knowledgeBaseIds: [], skillIds: [], mcpServerIds: [] });
  await control(request, { action: "advance", conversationId: id, phase: "complete" });
  await choose(page); await send(page, "资源撤权问题");
  await control(request, { action: "revoke", conversationId: id });
  await expect(page.getByText("任务执行失败")).toBeVisible();
  const current = await state(request);
  expect(current.conversations.find((item: { conversationId: string }) => item.conversationId === id).errorCode).toBe("CAPABILITY_UNAVAILABLE");
  await expect(page.locator("article.message-assistant")).toHaveCount(1);
});

test("lost network receipt offers retry with the original committed Turn", async ({ page, request }) => {
  await login(page); await choose(page);
  let loseReceipt = true;
  await page.route("**/agent-api/conversations/*/turns", async route => {
    if (loseReceipt) { loseReceipt = false; await route.fetch(); await route.abort("failed"); }
    else await route.continue();
  });
  await send(page, "丢失回执问题");
  await expect(page.getByRole("button", { name: "重试发送" })).toBeVisible();
  await page.getByRole("button", { name: "重试发送" }).click();
  const id = await conversationId(page), current = await state(request);
  expect(current.submissions[0].body).toEqual(current.submissions[1].body);
  expect(current.conversations.find((item: { conversationId: string }) => item.conversationId === id).turnCount).toBe(1);
});

test("catalog 403 stays local and partial outage keeps KB selectable", async ({ page, request }) => {
  await control(request, { action: "catalog", status: 403 });
  await login(page);
  await expect(page.getByText("知识库：暂无权限访问能力目录")).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  await control(request, { action: "catalog", status: null, skillUnavailable: true });
  await page.reload();
  await expect(page.getByRole("button", { name: /^知识库/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Skill/ })).toBeDisabled();
  await expect(page.getByText("Skill：暂不可用")).toBeVisible();
});

test("catalog 401 triggers global logout", async ({ page, request }) => {
  await login(page);
  await expect(page.getByRole("button", { name: /^知识库/ })).toBeEnabled();
  await control(request, { action: "catalog", status: 401 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "登录", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toHaveCount(0);
});

const mcpServerId = "10000000-0000-4000-8000-000000000010";
async function chooseMcp(page: Page) {
  await expect(page.getByRole("button", { name: /^MCP/ })).toBeEnabled();
  await page.getByRole("button", { name: /^MCP/ }).click();
  await page.getByRole("checkbox", { name: "只读船舶服务" }).check();
  await page.getByRole("button", { name: /^MCP/ }).click();
}

test("MCP IDs-only selection → activity → final → persisted history without internal payloads", async ({ page, request }) => {
  await control(request, { action: "catalog", mcpAvailable: true });
  await login(page); await chooseMcp(page); await send(page, "MCP 只读验收");
  const id = await conversationId(page);
  const body = (await state(request)).submissions[0].body;
  expect(body).toEqual({ clientRequestId: expect.any(String), input: { kind: "text", text: "MCP 只读验收" },
    capabilitySelection: { knowledgeBaseIds: [], skillIds: [], mcpServerIds: [mcpServerId] } });
  await control(request, { action: "advance", conversationId: id, phase: "tool" });
  await expect(page.getByText("正在使用工具…")).toBeVisible();
  await expect(page.getByText(/SECRET_TOOL|RAW_MCP|PRIVATE_UPSTREAM/)).toHaveCount(0);
  await control(request, { action: "advance", conversationId: id, phase: "complete", answer: "MCP 查询最终正文" });
  await expect(page.getByText("MCP 查询最终正文")).toBeVisible();
  await page.reload();
  await expect(page.getByText(`MCP · ${mcpServerId}`, { exact: true })).toBeVisible();
  expect(await page.getByLabel("本轮能力").locator("input,button").count()).toBe(0);
  const exposed = await page.evaluate(async conversation => {
    const paths = [`/agent-api/conversations/${conversation}/snapshot`, `/agent-api/conversations/${conversation}/events?afterSeq=0`];
    return JSON.stringify(await Promise.all(paths.map(async path => (await fetch(path)).json())));
  }, id);
  expect(exposed).not.toMatch(/RAW_MCP|PRIVATE_UPSTREAM|credentialRef|inputSchema|access_token|\bat fixture\b/);
  await page.goto("/history?mode=1");
  await page.getByRole("link", { name: /MCP 只读验收/ }).click();
  await expect(page.getByText("MCP 查询最终正文")).toBeVisible();
});

test("MCP unknown retry keeps original selection despite composer edits", async ({ page, request }) => {
  await control(request, { action: "catalog", mcpAvailable: true });
  await login(page); await chooseMcp(page);
  await control(request, { action: "unknown-next-submit" });
  await send(page, "MCP 未知回执");
  await expect(page.getByRole("button", { name: "重试发送" })).toBeVisible();
  await page.getByRole("button", { name: /^MCP/ }).click();
  await page.getByRole("checkbox", { name: "只读船舶服务" }).uncheck();
  await page.getByRole("button", { name: /^MCP/ }).click();
  await page.getByRole("button", { name: "重试发送" }).click();
  const id = await conversationId(page), current = await state(request);
  expect(current.submissions).toHaveLength(2);
  expect(current.submissions[0].body).toEqual(current.submissions[1].body);
  expect(current.submissions[0].body.capabilitySelection.mcpServerIds).toEqual([mcpServerId]);
  expect(current.conversations.find((item: { conversationId: string }) => item.conversationId === id).turnCount).toBe(1);
});

test("MCP terminal failure and catalog outage preserve login and KB/Skill-only next Turn", async ({ page, request }) => {
  await control(request, { action: "catalog", mcpAvailable: true });
  await login(page); await chooseMcp(page); await send(page, "MCP 故障验收");
  const id = await conversationId(page);
  await control(request, { action: "revoke", conversationId: id });
  await expect(page.getByText("任务执行失败")).toBeVisible();
  await expect(page.locator("article.message-assistant")).toHaveCount(0);
  await control(request, { action: "catalog", mcpUnavailable: true });
  await page.reload();
  await expect(page.getByRole("button", { name: /^MCP/ })).toBeDisabled();
  await expect(page.getByText("MCP：暂不可用")).toBeVisible();
  await expect(page.getByRole("button", { name: "退出登录" })).toBeVisible();
  await choose(page); await send(page, "KB Skill 故障隔离");
  await expect.poll(async () => (await state(request)).submissions.length).toBe(2);
  expect((await state(request)).submissions[1].body.capabilitySelection).toEqual(selected);
  await control(request, { action: "advance", conversationId: id, phase: "complete", answer: "其他能力仍可用" });
  await expect(page.getByText("其他能力仍可用")).toBeVisible();
  await expect(page.getByText(/RAW_MCP|PRIVATE_UPSTREAM/)).toHaveCount(0);
});
