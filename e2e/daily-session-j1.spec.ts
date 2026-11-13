import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const FIXTURE_ORIGIN = "http://127.0.0.1:3203";

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${FIXTURE_ORIGIN}/__reset`);
  expect(response.ok()).toBe(true);
});

test("anonymous 登录一次后，Daily、History、KB 共用全局身份", async ({ page }) => {
  await page.goto("/chat?mode=daily");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await login(page, "alice");
  await expect(page.getByRole("textbox", { name: "消息" })).toBeVisible();

  await page.goto("/history?mode=daily");
  await expect(page.getByText("Alice 历史会话")).toBeVisible();
  await expect(page.getByRole("heading", { name: "登录" })).toHaveCount(0);

  await page.goto("/knowledge");
  await expect(page.getByText("Alice 私有知识库")).toBeVisible();
  await expect(page.getByRole("heading", { name: "登录" })).toHaveCount(0);
});

test("首轮写 URL、活动与最终正文；第二轮、刷新、历史跳转保持同一会话", async ({
  page,
  request,
}) => {
  await loginFrom(page, "alice", "/chat?mode=daily");
  const id = await submit(page, "第一轮问题");
  await expect(page.getByText("正在准备…")).toBeVisible();

  await control(request, { action: "advance", conversationId: id, phase: "started" });
  await expect(page.getByText("正在处理…")).toBeVisible();
  await control(request, { action: "advance", conversationId: id, phase: "tool" });
  await expect(page.getByText("正在使用工具…")).toBeVisible();
  await expect(page.getByText(/SECRET_TOOL/)).toHaveCount(0);
  await control(request, {
    action: "advance",
    conversationId: id,
    phase: "complete",
    answer: "第一轮最终正文",
  });
  await expect(page.getByText("第一轮最终正文")).toBeVisible();

  await submit(page, "第二轮问题", id);
  await expect(page.getByText("正在准备…")).toBeVisible();
  await expect
    .poll(async () => {
      const state = await fixtureState(request);
      const conversation = state.conversations.find((item) => item.conversationId === id);
      return [conversation?.turnCount, conversation?.streamCount];
    })
    .toEqual([2, 1]);
  await control(request, {
    action: "advance",
    conversationId: id,
    phase: "complete",
    answer: "第二轮最终正文",
  });
  await expect
    .poll(async () => {
      const state = await fixtureState(request);
      const conversation = state.conversations.find((item) => item.conversationId === id);
      return [conversation?.messageCount, conversation?.streamCount];
    })
    .toEqual([4, 1]);
  await expect(page.getByText("第二轮最终正文")).toBeVisible();

  await page.reload();
  await expect(page.getByText("第一轮最终正文")).toBeVisible();
  await expect(page.getByText("第二轮最终正文")).toBeVisible();
  await page.goto("/history?mode=daily");
  await page.getByRole("link", { name: /第一轮问题/ }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${id}`));
  await expect(page.getByText("第二轮最终正文")).toBeVisible();
});

test("运行中 cancel 进入 cancelling/interrupted，不伪造 assistant 正文", async ({
  page,
  request,
}) => {
  await loginFrom(page, "alice", "/chat?mode=daily");
  const id = await submit(page, "需要停止的问题");
  await control(request, { action: "advance", conversationId: id, phase: "started" });
  await expect(page.getByText("正在处理…")).toBeVisible();
  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText("正在停止…")).toBeVisible();
  await expect(page.getByText("生成已停止")).toBeVisible();
  await expect
    .poll(async () => {
      const fixture = await fixtureState(request);
      return fixture.conversations.find((item) => item.conversationId === id)
        ?.activeTurnStatus;
    })
    .toBe("interrupted");
  await expect(page.locator("article.message-assistant")).toHaveCount(0);
});

test("SSE 断开后手动重连，从 cursor 恢复且不重复执行", async ({ page, request }) => {
  await loginFrom(page, "alice", "/chat?mode=daily");
  const id = await submit(page, "断线恢复问题");
  await control(request, { action: "advance", conversationId: id, phase: "started" });
  await control(request, { action: "disconnect", conversationId: id });
  await expect(page.getByText("连接已中断")).toBeVisible();

  await control(request, {
    action: "advance",
    conversationId: id,
    phase: "complete",
    answer: "重连后的最终正文",
  });
  await page.getByRole("button", { name: "重新连接" }).click();
  await expect(page.getByText("重连后的最终正文")).toBeVisible();

  const state = await fixtureState(request);
  const conversation = state.conversations.find((item) => item.conversationId === id);
  expect(conversation?.turnCount).toBe(1);
  expect(conversation?.messageCount).toBe(2);
  expect(
    state.calls.filter((call) => call.path.includes(`/${id}/stream`)).length,
  ).toBeGreaterThanOrEqual(2);
});

