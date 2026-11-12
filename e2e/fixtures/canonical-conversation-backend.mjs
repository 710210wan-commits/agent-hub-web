import { randomUUID } from "node:crypto";
import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.CANONICAL_CONVERSATION_FIXTURE_PORT ?? 3203);
const cookieName = "dsi_app_session";
const requestId = "50000000-0000-4000-8000-000000000001";
const users = {
  alice: { id: "user-alice", displayName: "用户 A", sessionExpiresAt: "2030-01-01T00:00:00.000Z" },
  bob: { id: "user-bob", displayName: "用户 B", sessionExpiresAt: "2030-01-01T00:00:00.000Z" },
};

const state = {
  calls: [],
  sessions: new Map(),
  conversations: new Map(),
  streams: new Map(),
  kbStatus: null,
};

resetState();

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/__health") {
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "POST" && url.pathname === "/__reset") {
    resetState();
    sendJson(response, 200, { ok: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/__state") {
    sendJson(response, 200, publicState());
    return;
  }
  if (request.method === "POST" && url.pathname === "/__control") {
    await handleControl(await readJson(request), response);
    return;
  }
  if (url.pathname.startsWith("/auth/")) {
    await handleAuth(request, response, url);
    return;
  }

  const session = currentSession(request);
  state.calls.push({
    method: request.method,
    path: `${url.pathname}${url.search}`,
    protected: true,
    user: session?.kind === "full" ? session.userKey : session?.kind ?? "anonymous",
    lastEventId: request.headers["last-event-id"] ?? null,
  });
  if (!session || session.kind !== "full") {
    sendJson(response, 401, { error: "DSI session required" });
    return;
  }
  const userKey = session.userKey;
  if (url.pathname.startsWith("/api/kb/")) {
    handleKnowledge(response, userKey);
    return;
  }
  await handleConversation(request, response, url, userKey);
});

server.listen(port, host, () => {
  process.stdout.write(`canonical conversation fixture listening on http://${host}:${port}\n`);
});

function resetState() {
  closeAllStreams();
  state.calls.length = 0;
  state.sessions.clear();
  state.conversations = new Map([
    ["alice", new Map([[
      "10000000-0000-4000-8000-000000000001",
      createConversationRecord(
        "10000000-0000-4000-8000-000000000001",
        "Alice 历史会话",
      ),
    ]])],
    ["bob", new Map([[
      "10000000-0000-4000-8000-000000000002",
      createConversationRecord(
        "10000000-0000-4000-8000-000000000002",
        "Bob 历史会话",
      ),
    ]])],
  ]);
  state.kbStatus = null;
}

