import { expect, test } from "@playwright/test";

interface FixtureCall {
  method?: string;
  path: string;
  kind?: string;
  body?: Record<string, unknown>;
}

const fixtureOrigin = "http://127.0.0.1:3201";

async function resetFixture() {
  const response = await fetch(`${fixtureOrigin}/__reset`, { method: "POST" });
  expect(response.ok).toBe(true);
}

async function readCalls(): Promise<FixtureCall[]> {
  const response = await fetch(`${fixtureOrigin}/__calls`);
  expect(response.ok).toBe(true);
  const payload = (await response.json()) as { calls: FixtureCall[] };
  return payload.calls;
}

async function advance(taskId: string, phase: "tool" | "complete") {
  const response = await fetch(`${fixtureOrigin}/__advance/${taskId}/${phase}`, {
    method: "POST",
  });
  expect(response.ok).toBe(true);
}

function apiCalls(calls: FixtureCall[]) {
  return calls.filter((call) => call.method);
}

test.beforeEach(async () => {
  await resetFixture();
});

test("shows safe activity then only the final Markdown from the real SSE transport", async ({
  page,
}) => {
  await page.goto("/chat?mode=daily");
  await page.getByRole("textbox", { name: "消息" }).fill("分析真实链路风险");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByTestId("activity-line")).toHaveText("正在处理请求");
  await advance("task-complete", "tool");
  await expect(page.getByTestId("activity-line")).toHaveText("正在调用风险分析");
  await advance("task-complete", "complete");
  await expect(page.getByText("最终结论", { exact: true })).toBeVisible();
  await expect(page.getByText("风险可控", { exact: true })).toBeVisible();
  await expect(page.getByTestId("activity-line")).toHaveCount(0);
  await expect(page.getByText("SECRET_REASONING_SHOULD_NOT_RENDER")).toHaveCount(0);
  await expect(page.getByText("SECRET_TOOL_OUTPUT_SHOULD_NOT_RENDER")).toHaveCount(0);

  const calls = await readCalls();
  expect(apiCalls(calls)).toEqual([
    {
      method: "POST",
      path: "/tasks",
      body: {
        query: "分析真实链路风险",
        userId: "agent-hub-web",
        sessionId: expect.any(String),
        clientRequestId: expect.any(String),
      },
    },
    { method: "GET", path: "/tasks/task-complete/stream" },
  ]);
});

test("stops the real run, closes SSE, and requests backend abort", async ({ page }) => {
  await page.goto("/chat?mode=daily");
  await page.getByRole("textbox", { name: "消息" }).fill("请测试手动停止");
  await page.getByRole("button", { name: "发送" }).click();

  await expect(page.getByTestId("activity-line")).toHaveText("正在处理请求");
  await advance("task-abort", "tool");
  await expect(page.getByTestId("activity-line")).toHaveText("正在调用风险分析");
  await page.getByRole("button", { name: "停止" }).click();

  await expect(page.getByText("生成已停止", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新生成" })).toBeVisible();
  await expect(page.getByRole("button", { name: "继续生成" })).toHaveCount(0);
  await expect(page.getByTestId("activity-line")).toHaveCount(0);
  await expect(page.getByText("最终结论", { exact: true })).toHaveCount(0);
  await expect(page.getByText("风险可控", { exact: true })).toHaveCount(0);

  await expect
    .poll(async () => {
      const calls = await readCalls();
      return {
        aborted: calls.some(
          (call) => call.method === "POST" && call.path === "/tasks/task-abort/abort",
        ),
        streamClosed: calls.some(
          (call) => call.kind === "sse-close" && call.path === "/tasks/task-abort/stream",
        ),
      };
    })
    .toEqual({ aborted: true, streamClosed: true });

  const calls = await readCalls();
  expect(apiCalls(calls)).toEqual([
    {
      method: "POST",
      path: "/tasks",
      body: {
        query: "请测试手动停止",
        userId: "agent-hub-web",
        sessionId: expect.any(String),
        clientRequestId: expect.any(String),
      },
    },
    { method: "GET", path: "/tasks/task-abort/stream" },
    { method: "POST", path: "/tasks/task-abort/abort" },
  ]);
  expect(calls.filter((call) => call.kind === "sse-close")).toEqual([
    { kind: "sse-close", path: "/tasks/task-abort/stream" },
  ]);
});
