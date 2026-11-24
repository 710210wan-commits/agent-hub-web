import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const BACKEND_ORIGIN = "http://127.0.0.1:3207";
const ORDINARY_ANSWER = "第一段真实正文。\n\n第二段继续增长。\n\n第三段完成回答。";
const TOOL_ANSWER = "TASK7 工具查询结果 42 已经确认。\n\n这是安全的最终正文。\n\n回答到此完成。";
const PRIVATE_DECISION = "PRIVATE_CONTENT_BEFORE_DELAYED_TOOL_CALL";

test("普通问答由多个 durable delta 至少增长两次，刷新后与拼接正文一致", async ({
  page,
}) => {
  await login(page, "ordinary");
  await observeAssistantGrowth(page);
  const conversationId = await submit(page, "TASK7 ordinary streaming");

  await expect(page.locator("article.message-assistant .message-markdown")).toContainText(
    "第三段完成回答",
  );
  const evidence = await publicEvidence(page, conversationId);
  const deltas = evidence.events.filter(event => event.type === "output.delta");
  expect(deltas.length).toBeGreaterThanOrEqual(2);
  expect(deltas.map(event => String(event.payload.delta)).join("")).toBe(ORDINARY_ANSWER);
  expect(await distinctGrowths(page, ORDINARY_ANSWER)).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "查看执行过程" })).toHaveCount(0);

  await page.reload();
  await expect(page.locator("article.message-assistant .message-markdown")).toHaveText(
    ORDINARY_ANSWER,
  );
});

test("工具决策中间 content 不进事件库或浏览器，最终正文仍多次增长", async ({
  page,
}) => {
  await login(page, "tool");
  await observeAssistantGrowth(page);
  const conversationId = await submit(page, "TASK7 delayed tool decision");
  await expect
    .poll(() => backendState(page.request, conversationId), { timeout: 20_000 })
    .toMatchObject({ turnStatus: "completed", errorCode: null });

  await expect(page.locator("article.message-assistant .message-markdown")).toContainText(
    "回答到此完成",
  );
  const evidence = await publicEvidence(page, conversationId);
  const serialized = JSON.stringify(evidence);
  expect(serialized).not.toContain(PRIVATE_DECISION);
  await expect(page.getByText(PRIVATE_DECISION)).toHaveCount(0);
  const deltas = evidence.events.filter(event => event.type === "output.delta");
  expect(deltas.length).toBeGreaterThanOrEqual(2);
  expect(deltas.map(event => String(event.payload.delta)).join("")).toBe(TOOL_ANSWER);
  expect(await distinctGrowths(page, TOOL_ANSWER)).toBeGreaterThanOrEqual(2);
  await page.getByRole("button", { name: "查看执行过程" }).click();
  await expect(page.getByText(/已完成 1 个工具步骤/)).toBeVisible();
});

test("中途停止后无晚到 delta，partial 刷新后仍可读", async ({ page }) => {
  await login(page, "cancel");
  const conversationId = await submit(page, "TASK7 cancel after first delta");
  const answer = page.locator("article.message-assistant .message-markdown");
  await expect(answer).toContainText("停止前已经公开的正文");
  await page.getByRole("button", { name: "停止", exact: true }).click();
  await expect(page.getByText("生成已停止，已保留以上正文")).toBeVisible();

  await page.waitForTimeout(700);
  await expect(answer).not.toContainText("取消后绝不能公开");
  const evidence = await publicEvidence(page, conversationId);
  expect(JSON.stringify(evidence)).not.toContain("取消后绝不能公开");
  expect(evidence.events.filter(event => event.type === "output.delta")).toHaveLength(1);

  await page.reload();
  await expect(page.getByText("停止前已经公开的正文")).toBeVisible();
  await expect(page.getByText("生成已停止，已保留以上正文")).toBeVisible();
});

