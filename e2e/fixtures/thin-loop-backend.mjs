import http from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.THIN_LOOP_FIXTURE_PORT ?? 3201);
const calls = [];
const streams = new Map();
const suppressedCloseEvents = new WeakSet();

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  return body ? JSON.parse(body) : null;
}

function writeEvent(response, event) {
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function clearStream(taskId, stream) {
  if (streams.get(taskId) === stream) streams.delete(taskId);
}

function closeAllStreamsForReset() {
  for (const [taskId, stream] of streams) {
    suppressedCloseEvents.add(stream.response);
    clearStream(taskId, stream);
    stream.response.end();
  }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);

  if (request.method === "GET" && url.pathname === "/__health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && url.pathname === "/__reset") {
    closeAllStreamsForReset();
    calls.length = 0;
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname === "/__calls") {
    sendJson(response, 200, { calls });
    return;
  }

  const advanceMatch = url.pathname.match(/^\/__advance\/([^/]+)\/(tool|complete)$/);
  if (request.method === "POST" && advanceMatch) {
    const taskId = decodeURIComponent(advanceMatch[1]);
    const phase = advanceMatch[2];
    const stream = streams.get(taskId);
    if (!stream) {
      sendJson(response, 409, { error: "stream_not_connected" });
      return;
    }
    if (phase === "tool") {
      writeEvent(stream.response, {
        type: "tool_call",
        displayName: "风险分析",
        reasoning: "SECRET_REASONING_SHOULD_NOT_RENDER",
      });
    } else {
      writeEvent(stream.response, {
        type: "loop_stop",
        result: {
          stoppedBy: "completed",
          finalAnswer: "**最终结论**\n\n- 风险可控",
          reasoning: "SECRET_REASONING_SHOULD_NOT_RENDER",
          toolTrace: "SECRET_TOOL_OUTPUT_SHOULD_NOT_RENDER",
        },
      });
      stream.response.end();
    }
    sendJson(response, 200, { taskId, phase });
    return;
  }

  if (request.method === "POST" && url.pathname === "/tasks") {
    const body = await readJson(request);
    calls.push({ method: request.method, path: url.pathname, body });
    const taskId = body?.query?.includes("停止") ? "task-abort" : "task-complete";
    sendJson(response, 201, { taskId, status: "running" });
    return;
  }

  const streamMatch = url.pathname.match(/^\/tasks\/([^/]+)\/stream$/);
  if (request.method === "GET" && streamMatch) {
    const taskId = decodeURIComponent(streamMatch[1]);
    calls.push({ method: request.method, path: url.pathname });
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();

    const stream = { response };
    streams.set(taskId, stream);
    response.on("close", () => {
      clearStream(taskId, stream);
      if (!suppressedCloseEvents.has(response)) {
        calls.push({ kind: "sse-close", path: url.pathname });
      }
    });

    writeEvent(response, { type: "connected", taskId });
    return;
  }

  const abortMatch = url.pathname.match(/^\/tasks\/([^/]+)\/abort$/);
  if (request.method === "POST" && abortMatch) {
    const taskId = decodeURIComponent(abortMatch[1]);
    calls.push({ method: request.method, path: url.pathname });
    const stream = streams.get(taskId);
    if (stream) stream.response.end();
    sendJson(response, 200, { taskId, status: "aborted" });
    return;
  }

  sendJson(response, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  process.stdout.write(`thin-loop fixture listening on http://${host}:${port}\n`);
});

function shutdown() {
  closeAllStreamsForReset();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
