import type { ChatMessage, CreateChatRunInput } from "../contracts/chat";
import type { ChatStreamEvent } from "../contracts/events";
import {
  SessionNotFoundError,
  type ChatSessionSummary,
} from "../contracts/session";
import type { ChatTransport } from "../contracts/transport";
import { parseFetchSse, type ParsedSseEvent } from "./fetch-sse-stream";
import {
  asRecord,
  parseCreatedRun,
  parseCreatedThread,
  parseHistory,
  parseRunResult,
  parseThreadList,
  readString,
} from "./xiaozhi-contract";

export interface XiaozhiTransportOptions {
  apiBaseUrl?: string;
  fetchFn?: typeof fetch;
  idFactory?: () => string;
}

const STOPPED_STATUSES = new Set([
  "aborted",
  "cancel_requested",
  "canceled",
  "cancelled",
  "stopped",
]);
const FAILED_STATUSES = new Set(["error", "failed"]);

export function createXiaozhiTransport(
  options: XiaozhiTransportOptions = {},
): ChatTransport {
  const apiBaseUrl = (options.apiBaseUrl ?? "/api/work-agent").replace(/\/+$/, "");
  const fetchFn = options.fetchFn ?? fetch;
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());

  async function createRun(
    input: CreateChatRunInput,
    signal?: AbortSignal,
  ) {
    if (input.mode !== "work") {
      throw new Error("Xiaozhi transport 仅用于工作场景");
    }
    if (hasSelections(input)) {
      throw new Error("工作智能体能力由服务端预配置，暂不支持逐次选择");
    }

    let sessionId = input.sessionId;
    if (!sessionId) {
      const response = await fetchFn(`${apiBaseUrl}/chat/thread`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ title: compactTitle(input.content) }),
        signal,
      });
      const payload = await readJson(response, "创建会话失败");
      sessionId = parseCreatedThread(payload).id;
    }

    const response = await fetchFn(`${apiBaseUrl}/agent/runs`, {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        query: input.content,
        thread_id: sessionId,
        meta: { request_id: idFactory() },
      }),
      signal,
    });
    const payload = await readJson(response, "创建任务失败");
    const run = parseCreatedRun(payload);
    if (run.threadId !== sessionId) {
      throw new Error("创建任务失败: 会话标识不匹配");
    }
    return { runId: run.runId, sessionId };
  }

  async function* streamRun(
    runId: string,
    signal?: AbortSignal,
  ): AsyncIterable<ChatStreamEvent> {
    let cursor: string | undefined;
    let emittedDelta = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (signal?.aborted) return;
      let response: Response;
      try {
        const url = new URL(
          `${apiBaseUrl}/agent/runs/${encodeURIComponent(runId)}/events`,
          "http://agent-hub.local",
        );
        if (cursor) url.searchParams.set("after_seq", cursor);
        const headers = new Headers({ accept: "text/event-stream" });
        if (cursor) headers.set("last-event-id", cursor);
        response = await fetchFn(relativeUrl(url), { headers, signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
      } catch {
        if (signal?.aborted) return;
        if (attempt === 0) continue;
        yield disconnected();
        return;
      }

      try {
        for await (const item of parseFetchSse(response, signal)) {
          if (item.id) cursor = item.id;

          const mapped = mapStreamItem(item);
          for (const event of mapped.events) {
            if (event.type === "answer.delta") emittedDelta = true;
            yield event;
          }
          if (!mapped.terminal) continue;

          if (mapped.status && STOPPED_STATUSES.has(mapped.status)) {
            yield { type: "run.stopped", reason: "生成已停止" };
            return;
          }
          if (mapped.failed || (mapped.status && FAILED_STATUSES.has(mapped.status))) {
            yield failed();
            return;
          }

          const resultResponse = await fetchFn(
            `${apiBaseUrl}/agent/runs/${encodeURIComponent(runId)}/result`,
            { signal },
          );
          const result = parseRunResult(
            await readJson(resultResponse, "读取任务结果失败"),
          );
          if (STOPPED_STATUSES.has(result.status)) {
            yield { type: "run.stopped", reason: "生成已停止" };
          } else if (FAILED_STATUSES.has(result.status)) {
            yield failed();
          } else if (emittedDelta) {
            yield { type: "answer.done" };
          } else if (result.output.trim()) {
            yield { type: "answer.done", content: result.output };
          } else {
            yield {
              type: "run.failed",
              message: "任务未返回可显示内容，请重试",
            };
          }
          return;
        }
      } catch {
        if (signal?.aborted) return;
        if (attempt === 0) continue;
        yield disconnected();
        return;
      }
    }

    if (!signal?.aborted) yield disconnected();
  }

  async function abortRun(runId: string): Promise<void> {
    const response = await fetchFn(
      `${apiBaseUrl}/agent/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" },
    );
    if (!response.ok) throw new Error(`停止任务失败: HTTP ${response.status}`);
  }

  return {
    kind: "xiaozhi",
    capabilities: { selections: false, answerDeltas: true, resume: false },
    createRun,
    streamRun,
    abortRun,
    sessions: {
      async listSessions(signal) {
        const response = await fetchFn(
          `${apiBaseUrl}/chat/threads?limit=500&offset=0`,
          { signal },
        );
        const threads = parseThreadList(
          await readJson(response, "读取会话列表失败"),
        );
        return threads.map((thread): ChatSessionSummary => ({
          id: thread.id,
          title: thread.title?.trim() || "新的对话",
          updatedAt: Date.parse(thread.updated_at),
          isPinned: thread.is_pinned,
        }));
      },
      async loadSession(sessionId, signal) {
        const response = await fetchFn(
          `${apiBaseUrl}/chat/thread/${encodeURIComponent(sessionId)}/history`,
          { signal },
        );
        if (response.status === 404) throw new SessionNotFoundError(sessionId);
        const history = parseHistory(
          await readJson(response, "读取会话历史失败"),
        );
        const messages = history.flatMap((message): ChatMessage[] => {
          const role = historyRole(message.type);
          if (!role) return [];
          return [{
            id: String(message.id),
            role,
            content: message.content,
            createdAt: message.created_at ? Date.parse(message.created_at) : 0,
          }];
        });
        const updatedAt = messages.reduce(
          (latest, message) => Math.max(latest, message.createdAt),
          0,
        );
        return {
          session: {
            id: sessionId,
            title: "历史会话",
            updatedAt,
            isPinned: false,
          },
          messages,
        };
      },
    },
  };
}

function hasSelections(input: CreateChatRunInput): boolean {
  return (
    input.selection.knowledgeBaseIds.length > 0 ||
    input.selection.skillIds.length > 0 ||
    input.selection.mcpServerIds.length > 0
  );
}

function compactTitle(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return Array.from(normalized || "新的对话").slice(0, 32).join("");
}

function mapStreamItem(item: ParsedSseEvent): {
  events: ChatStreamEvent[];
  terminal: boolean;
  failed: boolean;
  status?: string;
} {
  if (item.event === "error") {
    return { events: [], terminal: true, failed: true };
  }
  if (["cancel", "cancelled", "stop", "stopped"].includes(item.event)) {
    return { events: [], terminal: true, failed: false, status: "stopped" };
  }
  if (item.event === "end") {
    return {
      events: [],
      terminal: true,
      failed: false,
      status: eventStatus(item.data),
    };
  }
  if (item.event === "custom") {
    return {
      events: isEmptyAgentStateEvent(item.data)
        ? []
        : [{ type: "activity.update", label: "正在处理请求" }],
      terminal: false,
      failed: false,
    };
  }
  if (item.event !== "messages") {
    return { events: [], terminal: false, failed: false };
  }

  const events: ChatStreamEvent[] = [];
  for (const chunk of messageChunks(item.data)) {
    const streamEvent = asRecord(chunk.stream_event);
    const type = readString(streamEvent, "type");
    if (type === "message_delta") {
      const content = readString(streamEvent, "content");
      if (content) events.push({ type: "answer.delta", delta: content });
    }
    if (type === "tool_call" || type === "tool_call_delta") {
      const name = safeToolName(readString(streamEvent, "name"));
      events.push({ type: "activity.update", label: `正在调用${name}` });
    }
  }
  return { events, terminal: false, failed: false };
}

function messageChunks(value: unknown): Record<string, unknown>[] {
  const payload = asRecord(asRecord(value).payload);
  const result: Record<string, unknown>[] = [];
  if (Array.isArray(payload.items)) {
    for (const item of payload.items) result.push(asRecord(item));
  }
  if (payload.chunk) result.push(asRecord(payload.chunk));
  return result;
}

function eventStatus(value: unknown): string | undefined {
  const record = asRecord(value);
  return readString(asRecord(record.payload), "status") ?? readString(record, "status");
}

function isEmptyAgentStateEvent(value: unknown): boolean {
  const payload = asRecord(asRecord(value).payload);
  if (readString(payload, "name") !== "xiaozhi.agent_state") return false;
  const state = payload.agent_state ?? asRecord(payload.chunk).agent_state;
  return isEmptyValue(state);
}

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isEmptyValue);
  }
  return false;
}

function safeToolName(value: string | undefined): string {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? Array.from(normalized).slice(0, 32).join("") : "工具";
}

function historyRole(type: string): "user" | "assistant" | undefined {
  if (type === "human" || type === "user") return "user";
  if (type === "ai" || type === "assistant") return "assistant";
  return undefined;
}

async function readJson(response: Response, context: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${context}: HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new Error(`${context}: 响应不是有效 JSON`);
  }
}

function relativeUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function failed(): ChatStreamEvent {
  return { type: "run.failed", message: "任务执行失败，请稍后重试" };
}

function disconnected(): ChatStreamEvent {
  return {
    type: "run.disconnected",
    warning: "连接已断开，请手动重试",
  };
}
