import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

interface RunResponse {
  run_id: string;
}

interface RunResultResponse {
  status: string;
  output?: string | null;
}

interface BrowserObservations {
  activities: string[];
  assistantSnapshots: string[];
}

test.setTimeout(300_000);

test("work mode persists, restores, continues, cancels, and stays isolated from daily", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.RUN_XIAOZHI_REAL_E2E !== "1",
    "requires explicit RUN_XIAOZHI_REAL_E2E=1 opt-in",
  );
  const apiKey = process.env.XIAOZHI_API_KEY;
  const apiKeyPrefix = ["yx", "key_"].join("");
  test.skip(!apiKey?.startsWith(apiKeyPrefix), "requires a temporary server-only Xiaozhi key");

  const marker = `AH-E2E-${Date.now()}`;
  const firstPrompt = `${marker} 请用两句简短纯文本确认办公会话可用，不要使用 Markdown。`;
  const followUpPrompt = `${marker} FOLLOWUP 请再用一句简短纯文本回复。`;
  const stopPrompt = `${marker} STOP 请详细列出三十条办公室整理建议，每条附说明。`;
  const runIds: string[] = [];
  const requestHeaders: Array<Record<string, string>> = [];
  const responseHeaders: Array<Record<string, string>> = [];
  const headerTasks: Promise<void>[] = [];

  page.on("request", (browserRequest) => {
    headerTasks.push(
      browserRequest.allHeaders().then((headers) => {
        requestHeaders.push(headers);
      }),
    );
  });
  page.on("response", (response) => {
    headerTasks.push(
      response.allHeaders().then((headers) => {
        responseHeaders.push(headers);
      }),
    );
    if (
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/work-agent/agent/runs" &&
      response.ok()
    ) {
      headerTasks.push(
        response.json().then((body: RunResponse) => {
          runIds.push(body.run_id);
        }),
      );
    }
  });

  await page.goto("/chat?mode=2");
  await installObservationRecorder(page);

  const firstRunId = await sendAndWait(page, firstPrompt, runIds, 0);
  const conversation = new URL(page.url()).searchParams.get("conversation");
  expect(conversation).toBeTruthy();
  expect(new URL(page.url()).searchParams.has("draft")).toBe(false);

  const firstAnswer = await latestAssistantText(page);
  const firstResult = await readRunResult(request, firstRunId);
  expect(firstResult.status).toBe("completed");
  expect(normalize(firstAnswer)).toBe(normalize(firstResult.output ?? ""));

  const observations = await readObservations(page);
  expect(observations.activities.length).toBeGreaterThan(0);
  expect(observations.activities.every((value) => !/[\r\n]/.test(value))).toBe(
    true,
  );
  expect(new Set(observations.assistantSnapshots).size).toBeGreaterThan(1);

  await page.goto("/history?mode=2");
  const persistedSession = page.getByRole("link", {
    name: new RegExp(marker),
  });
  await expect(persistedSession).toBeVisible({ timeout: 30_000 });
  await persistedSession.click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("conversation"))
    .toBe(conversation);
  await expect(page.locator("article.message-assistant .message-markdown").first()).toHaveText(
    firstAnswer,
    { timeout: 30_000 },
  );

  const secondRunId = await sendAndWait(page, followUpPrompt, runIds, 1);
  const secondResult = await readRunResult(request, secondRunId);
  expect(secondResult.status).toBe("completed");
  expect(await latestAssistantText(page)).toBeTruthy();

  await page.getByRole("link", { name: "新对话" }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("draft"))
    .toBeTruthy();
  await page.getByRole("textbox", { name: "消息" }).fill(stopPrompt);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  await expect.poll(() => runIds.length).toBe(3);
  const stoppedRunId = runIds[2]!;
  await page.getByRole("button", { name: "停止" }).click();
  await expect(page.getByText("生成已停止", { exact: true })).toBeVisible();
  await expect.poll(
      () =>
        page
          .request
          .get(`/api/work-agent/agent/runs/${encodeURIComponent(stoppedRunId)}/result`)
          .then(async (response) => {
            if (!response.ok()) return "request-failed";
            const body = (await response.json()) as RunResultResponse;
            return body.status;
          }),
      { timeout: 30_000 },
    )
    .toMatch(/^(aborted|canceled|cancelled|stopped)$/);

  await page.getByRole("button", { name: "决策" }).click();
  await expect(page.getByRole("heading", { name: "今天想聊些什么？" })).toBeVisible();
  await expect(page.getByText(marker, { exact: false })).toHaveCount(0);
  await page.goto("/history?mode=1");
  await expect(page.getByText("日常历史待 session 接入")).toBeVisible();
  await expect(page.getByText(marker, { exact: false })).toHaveCount(0);

  await Promise.all(headerTasks);
  const browserSurface = JSON.stringify({
    html: await page.content(),
    requestHeaders,
    responseHeaders,
  });
  if (browserSurface.includes(apiKey) || browserSurface.includes(apiKeyPrefix)) {
    throw new Error("Server-only Xiaozhi credentials reached the browser surface");
  }
});

async function sendAndWait(
  page: Page,
  prompt: string,
  runIds: string[],
  previousRunCount: number,
): Promise<string> {
  await page.getByRole("textbox", { name: "消息" }).fill(prompt);
  await page.getByRole("button", { name: "发送" }).click();
  await expect(page.getByRole("button", { name: "停止" })).toBeVisible();
  await expect.poll(() => runIds.length, { timeout: 30_000 }).toBe(
    previousRunCount + 1,
  );
  await expect(page.locator("article.message-assistant .message-markdown").last()).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByRole("button", { name: "发送" })).toBeVisible({
    timeout: 180_000,
  });
  return runIds[previousRunCount]!;
}

async function latestAssistantText(page: Page): Promise<string> {
  return (
    (await page
      .locator("article.message-assistant .message-markdown")
      .last()
      .innerText()) ?? ""
  ).trim();
}

async function readRunResult(
  request: APIRequestContext,
  runId: string,
): Promise<RunResultResponse> {
  const response = await request.get(
    `/api/work-agent/agent/runs/${encodeURIComponent(runId)}/result`,
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as RunResultResponse;
}

async function installObservationRecorder(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observations: BrowserObservations = {
      activities: [],
      assistantSnapshots: [],
    };
    (
      window as typeof window & {
        __agentHubE2E?: BrowserObservations;
      }
    ).__agentHubE2E = observations;
    const record = () => {
      const activity = document.querySelector("[data-testid='activity-line']")
        ?.textContent;
      if (activity && !observations.activities.includes(activity)) {
        observations.activities.push(activity);
      }
      const answers = document.querySelectorAll(
        "article.message-assistant .message-markdown",
      );
      const latest = answers.item(answers.length - 1)?.textContent?.trim();
      if (
        latest &&
        observations.assistantSnapshots.at(-1) !== latest
      ) {
        observations.assistantSnapshots.push(latest);
      }
    };
    new MutationObserver(record).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}

async function readObservations(page: Page): Promise<BrowserObservations> {
  return page.evaluate(
    () =>
      (
        window as typeof window & {
          __agentHubE2E?: BrowserObservations;
        }
      ).__agentHubE2E ?? { activities: [], assistantSnapshots: [] },
  );
}

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