test("SSE 断线重连不重复正文，也不重复模型执行", async ({ page, request }) => {
  await installControllableStream(page);
  await login(page, "reconnect");
  const conversationId = await submit(page, "TASK7 reconnect once");
  const answer = page.locator("article.message-assistant .message-markdown");
  await expect(answer).toContainText("断线前正文");

  await page.evaluate(() => window.__task7DisconnectStream?.());
  await expect(page.getByText("连接已中断", { exact: true })).toBeVisible();
  await page.waitForTimeout(450);
  await page.getByRole("button", { name: "重新连接" }).click({ timeout: 5_000 });
  await expect(answer).toContainText("重连后的完整正文");
  await expect(answer).toHaveText("断线前正文，重连后的完整正文");

  const state = await backendState(request, conversationId);
  expect(state.finalStreamCalls).toBe(1);
  const evidence = await publicEvidence(page, conversationId);
  expect(
    evidence.events
      .filter(event => event.type === "output.delta")
      .map(event => String(event.payload.delta))
      .join(""),
  ).toBe("断线前正文，重连后的完整正文");
});

async function login(page: Page, suffix: string) {
  await page.goto("/chat?mode=1");
  await expect(page.getByRole("heading", { name: "登录" })).toBeVisible();
  await page.getByRole("textbox", { name: "用户名" }).fill(`task7-${suffix}`);
  await page.getByLabel("密码").fill("controlled-fixture-only");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "消息" })).toBeVisible();
}

async function submit(page: Page, text: string): Promise<string> {
  await page.getByRole("textbox", { name: "消息" }).fill(text);
  await page.getByRole("button", { name: "发送", exact: true }).click();
  await expect(page).toHaveURL(/conversation=[0-9a-f-]+/);
  return new URL(page.url()).searchParams.get("conversation")!;
}

async function observeAssistantGrowth(page: Page) {
  await page.evaluate(() => {
    const samples: string[] = [];
    Object.defineProperty(window, "__task7Growths", { configurable: true, value: samples });
    const observer = new MutationObserver(() => {
      const nodes = document.querySelectorAll("article.message-assistant .message-markdown");
      const text = nodes.item(nodes.length - 1)?.textContent?.replace("正在生成", "").trim();
      if (text && samples.at(-1) !== text) samples.push(text);
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  });
}

async function installControllableStream(page: Page) {
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await nativeFetch(...args);
      const url = typeof args[0] === "string" ? args[0] : args[0] instanceof URL
        ? args[0].href
        : args[0].url;
      if (!url.includes("/conversations/") || !url.includes("/stream") || !response.body) {
        return response;
      }
      const reader = response.body.getReader();
      let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
        async pull(controller) {
          const chunk = await reader.read();
          if (chunk.done) controller.close();
          else controller.enqueue(chunk.value);
        },
        cancel(reason) {
          return reader.cancel(reason);
        },
      });
      window.__task7DisconnectStream = () => {
        void reader.cancel("TASK7_CONTROLLED_DISCONNECT");
        streamController?.error(new TypeError("TASK7_CONTROLLED_DISCONNECT"));
        window.__task7DisconnectStream = undefined;
      };
      return new Response(body, {
        headers: response.headers,
        status: response.status,
        statusText: response.statusText,
      });
    };
  });
}

async function distinctGrowths(page: Page, finalAnswer: string): Promise<number> {
  return page.evaluate(answer => {
    const values = (window as typeof window & { __task7Growths?: string[] }).__task7Growths ?? [];
    const normalizedAnswer = answer.replace(/\s/g, "");
    return new Set(
      values
        .map(value => value.replace(/\s/g, ""))
        .filter(value => normalizedAnswer.startsWith(value)),
    ).size;
  }, finalAnswer);
}

interface PublicEvent {
  type: string;
  payload: Record<string, unknown>;
}

async function publicEvidence(page: Page, conversationId: string) {
  return page.evaluate(async id => {
    const [events, snapshot] = await Promise.all([
      fetch(`/agent-api/conversations/${id}/events?afterSeq=0`).then(response => response.json()),
      fetch(`/agent-api/conversations/${id}/snapshot`).then(response => response.json()),
    ]);
    return { events: events.events as PublicEvent[], snapshot };
  }, conversationId);
}

async function backendState(request: APIRequestContext, conversationId: string) {
  const response = await request.get(`${BACKEND_ORIGIN}/__state/${conversationId}`);
  expect(response.ok()).toBe(true);
  return response.json() as Promise<{
    finalStreamCalls: number;
    turnStatus: string | null;
    errorCode: string | null;
  }>;
}

declare global {
  interface Window {
    __task7Growths?: string[];
    __task7DisconnectStream?: () => void;
  }
}
