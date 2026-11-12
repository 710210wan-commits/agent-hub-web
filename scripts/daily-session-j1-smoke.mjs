import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const requiredEnv = [
  "DAILY_SESSION_J1_ORIGIN",
  "DAILY_SESSION_J1_USER_A",
  "DAILY_SESSION_J1_PASSWORD_A",
  "DAILY_SESSION_J1_USER_B",
  "DAILY_SESSION_J1_PASSWORD_B",
];
export async function main() {
  const missing = requiredEnv.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    console.error(
      `[daily-session-j1] SKIP（非通过）：缺少环境变量 ${missing.join(", ")}`,
    );
    return 2;
  }
  try {
    await run();
    return 0;
  } catch (error) {
    console.error(
      `[daily-session-j1] FAIL：${error instanceof Error ? error.message : "未知错误"}`,
    );
    return 1;
  }
}

if (isDirectExecution()) {
  process.exitCode = await main();
}

async function run() {
  const origin = validateOrigin(process.env.DAILY_SESSION_J1_ORIGIN);
  const userA = credentials("A");
  const userB = credentials("B");
  const clientA = new SmokeClient(origin);
  const clientB = new SmokeClient(origin);
  let created;
  let primaryError;

  console.log(`[daily-session-j1] START origin=${origin.origin}`);
  try {
    const identityA = await login(clientA, userA);
    console.log(`[daily-session-j1] PASS login A user=${anonymize(identityA.id)}`);

    const title = `J1 smoke ${new Date().toISOString()}`;
    const createdPayload = await clientA.json("/agent-api/conversations", {
      method: "POST",
      body: {
        clientRequestId: randomUUID(),
        scenarioId: "daily",
        agentKey: "agent-loop",
        title,
      },
    });
    created = requireConversation(createdPayload?.conversation, "create A");

    const firstPage = await clientA.json(listPath(1));
    const listed = requireArray(firstPage?.conversations, "list A");
    if (!listed.some((item) => item?.conversationId === created.conversationId)) {
      throw new Error("list A 未返回刚创建的会话");
    }
    if (typeof firstPage.nextCursor === "string") {
      await clientA.json(listPath(1, firstPage.nextCursor));
      console.log("[daily-session-j1] PASS list page A");
    } else {
      console.log("[daily-session-j1] PASS list page A terminal-no-cursor");
    }

    const renamedTitle = `${title} renamed`;
    const renamedPayload = await clientA.json(
      `/agent-api/conversations/${encodeURIComponent(created.conversationId)}`,
      {
        method: "PATCH",
        body: { title: renamedTitle, expectedVersion: created.version },
      },
    );
    const renamed = requireConversation(renamedPayload?.conversation, "rename A");
    if (renamed.title !== renamedTitle || renamed.version <= created.version) {
      throw new Error("rename A 元数据未更新");
    }

    const snapshot = await clientA.json(snapshotPath(created.conversationId));
    requireConversation(snapshot?.conversation, "snapshot A");
    if (typeof snapshot?.nextCursor === "string") {
      await clientA.json(messagesPath(created.conversationId, snapshot.nextCursor));
      console.log("[daily-session-j1] PASS snapshot/message page A");
    } else {
      console.log("[daily-session-j1] PASS snapshot A terminal-no-cursor");
    }

    const firstTurn = requireTurn(
      await clientA.json(turnsPath(created.conversationId), {
        method: "POST",
        body: {
          clientRequestId: randomUUID(),
          input: { kind: "text", text: "请返回一句简短 smoke 回复" },
        },
      }),
      "turn A",
    );
    const eventPage = await clientA.json(eventsPath(created.conversationId, "0"));
    requireArray(eventPage?.events, "events A");
    const completedEvents = await clientA.collectTerminalEvents(
      created.conversationId,
      "0",
    );
    requireTerminalEvents(completedEvents);
    const terminalSnapshot = await clientA.json(snapshotPath(created.conversationId));
    const terminalMessages = requireArray(terminalSnapshot?.messages, "terminal snapshot A");
    if (!terminalMessages.some((item) => item?.messageId === firstTurn.userMessageId)) {
      throw new Error("terminal snapshot A 缺少首轮用户消息");
    }
    console.log("[daily-session-j1] PASS turn/events/SSE/terminal/snapshot A");

    const cancelTurnReceipt = requireTurn(
      await clientA.json(turnsPath(created.conversationId), {
        method: "POST",
        body: {
          clientRequestId: randomUUID(),
          input: { kind: "text", text: "这条 smoke 请求应被取消" },
        },
      }),
      "cancel turn A",
    );
    const interruptedPromise = clientA.collectTerminalEvents(
      created.conversationId,
      cancelTurnReceipt.acceptedEventSeq,
    );
    await clientA.json(
      cancelPath(created.conversationId, cancelTurnReceipt.turnId),
      { method: "POST" },
    );
    const interruptedEvents = await interruptedPromise;
    if (!interruptedEvents.some((event) => event?.type === "turn.interrupted")) {
      throw new Error("cancel A 未观察到 turn.interrupted");
    }
    console.log("[daily-session-j1] PASS cancel/interrupted A");

    const identityB = await login(clientB, userB);
    console.log(`[daily-session-j1] PASS login B user=${anonymize(identityB.id)}`);
    if (identityA.id === identityB.id) throw new Error("A/B 映射到同一用户身份");

    const listB = await clientB.json(listPath(100));
    const conversationsB = requireArray(listB?.conversations, "list B");
    if (conversationsB.some((item) => item?.conversationId === created.conversationId)) {
      throw new Error("B 列表泄露 A 会话");
    }
    await clientB.expectStatus(snapshotPath(created.conversationId), 404);
    console.log("[daily-session-j1] PASS account isolation B");

    const refreshed = await clientA.json(snapshotPath(created.conversationId));
    const refreshedConversation = requireConversation(
      refreshed?.conversation,
      "refresh A",
    );
    if (
      refreshedConversation.title !== renamedTitle ||
      refreshedConversation.version !== renamed.version
    ) {
      throw new Error("refresh A 未读到重命名后的元数据");
    }
    console.log("[daily-session-j1] PASS refresh A");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupError = logoutFailure(
      await Promise.allSettled([clientA.logout(), clientB.logout()]),
    );
    if (cleanupError && primaryError) {
      console.error(`[daily-session-j1] CLEANUP FAIL：${cleanupError.message}`);
    } else if (cleanupError) {
      throw cleanupError;
    }
  }

  console.log("[daily-session-j1] PASS all checks; test conversations retained");
}

