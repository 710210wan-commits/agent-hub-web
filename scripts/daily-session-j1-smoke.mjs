import { randomUUID } from "node:crypto";

const requiredEnv = [
  "DAILY_SESSION_J1_ORIGIN",
  "DAILY_SESSION_J1_USER_A",
  "DAILY_SESSION_J1_PASSWORD_A",
  "DAILY_SESSION_J1_USER_B",
  "DAILY_SESSION_J1_PASSWORD_B",
];
const missing = requiredEnv.filter((name) => !process.env[name]?.trim());

if (missing.length > 0) {
  console.error(
    `[daily-session-j1] SKIP（非通过）：缺少环境变量 ${missing.join(", ")}`,
  );
  process.exitCode = 2;
} else {
  await run().catch((error) => {
    console.error(
      `[daily-session-j1] FAIL：${error instanceof Error ? error.message : "未知错误"}`,
    );
    process.exitCode = 1;
  });
}

async function run() {
  const origin = validateOrigin(process.env.DAILY_SESSION_J1_ORIGIN);
  const userA = credentials("A");
  const userB = credentials("B");
  const clientA = new SmokeClient(origin);
  const clientB = new SmokeClient(origin);
  let created;

  console.log(`[daily-session-j1] START origin=${origin.origin}`);
  try {
    const identityA = await login(clientA, userA);
    console.log(`[daily-session-j1] PASS login A user=${anonymize(identityA.id)}`);

    const title = `J1 smoke ${new Date().toISOString()}`;
    const createdPayload = await clientA.json("/agent-api/conversations/", {
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
  } finally {
    await Promise.allSettled([clientA.logout(), clientB.logout()]);
  }

  console.log("[daily-session-j1] PASS all checks; test conversations retained");
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

  async logout() {
    if (this.#cookies.size === 0) return;
    const response = await this.#request("/agent-api/auth/logout", { method: "POST" });
    if (!response.ok) throw new Error(`logout -> HTTP ${response.status}`);
    this.#cookies.clear();
  }

  async #request(path, options = {}) {
    const method = options.method ?? "GET";
    const headers = { accept: "application/json" };
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

function anonymize(value) {
  return `…${value.slice(-4)}`;
}
