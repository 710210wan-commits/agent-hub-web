import { expect, test, type Route } from "@playwright/test";

import { installGlobalAuthFixture } from "./fixtures/global-auth";

test("Work history restores a conversation and continues it without touching daily APIs", async ({ page }) => {
  await installGlobalAuthFixture(page);
  const calls: Array<{ method: string; path: string }> = [];
  let dailyRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/agent-api/conversations")) dailyRequests += 1;
  });

  await page.route("**/api/work-agent/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    calls.push({ method, path });

    if (method === "GET" && path === "/api/work-agent/chat/threads") {
      await json(route, [{
        id: "thread-task6",
        title: "Task 6 Work History",
        is_pinned: true,
        updated_at: "2026-11-12T09:00:00.000Z",
      }]);
      return;
    }
    if (method === "GET" && path === "/api/work-agent/chat/thread/thread-task6/history") {
      await json(route, {
        history: [
          { id: "history-user", type: "human", content: "历史问题", created_at: "2026-11-12T08:59:00.000Z" },
          { id: "history-ai", type: "ai", content: "历史回答", created_at: "2026-11-12T09:00:00.000Z" },
        ],
      });
      return;
    }
    if (method === "POST" && path === "/api/work-agent/agent/runs") {
      const input = request.postDataJSON() as { thread_id?: unknown };
      await json(route, { run_id: "run-task6", thread_id: input.thread_id });
      return;
    }
    if (method === "GET" && path === "/api/work-agent/agent/runs/run-task6/events") {
      await route.fulfill({
        body: "event: end\ndata: {\"status\":\"completed\"}\n\n",
        contentType: "text/event-stream",
        status: 200,
      });
      return;
    }
    if (method === "GET" && path === "/api/work-agent/agent/runs/run-task6/result") {
      await json(route, { status: "completed", output: "Task 6 continuation complete." });
      return;
    }
    await json(route, { detail: `Unhandled Work Chat fixture route: ${method} ${path}` }, 404);
  });

  await page.goto("/history?mode=work");
  const historyLink = page.getByRole("link", { name: /Task 6 Work History/ });
  await expect(historyLink).toBeVisible();
  await expect(historyLink).toHaveAttribute("href", "/chat?mode=work&conversation=thread-task6");
  await historyLink.click();

  await expect(page).toHaveURL(/\/chat\?mode=work&conversation=thread-task6$/);
  await expect(page.getByText("历史问题", { exact: true })).toBeVisible();
  await expect(page.getByText("历史回答", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "消息" }).fill("继续这个 Work 会话");
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("Task 6 continuation complete.", { exact: true })).toBeVisible();

  expect(calls).toEqual(expect.arrayContaining([
    { method: "GET", path: "/api/work-agent/chat/threads" },
    { method: "GET", path: "/api/work-agent/chat/thread/thread-task6/history" },
    { method: "POST", path: "/api/work-agent/agent/runs" },
  ]));
  expect(dailyRequests).toBe(0);
});

async function json(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status });
}