export function logoutFailure(results) {
  const failed = results
    .map((result, index) => (result.status === "rejected" ? (index === 0 ? "A" : "B") : null))
    .filter(Boolean);
  return failed.length > 0 ? new Error(`logout ${failed.join("/")} 失败`) : null;
}

export function parseNamedSseFrame(frame, conversationId) {
  let eventName = "";
  let eventId = "";
  const data = [];
  for (const rawLine of frame.split(/\r?\n/)) {
    if (!rawLine || rawLine.startsWith(":")) continue;
    const separator = rawLine.indexOf(":");
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator);
    const value = separator < 0 ? "" : rawLine.slice(separator + 1).replace(/^ /, "");
    if (field === "event") eventName = value;
    else if (field === "id") eventId = value;
    else if (field === "data") data.push(value);
  }
  if (!eventName && !eventId && data.length === 0) return null;
  if (!eventName || !eventId || data.length === 0) {
    throw new Error("SSE 帧缺少 event/id/data");
  }
  const payload = JSON.parse(data.join("\n"));
  if (payload?.type !== eventName) throw new Error("SSE event/type 不一致");
  if (eventId !== `${conversationId}:${payload?.eventSeq}`) {
    throw new Error("SSE id 与会话序号不一致");
  }
  return payload;
}

export function requireTerminalEvents(events) {
  const terminal = events.find((event) =>
    ["turn.completed", "turn.failed", "turn.interrupted"].includes(event?.type),
  );
  if (!terminal) throw new Error("SSE 未观察到 turn terminal");
  if (terminal.type !== "turn.completed") {
    throw new Error(`首轮未完成：${terminal.type}`);
  }
  const terminalIndex = events.indexOf(terminal);
  if (!events.slice(0, terminalIndex).some((event) => event?.type === "message.created")) {
    throw new Error("终态前未观察到 message.created");
  }
  return terminal;
}

function isDirectExecution() {
  return Boolean(
    process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href,
  );
}

function credentials(label) {
  return {
    username: process.env[`DAILY_SESSION_J1_USER_${label}`],
    password: process.env[`DAILY_SESSION_J1_PASSWORD_${label}`],
  };
}

async function login(client, input) {
  const body = { username: input.username, password: input.password };
  const loginResult = await client.json("/agent-api/auth/login", {
    method: "POST",
    body,
  });
  if (loginResult?.kbUnavailable === true) {
    await client.json("/agent-api/auth/xiaozhi-login", { method: "POST", body });
  }
  const status = await client.json("/agent-api/auth/xiaozhi-status");
  if (status?.enabled !== true || typeof status.user?.id !== "string") {
    throw new Error("登录后身份校验失败");
  }
  return status.user;
}

class SmokeClient {
  #origin;
  #cookies = new Map();

  constructor(origin) {
    this.#origin = origin;
  }

  async json(path, options = {}) {
    const response = await this.#request(path, options);
    if (!response.ok) throw new Error(`${options.method ?? "GET"} ${path} -> HTTP ${response.status}`);
    try {
      return await response.json();
    } catch {
      throw new Error(`${options.method ?? "GET"} ${path} -> 非 JSON 响应`);
    }
  }