async function handleAuth(request, response, url) {
  if (request.method === "GET" && url.pathname === "/auth/xiaozhi-status") {
    const session = currentSession(request);
    if (!session) {
      sendJson(response, 401, { error: "DSI session required" });
      return;
    }
    if (session.kind === "demo") {
      sendJson(response, 200, { enabled: false, xiaozhiUrl: "" });
      return;
    }
    sendJson(response, 200, {
      enabled: true,
      xiaozhiUrl: "http://xiaozhi.fixture",
      user: users[session.userKey],
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/login") {
    const body = await readJson(request);
    const demo = body?.mode === "sms";
    const userKey = body?.username === "bob" ? "bob" : "alice";
    const sid = randomUUID();
    state.sessions.set(sid, demo ? { kind: "demo" } : { kind: "full", userKey });
    sendJson(
      response,
      200,
      {
        success: true,
        user: demo
          ? { id: "demo", displayName: "演示模式" }
          : users[userKey],
      },
      { "Set-Cookie": `${cookieName}=${sid}; Path=/; HttpOnly; SameSite=Lax` },
    );
    return;
  }

  if (request.method === "POST" && url.pathname === "/auth/logout") {
    const sid = readCookies(request)[cookieName];
    if (sid) state.sessions.delete(sid);
    sendJson(
      response,
      200,
      { ok: true },
      { "Set-Cookie": `${cookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax` },
    );
    return;
  }

  sendJson(response, 404, { error: "not_found" });
}

function handleKnowledge(response, userKey) {
  if (state.kbStatus) {
    const status = state.kbStatus;
    if (status === 401) {
      sendJson(response, 401, { error: "DSI session required" });
    } else {
      sendJson(response, 403, {
        code: 403,
        message: "请求来源校验失败，请联系管理员检查部署配置",
        data: null,
      });
    }
    return;
  }
  sendJson(response, 200, {
    success: true,
    databases: [{
      kb_id: `kb-${userKey}`,
      name: userKey === "alice" ? "Alice 私有知识库" : "Bob 私有知识库",
      description: "fixture knowledge base",
      type: "vector",
      supports_documents: true,
    }],
  });
}

async function handleConversation(request, response, url, userKey) {
  const conversations = state.conversations.get(userKey);

  if (request.method === "GET" && url.pathname === "/conversations") {
    sendJson(response, 200, {
      conversations: [...conversations.values()].map((item) => item.metadata),
      nextCursor: null,
    });
    return;
  }
  if (
    request.method === "POST" &&
    (url.pathname === "/conversations" || url.pathname === "/conversations/")
  ) {
    const body = await readJson(request);
    const existing = [...conversations.values()].find(
      (item) => item.createRequestId === body?.clientRequestId,
    );
    if (existing) {
      sendJson(response, 200, { conversation: existing.metadata, reused: true });
      return;
    }
    const conversationId = randomUUID();
    const item = createConversationRecord(
      conversationId,
      typeof body?.title === "string" ? body.title : "新的对话",
    );
    item.createRequestId = body?.clientRequestId;
    conversations.set(conversationId, item);
    sendJson(response, 201, { conversation: item.metadata, reused: false });
    return;
  }

  const match = url.pathname.match(
    /^\/conversations\/([^/]+)(?:\/(snapshot|messages|turns|events)(?:\/([^/]+))?(?:\/(cancel|stream))?)?$/,
  );
  if (!match) {
    sendJson(response, 404, { error: "not_found" });
    return;
  }
  const conversationId = decodeURIComponent(match[1]);
  const section = match[2];
  const nestedId = match[3];
  const tail = match[4];
  const item = conversations.get(conversationId);
  if (!item) {
    sendError(response, 404, "NOT_FOUND");
    return;
  }

  if (!section && request.method === "PATCH") {
    const body = await readJson(request);
    item.metadata.title = body?.title ?? item.metadata.title;
    item.metadata.version += 1;
    item.metadata.updatedAt = now();
    sendJson(response, 200, { conversation: item.metadata });
    return;
  }
  if (section === "snapshot" && request.method === "GET") {
    sendJson(response, 200, {
      conversation: item.metadata,
      activeTurn: item.activeTurn,
      messages: item.messages,
      nextCursor: null,
      lastEventSeq: item.metadata.lastEventSeq,
    });
    return;
  }
  if (section === "messages" && request.method === "GET") {
    sendJson(response, 200, {
      messages: item.messages,
      nextCursor: null,
      lastEventSeq: item.metadata.lastEventSeq,
    });
    return;
  }
  if (section === "turns" && !nestedId && request.method === "POST") {
    await submitTurn(item, await readJson(request), response);
    return;
  }
  if (section === "turns" && nestedId && tail === "cancel" && request.method === "POST") {
    cancelTurn(item, decodeURIComponent(nestedId), response);
    return;
  }
  if (section === "events" && !nestedId && !tail && request.method === "GET") {
    const afterSeq = BigInt(url.searchParams.get("afterSeq") ?? "0");
    const events = item.events.filter((event) => BigInt(event.eventSeq) > afterSeq);
    sendJson(response, 200, {
      events,
      nextAfterSeq: events.at(-1)?.eventSeq ?? afterSeq.toString(),
      lastEventSeq: item.metadata.lastEventSeq,
      hasMore: false,
    });
    return;
  }
  if (section === "events" && nestedId === "stream" && request.method === "GET") {
    openStream(response, item, url.searchParams.get("afterSeq") ?? "0");
    return;
  }

  sendJson(response, 405, { error: "method_not_allowed" });
}

async function submitTurn(item, body, response) {
  if (item.activeTurn && !isTerminal(item.activeTurn.status)) {
    sendError(response, 409, "TURN_IN_PROGRESS");
    return;
  }
  const reused = item.turnRequests.get(body?.clientRequestId);
  if (reused) {
    sendJson(response, 202, { ...reused, reused: true });
    return;
  }
  const turnIndex = String(item.turns.length + 1);
  const turnId = randomUUID();
  const taskId = randomUUID();
  const userMessage = createMessage(
    item,
    turnId,
    "user",
    body?.input?.text ?? "",
  );
  item.messages.push(userMessage);
  appendEvent(item, "message.created", { message: userMessage }, {
    turnId,
    taskId,
    messageId: userMessage.messageId,
  });
  const acceptedEventSeq = String(BigInt(item.metadata.lastEventSeq) + 1n);
  const turn = {
    turnId,
    taskId,
    turnIndex,
    status: "queued",
    acceptedEventSeq,
    errorCode: null,
  };
  item.activeTurn = turn;
  item.turns.push(turn);
  item.metadata.lastTurnIndex = turnIndex;
  appendEvent(item, "turn.queued", { turn, userMessageId: userMessage.messageId }, {
    turnId,
    taskId,
  });
  const receipt = {
    conversationId: item.metadata.conversationId,
    turnId,
    taskId,
    userMessageId: userMessage.messageId,
    acceptedEventSeq,
    status: "queued",
    reused: false,
  };
  item.turnRequests.set(body?.clientRequestId, receipt);
  sendJson(response, 202, receipt);
}

function cancelTurn(item, turnId, response) {
  const turn = item.turns.find((candidate) => candidate.turnId === turnId);
  if (!turn) {
    sendError(response, 404, "NOT_FOUND");
    return;
  }
  if (!isTerminal(turn.status)) {
    turn.status = "cancelling";
    item.activeTurn = turn;
    appendEvent(item, "turn.cancelling", { turn }, {
      turnId: turn.turnId,
      taskId: turn.taskId,
    });
    setTimeout(() => {
      if (turn.status !== "cancelling") return;
      turn.status = "interrupted";
      item.activeTurn = turn;
      appendEvent(item, "turn.interrupted", { turn }, {
        turnId: turn.turnId,
        taskId: turn.taskId,
      });
    }, 100);
  }
  sendJson(response, 202, { turn });
}

async function handleControl(body, response) {
  if (body?.action === "next-kb-status" && [401, 403].includes(body.status)) {
    state.kbStatus = body.status;
    if (body.status === 401) state.sessions.clear();
    sendJson(response, 200, { ok: true });
    return;
  }
  const item = findConversation(body?.conversationId);
  if (!item) {
    sendJson(response, 404, { error: "conversation_not_found" });
    return;
  }
  if (body?.action === "disconnect") {
    closeStreams(item.metadata.conversationId);
    sendJson(response, 200, { ok: true });
    return;
  }
  if (body?.action === "advance") {
    advance(item, body.phase, body.answer);
    sendJson(response, 200, { ok: true });
    return;
  }
  sendJson(response, 400, { error: "invalid_control" });
}

function advance(item, phase, answer) {
  const turn = item.activeTurn;
  if (!turn || isTerminal(turn.status)) return;
  if (phase === "started") {
    if (turn.status === "queued") {
      turn.status = "running";
      appendEvent(item, "turn.started", { turn }, {
        turnId: turn.turnId,
        taskId: turn.taskId,
      });
    }
    return;
  }
  if (phase === "tool") {
    if (turn.status === "queued") advance(item, "started");
    appendEvent(item, "tool.started", {
      stepId: randomUUID(),
      toolCallId: "SECRET_TOOL_CALL",
      toolName: "SECRET_TOOL_NAME",
    }, { turnId: turn.turnId, taskId: turn.taskId });
    return;
  }
  if (phase === "complete") {
    if (turn.status === "queued") advance(item, "started");
    const assistant = createMessage(
      item,
      turn.turnId,
      "assistant",
      typeof answer === "string" ? answer : "fixture 最终正文",
    );
    item.messages.push(assistant);
    appendEvent(item, "message.created", { message: assistant }, {
      turnId: turn.turnId,
      taskId: turn.taskId,
      messageId: assistant.messageId,
    });
    turn.status = "completed";
    appendEvent(item, "turn.completed", {
      turn,
      messageId: assistant.messageId,
    }, {
      turnId: turn.turnId,
      taskId: turn.taskId,
      messageId: assistant.messageId,
    });
  }
}

function openStream(response, item, afterSeq) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders();
  for (const event of item.events) {
    if (BigInt(event.eventSeq) > BigInt(afterSeq)) writeEvent(response, event);
  }
  const streams = state.streams.get(item.metadata.conversationId) ?? new Set();
  streams.add(response);
  state.streams.set(item.metadata.conversationId, streams);
  response.on("close", () => streams.delete(response));
}

function appendEvent(item, type, payload, extra = {}) {
  const eventSeq = String(BigInt(item.metadata.lastEventSeq) + 1n);
  const event = {
    eventId: randomUUID(),
    eventSeq,
    conversationId: item.metadata.conversationId,
    schemaVersion: 1,
    type,
    occurredAt: now(),
    payload: structuredClone(payload),
    ...extra,
  };
  item.events.push(event);
  item.metadata.lastEventSeq = eventSeq;
  item.metadata.updatedAt = event.occurredAt;
  for (const stream of state.streams.get(item.metadata.conversationId) ?? []) {
    writeEvent(stream, event);
  }
  return event;
}

function writeEvent(response, event) {
  response.write(`: fixture heartbeat\nevent: ${event.type}\nid: ${event.conversationId}:${event.eventSeq}\ndata: ${JSON.stringify(event)}\n\n`);
}

function createConversationRecord(conversationId, title) {
  const timestamp = now();
  return {
    metadata: {
      conversationId,
      scenarioId: "daily",
      agentKey: "agent-loop",
      title,
      status: "open",
      archivedAt: null,
      version: 1,
      lastEventSeq: "0",
      lastTurnIndex: "0",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    messages: [],
    events: [],
    turns: [],
    activeTurn: null,
    turnRequests: new Map(),
    createRequestId: null,
  };
}

function createMessage(item, turnId, role, text) {
  return {
    messageId: randomUUID(),
    conversationId: item.metadata.conversationId,
    turnId,
    ordinal: String(item.messages.length + 1),
    role,
    content: { kind: "text", text },
    revision: 1,
    status: "committed",
    artifactRefs: [],
    createdAt: now(),
  };
}

function currentSession(request) {
  const sid = readCookies(request)[cookieName];
  return sid ? state.sessions.get(sid) : undefined;
}

function readCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie ?? "")
      .split(";")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), entry.slice(index + 1)];
      }),
  );
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : {};
}

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, status, code) {
  sendJson(response, status, {
    error: { code, message: "PRIVATE_FIXTURE_DETAIL", requestId },
  });
}

function closeStreams(conversationId) {
  for (const stream of state.streams.get(conversationId) ?? []) stream.end();
  state.streams.delete(conversationId);
}

function closeAllStreams() {
  for (const conversationId of state.streams.keys()) closeStreams(conversationId);
}

function findConversation(conversationId) {
  for (const conversations of state.conversations.values()) {
    const item = conversations.get(conversationId);
    if (item) return item;
  }
  return undefined;
}

function publicState() {
  return {
    calls: state.calls,
    conversations: [...state.conversations.values()].flatMap((items) =>
      [...items.values()].map((item) => ({
        conversationId: item.metadata.conversationId,
        turnCount: item.turns.length,
        messageCount: item.messages.length,
        streamCount: state.streams.get(item.metadata.conversationId)?.size ?? 0,
        activeTurnStatus: item.activeTurn?.status ?? null,
      })),
    ),
  };
}

function isTerminal(status) {
  return ["completed", "failed", "interrupted"].includes(status);
}

function now() {
  return new Date().toISOString();
}

function shutdown() {
  closeAllStreams();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