test("受保护页面 401 回到全局登录，旧用户数据跨页面消失", async ({ page, request }) => {
  await loginFrom(page, "alice", "/history?mode=daily");
  await expect(page.getByText("Alice 历史会话")).toBeVisible();
  await page.goto("/knowledge");
  await expect(page.getByText("Alice 私有知识库")).toBeVisible();

  await control(request, { action: "next-kb-status", status: 401 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page.getByText("Alice 私有知识库")).toHaveCount(0);
  await page.goto("/history?mode=daily");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await expect(page.getByText("Alice 历史会话")).toHaveCount(0);
});

test("KB 403 只显示 Origin 错误，不退出全局身份", async ({ page, request }) => {
  await loginFrom(page, "alice", "/knowledge");
  await expect(page.getByText("Alice 私有知识库")).toBeVisible();
  await control(request, { action: "next-kb-status", status: 403 });
  await page.reload();
  await expect(
    page.getByText("请求来源校验失败，请联系管理员检查部署配置"),
  ).toBeVisible();
  await page.goto("/history?mode=daily");
  await expect(page.getByText("Alice 历史会话")).toBeVisible();
});

test("退出 A 后登录 B，A 会话、pending 与 KB 数据均不可见", async ({ page }) => {
  await loginFrom(page, "alice", "/chat?mode=daily");
  const aliceConversation = await submit(page, "Alice 未完成问题");
  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await login(page, "bob");

  await expect(page.getByText("Alice 未完成问题")).toHaveCount(0);
  await page.goto("/history?mode=daily");
  await expect(page.getByText("Bob 历史会话")).toBeVisible();
  await expect(page.getByText("Alice 历史会话")).toHaveCount(0);
  await page.goto(`/chat?mode=daily&conversation=${aliceConversation}`);
  await expect(
    page.getByText("会话不存在、已删除或不属于当前用户"),
  ).toBeVisible();
  await page.goto("/knowledge");
  await expect(page.getByText("Bob 私有知识库")).toBeVisible();
  await expect(page.getByText("Alice 私有知识库")).toHaveCount(0);
});

test("demo 可访问壳页，但 Daily/KB 仅提示且不发受保护请求", async ({ page, request }) => {
  await page.goto("/chat?mode=daily");
  await page.getByRole("button", { name: "暂不登录，不使用知识库" }).click();
  await expect(
    page.getByRole("heading", { name: "完整登录后使用决策会话" }),
  ).toBeVisible();
  await page.goto("/knowledge");
  await expect(page.getByRole("heading", { name: "登录后使用知识库" })).toBeVisible();

  const state = await fixtureState(request);
  expect(state.calls.filter((call) => call.protected).length).toBe(0);
});

async function loginFrom(page: Page, user: "alice" | "bob", path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await login(page, user);
}

async function login(page: Page, user: "alice" | "bob") {
  await page.getByRole("textbox", { name: "用户名" }).fill(user);
  await page.getByLabel("密码").fill("test-only-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByText(user === "alice" ? "用户 A" : "用户 B", { exact: true }),
  ).toBeVisible();
}

async function submit(page: Page, text: string, expectedId?: string): Promise<string> {
  await page.getByRole("textbox", { name: "消息" }).fill(text);
  await page.getByRole("button", { name: "发送" }).click();
  if (!expectedId) await expect(page).toHaveURL(/conversation=[0-9a-f-]+/);
  const id = new URL(page.url()).searchParams.get("conversation");
  expect(id).toBe(expectedId ?? id);
  expect(id).toBeTruthy();
  return id!;
}

async function control(request: APIRequestContext, data: Record<string, unknown>) {
  const response = await request.post(`${FIXTURE_ORIGIN}/__control`, { data });
  expect(response.ok()).toBe(true);
}

interface FixtureState {
  calls: Array<{ path: string; protected: boolean }>;
  conversations: Array<{
    conversationId: string;
    turnCount: number;
    messageCount: number;
    streamCount: number;
    activeTurnStatus: string | null;
  }>;
}

async function fixtureState(request: APIRequestContext): Promise<FixtureState> {
  const response = await request.get(`${FIXTURE_ORIGIN}/__state`);
  expect(response.ok()).toBe(true);
  return response.json();
}