  async expectStatus(path, expectedStatus) {
    const response = await this.#request(path);
    if (response.status !== expectedStatus) {
      throw new Error(`GET ${path} -> HTTP ${response.status}，预期 ${expectedStatus}`);
    }
  }

  async collectTerminalEvents(conversationId, afterSeq, timeoutMs = 180_000) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.#request(streamPath(conversationId, afterSeq), {
        accept: "text/event-stream",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`SSE -> HTTP ${response.status}`);
      }
      if (!response.headers.get("content-type")?.includes("text/event-stream")) {
        throw new Error("SSE -> 非 text/event-stream 响应");
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error("SSE -> 响应体不可读");
      const decoder = new TextDecoder();
      const events = [];
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const event = parseNamedSseFrame(frame, conversationId);
          if (!event) continue;
          events.push(event);
          if (["turn.completed", "turn.failed", "turn.interrupted"].includes(event.type)) {
            await reader.cancel();
            return events;
          }
        }
        if (done) throw new Error("SSE 在 terminal 前断开");
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error("SSE 等待 terminal 超时");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async logout() {
    if (this.#cookies.size === 0) return;
    const response = await this.#request("/agent-api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error(`logout -> HTTP ${response.status}`);
    this.#cookies.clear();
  }

  async #request(path, options = {}) {
    const method = options.method ?? "GET";
    const headers = { accept: options.accept ?? "application/json" };
    if (this.#cookies.size > 0) headers.cookie = this.#cookieHeader();
    let body;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json; charset=utf-8";
      body = JSON.stringify(options.body);
    }
    if (method !== "GET" && method !== "HEAD") headers.origin = this.#origin.origin;
    const response = await fetch(new URL(path, this.#origin), {
      method,
      headers,
      body,
      redirect: "error",
      signal: options.signal,
    });
    this.#captureCookies(response.headers);
    return response;
  }

  #cookieHeader() {
    return [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  #captureCookies(headers) {
    const values =
      typeof headers.getSetCookie === "function"
        ? headers.getSetCookie()
        : [headers.get("set-cookie")].filter(Boolean);
    for (const value of values) {
      const pair = value.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      const cookieValue = pair.slice(separator + 1).trim();
      if (cookieValue) this.#cookies.set(name, cookieValue);
      else this.#cookies.delete(name);
    }
  }
}

function validateOrigin(raw) {
  const origin = new URL(raw);
  if (origin.pathname !== "/" || origin.search || origin.hash) {
    throw new Error("DAILY_SESSION_J1_ORIGIN 必须仅包含 origin");
  }
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(origin.hostname);
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback)) {
    throw new Error("凭据仅允许发送到 HTTPS 或本机 HTTP origin");
  }
  return origin;
}

function listPath(limit, cursor) {
  const search = new URLSearchParams({
    limit: String(limit),
    archived: "exclude",
    scenarioId: "daily",
    agentKey: "agent-loop",
  });
  if (cursor) search.set("cursor", cursor);
  return `/agent-api/conversations?${search}`;
}

function snapshotPath(id) {
  return `/agent-api/conversations/${encodeURIComponent(id)}/snapshot?limit=100`;
}

function messagesPath(id, cursor) {
  const search = new URLSearchParams({ limit: "100", cursor });
  return `/agent-api/conversations/${encodeURIComponent(id)}/messages?${search}`;
}

function turnsPath(id) {
  return `/agent-api/conversations/${encodeURIComponent(id)}/turns`;
}

function eventsPath(id, afterSeq) {
  const search = new URLSearchParams({ afterSeq, limit: "200" });
  return `/agent-api/conversations/${encodeURIComponent(id)}/events?${search}`;
}

function streamPath(id, afterSeq) {
  const search = new URLSearchParams({ afterSeq });
  return `/agent-api/conversations/${encodeURIComponent(id)}/events/stream?${search}`;
}

function cancelPath(id, turnId) {
  return `/agent-api/conversations/${encodeURIComponent(id)}/turns/${encodeURIComponent(turnId)}/cancel`;
}

function requireConversation(value, step) {
  if (
    !value ||
    typeof value.conversationId !== "string" ||
    typeof value.title !== "string" ||
    !Number.isInteger(value.version)
  ) {
    throw new Error(`${step} 响应缺少合法会话元数据`);
  }
  return value;
}

function requireArray(value, step) {
  if (!Array.isArray(value)) throw new Error(`${step} 响应缺少 conversations`);
  return value;
}

function requireTurn(value, step) {
  if (
    !value ||
    typeof value.conversationId !== "string" ||
    typeof value.turnId !== "string" ||
    typeof value.userMessageId !== "string" ||
    typeof value.acceptedEventSeq !== "string"
  ) {
    throw new Error(`${step} 响应缺少合法 turn receipt`);
  }
  return value;
}

function anonymize(value) {
  return `…${value.slice(-4)}`;
}
