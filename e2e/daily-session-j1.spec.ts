import { expect, test, type Page, type Route } from "@playwright/test";

const IDS = {
  a1: "10000000-0000-4000-8000-000000000001",
  a2: "10000000-0000-4000-8000-000000000002",
  b1: "10000000-0000-4000-8000-000000000003",
  created: "10000000-0000-4000-8000-000000000004",
  turn: "20000000-0000-4000-8000-000000000001",
  request: "50000000-0000-4000-8000-000000000001",
} as const;

type UserKey = "alice" | "bob";

interface FakeConversation {
  conversationId: string;
  scenarioId: "daily";
  agentKey: "agent-loop";
  title: string;
  status: "open";
  archivedAt: null;
  version: number;
  lastEventSeq: string;
  lastTurnIndex: string;
  createdAt: string;
  updatedAt: string;
}

interface FakeMessage {
  messageId: string;
  conversationId: string;
  turnId: string;
  ordinal: string;
  role: "user" | "assistant";
  content: { kind: "text"; text: string };
  revision: 1;
  status: "committed";
  artifactRefs: unknown[];
  createdAt: string;
}

interface FakeCall {
  method: string;
  path: string;
}

class DailySessionFake {
  activeUser: UserKey | null = null;
  conflictNextRename = false;
  unauthorizedNextList = false;
  unauthorizedNextSnapshot = false;
  readonly calls: FakeCall[] = [];
  private readonly idempotency = new Map<string, string>();
  private readonly conversations: Record<UserKey, FakeConversation[]> = {
    alice: [
      conversation(IDS.a1, "用户 A 第一页会话"),
      conversation(IDS.a2, "用户 A 第二页会话"),
    ],
    bob: [conversation(IDS.b1, "用户 B 独立会话")],
  };

  async install(page: Page): Promise<void> {
    await page.route("**/agent-api/**", (route) => this.handle(route));
  }

  private async handle(route: Route): Promise<void> {
    const request = route.request();
    const url = new URL(request.url());
    const path = `${url.pathname}${url.search}`;
    this.calls.push({ method: request.method(), path });

    if (url.pathname === "/agent-api/auth/xiaozhi-status") {
      await json(route, this.activeUser ? verifiedStatus(this.activeUser) : {
        enabled: false,
        xiaozhiUrl: "http://xiaozhi.test",
      });
      return;
    }
    if (url.pathname === "/agent-api/auth/login" && request.method() === "POST") {
      const body = request.postDataJSON() as { username?: unknown };
      this.activeUser = body.username === "bob" ? "bob" : "alice";
      await json(route, { success: true, user: user(this.activeUser) });
      return;
    }
    if (url.pathname === "/agent-api/auth/logout" && request.method() === "POST") {
      this.activeUser = null;
      await json(route, { ok: true });
      return;
    }
    if (!this.activeUser) {
      await error(route, 401, "AUTH_REQUIRED");
      return;
    }

    if (url.pathname === "/agent-api/conversations" && request.method() === "GET") {
      if (this.unauthorizedNextList) {
        this.unauthorizedNextList = false;
        this.activeUser = null;
        await error(route, 401, "AUTH_REQUIRED");
        return;
      }
      const all = this.conversations[this.activeUser];
      const cursor = url.searchParams.get("cursor");
      await json(route, {
        conversations: cursor ? all.slice(1) : all.slice(0, 1),
        nextCursor: !cursor && all.length > 1 ? "opaque-list/+==" : null,
      });
      return;
    }
    if (url.pathname === "/agent-api/conversations/" && request.method() === "POST") {
      const body = request.postDataJSON() as {
        clientRequestId: string;
        scenarioId: string;
        agentKey: string;
        title?: string;
      };
      const previous = this.idempotency.get(body.clientRequestId);
      const id = previous ?? IDS.created;
      this.idempotency.set(body.clientRequestId, id);
      let item = this.findForActiveUser(id);
      if (!item) {
        item = conversation(id, body.title ?? "新的对话");
        this.conversations[this.activeUser].unshift(item);
      }
      await json(route, { conversation: item, reused: Boolean(previous) }, 201);
      return;
    }

    const match = url.pathname.match(
      /^\/agent-api\/conversations\/([^/]+)(?:\/(snapshot|messages))?$/,
    );
    if (!match) {
      await route.fulfill({ status: 404, json: { error: "unexpected route" } });
      return;
    }
    const id = decodeURIComponent(match[1]!);
    const action = match[2];
    const item = this.findForActiveUser(id);
    if (!item) {
      await error(route, 404, "NOT_FOUND");
      return;
    }

    if (action === "snapshot" && request.method() === "GET") {
      if (this.unauthorizedNextSnapshot) {
        this.unauthorizedNextSnapshot = false;
        this.activeUser = null;
        await error(route, 401, "AUTH_REQUIRED");
        return;
      }
      const messages = id === IDS.a1 ? currentMessages() : [];
      await json(route, {
        conversation: item,
        activeTurn: null,
        messages,
        nextCursor: id === IDS.a1 ? "opaque-message/+==" : null,
        lastEventSeq: item.lastEventSeq,
      });
      return;
    }
    if (action === "messages" && request.method() === "GET") {
      await json(route, {
        messages: olderMessages(),
        nextCursor: null,
        lastEventSeq: item.lastEventSeq,
      });
      return;
    }
    if (!action && request.method() === "PATCH") {
      const body = request.postDataJSON() as { title: string; expectedVersion: number };
      if (this.conflictNextRename) {
        this.conflictNextRename = false;
        item.title = "服务端并发标题";
        item.version += 1;
        await error(route, 409, "CONFLICT");
        return;
      }
      if (body.expectedVersion !== item.version) {
        await error(route, 409, "CONFLICT");
        return;
      }
      item.title = body.title;
      item.version += 1;
      item.updatedAt = "2026-11-09T03:00:00.000Z";
      await json(route, { conversation: item });
      return;
    }

    await route.fulfill({ status: 405, json: { error: "method not allowed" } });
  }

  private findForActiveUser(id: string): FakeConversation | undefined {
    return this.activeUser
      ? this.conversations[this.activeUser].find((item) => item.conversationId === id)
      : undefined;
  }
}

test("manages daily conversations with pagination, conflict refresh, create, URL restore, and logout", async ({
  page,
}) => {
  const fake = new DailySessionFake();
  await fake.install(page);

  await page.goto("/history?mode=daily");
  await expect(page.getByRole("heading", { name: "登录日常会话" })).toBeVisible();
  await login(page, "alice");

  await expect(page.getByText("用户 A 第一页会话")).toBeVisible();
  await page.getByRole("button", { name: "加载更多" }).click();
  await expect(page.getByText("用户 A 第二页会话")).toBeVisible();

  await page.getByRole("link", { name: /用户 A 第二页会话/ }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${IDS.a2}`));
  await expect(page.getByText("这个持久会话暂时没有消息")).toBeVisible();
  await page.goto("/history?mode=daily");

  fake.conflictNextRename = true;
  await page.getByRole("button", { name: "重命名 用户 A 第一页会话" }).click();
  await page.getByRole("textbox", { name: "会话标题" }).fill("客户端标题");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("服务端并发标题")).toBeVisible();
  await expect(
    page.getByText("会话已被其他请求更新，已刷新最新内容", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "重命名 服务端并发标题" }).click();
  await page.getByRole("textbox", { name: "会话标题" }).fill("最终标题");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText("最终标题")).toBeVisible();

  await page.getByRole("button", { name: "新建持久会话" }).click();
  await expect(page).toHaveURL(new RegExp(`conversation=${IDS.created}`));
  await expect(page.getByText("这个持久会话暂时没有消息")).toBeVisible();
  await page.reload();
  await expect(page.getByText("新的对话")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "消息" })).toHaveCount(0);

  await page.getByRole("button", { name: "退出登录" }).click();
  await expect(page.getByRole("heading", { name: "登录日常会话" })).toBeVisible();

  expect(
    fake.calls.some(
      (call) =>
        call.path.includes("scenarioId=daily") &&
        call.path.includes("agentKey=agent-loop") &&
        call.path.includes("archived=exclude"),
    ),
  ).toBe(true);
});

test("restores and pages read-only messages, resets on 401, then isolates account B", async ({
  page,
}) => {
  const fake = new DailySessionFake();
  await fake.install(page);
  await page.goto("/history?mode=daily");
  await login(page, "alice");
  await page.goto(`/chat?mode=daily&conversation=${IDS.a1}`);

  await expect(page.getByText("当前较新消息")).toBeVisible();
  await page.getByRole("button", { name: "加载更早消息" }).click();
  await expect(page.getByText("更早消息")).toBeVisible();
  await expect(page.getByText("重复消息旧副本")).toHaveCount(0);
  await expect(page.locator("article.message-assistant")).toHaveCount(3);
  await expect(page.getByRole("textbox", { name: "消息" })).toHaveCount(0);

  fake.unauthorizedNextSnapshot = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "登录日常会话" })).toBeVisible();
  await expect(page.getByText("当前较新消息")).toHaveCount(0);

  await login(page, "bob");
  await expect(
    page.getByText("会话不存在、已删除或不属于当前用户", { exact: true }),
  ).toBeVisible();
  await page.goto("/history?mode=daily");
  await expect(page.getByText("用户 B 独立会话")).toBeVisible();
  await expect(page.getByText("用户 A 第一页会话")).toHaveCount(0);
});

test("clears history rows and returns to login when list auth expires", async ({ page }) => {
  const fake = new DailySessionFake();
  await fake.install(page);
  await page.goto("/history?mode=daily");
  await login(page, "alice");
  await expect(page.getByText("用户 A 第一页会话")).toBeVisible();

  fake.unauthorizedNextList = true;
  await page.reload();

  await expect(page.getByRole("heading", { name: "登录日常会话" })).toBeVisible();
  await expect(page.getByText("用户 A 第一页会话")).toHaveCount(0);
});

test("keeps legacy daily send and work history behavior unchanged", async ({ page }) => {
  await page.goto("/chat?mode=daily&scenario=completed&delay=50");
  await page.getByRole("textbox", { name: "消息" }).fill("日常回归");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(
    page.getByText("综合现有资料，本周需重点关注三类风险。"),
  ).toBeVisible();

  await page.route("**/api/work-agent/chat/threads?**", (route) =>
    route.fulfill({
      status: 200,
      json: [
        {
          id: "work-thread-1",
          title: "办公历史回归会话",
          is_pinned: false,
          updated_at: "2026-11-09T04:00:00.000Z",
        },
      ],
    }),
  );
  await page.goto("/history?mode=work");
  await expect(page.getByRole("link", { name: /办公历史回归会话/ })).toBeVisible();
});

async function login(page: Page, username: UserKey): Promise<void> {
  await page.getByRole("textbox", { name: "用户名" }).fill(username);
  await page.getByLabel("密码").fill("test-only-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(
    page.getByText(username === "alice" ? "用户 A" : "用户 B", { exact: true }),
  ).toBeVisible();
}

function conversation(id: string, title: string): FakeConversation {
  return {
    conversationId: id,
    scenarioId: "daily",
    agentKey: "agent-loop",
    title,
    status: "open",
    archivedAt: null,
    version: 1,
    lastEventSeq: "5",
    lastTurnIndex: "2",
    createdAt: "2026-11-09T00:00:00.000Z",
    updatedAt: "2026-11-09T01:00:00.000Z",
  };
}

function user(key: UserKey) {
  return {
    id: `user-${key}`,
    displayName: key === "alice" ? "用户 A" : "用户 B",
    sessionExpiresAt: "2026-11-10T00:00:00.000Z",
  };
}

function verifiedStatus(key: UserKey) {
  return { enabled: true, xiaozhiUrl: "http://xiaozhi.test", user: user(key) };
}

function currentMessages(): FakeMessage[] {
  return [
    message("40000000-0000-4000-8000-000000000002", "2", "保留当前重复消息"),
    message("40000000-0000-4000-8000-000000000003", "3", "当前较新消息"),
  ];
}

function olderMessages(): FakeMessage[] {
  return [
    message("40000000-0000-4000-8000-000000000001", "1", "更早消息"),
    message("40000000-0000-4000-8000-000000000002", "2", "重复消息旧副本"),
  ];
}

function message(messageId: string, ordinal: string, text: string): FakeMessage {
  return {
    messageId,
    conversationId: IDS.a1,
    turnId: IDS.turn,
    ordinal,
    role: "assistant",
    content: { kind: "text", text },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    createdAt: "2026-11-09T01:00:00.000Z",
  };
}

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function error(route: Route, status: number, code: string): Promise<void> {
  await json(
    route,
    {
      error: {
        code,
        message: "PRIVATE_FAKE_DETAIL",
        requestId: IDS.request,
      },
    },
    status,
  );
}
