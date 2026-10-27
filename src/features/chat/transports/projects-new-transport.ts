import type { ChatStreamEvent } from "../contracts/events";
import type { CreateChatRunInput } from "../contracts/chat";
import type { ChatTransport } from "../contracts/transport";
import {
  eventSourceStream,
  type EventSourceFactory,
} from "./event-source-stream";
import {
  asRecord,
  readString,
  type ProjectsNewEvent,
} from "./projects-new-contract";

interface ProjectsNewTransportOptions {
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
  eventSourceFactory?: EventSourceFactory;
  idFactory?: () => string;
}

function hasSelections(input: CreateChatRunInput): boolean {
  return (
    input.selection.knowledgeBaseIds.length > 0 ||
    input.selection.skillIds.length > 0 ||
    input.selection.mcpIds.length > 0
  );
}

function displayName(event: ProjectsNewEvent): string {
  return (
    readString(event, "displayName") ??
    readString(event, "toolName") ??
    "工具"
  );
}

export function mapProjectsNewEvent(event: ProjectsNewEvent): ChatStreamEvent[] {
  const type = readString(event, "type");
  switch (type) {
    case "connected": {
      const runId = readString(event, "taskId");
      return runId ? [{ type: "run.connected", runId }] : [];
    }
    case "agent_turn":
      return [{ type: "activity.update", label: "正在处理请求" }];
    case "memory_recall":
      return [{ type: "activity.update", label: "正在读取会话记忆" }];
    case "context_load": {
      const name = readString(event, "displayName") ?? "上下文";
      const phase = readString(event, "phase");
      return [
        {
          type: "activity.update",
          label: phase === "complete" ? `已读取${name}` : `正在读取${name}`,
        },
      ];
    }
    case "tool_call":
    case "tool_progress":
      return [
        { type: "activity.update", label: `正在调用${displayName(event)}` },
      ];
    case "tool_observation":
      return [
        { type: "activity.update", label: `已完成${displayName(event)}` },
      ];
    case "loop_stop": {
      const result = asRecord(event.result);
      const finalAnswer = readString(result, "finalAnswer") ?? "";
      const stoppedBy = readString(result, "stoppedBy");
      if (stoppedBy === "aborted") {
        return [{ type: "run.stopped", reason: "生成已停止" }];
      }
      if (stoppedBy === "model_error") {
        return [{ type: "run.failed", message: "任务执行失败，请稍后重试" }];
      }
      return [{ type: "answer.done", content: finalAnswer }];
    }
    default:
      return [];
  }
}

export function createProjectsNewTransport(
  options: ProjectsNewTransportOptions,
): ChatTransport {
  const fetchFn = options.fetchFn ?? fetch;
  const eventSourceFactory =
    options.eventSourceFactory ?? ((url: string) => new EventSource(url));
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const sessionId = idFactory();
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");

  async function abortRun(runId: string): Promise<void> {
    const response = await fetchFn(
      `${apiBaseUrl}/tasks/${encodeURIComponent(runId)}/abort`,
      { method: "POST", headers: { "Content-Type": "application/json" } },
    );
    if (!response.ok) throw new Error(`停止任务失败: HTTP ${response.status}`);
  }

  return {
    kind: "projects-new",
    capabilities: { selections: false, answerDeltas: false, resume: false },
    async createRun(input, signal) {
      if (hasSelections(input)) {
        throw new Error("当前后端尚未接入所选能力");
      }

      const response = await fetchFn(`${apiBaseUrl}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          query: input.content,
          userId: "agent-hub-web",
          sessionId,
          clientRequestId: idFactory(),
        }),
        signal,
      });
      if (!response.ok) throw new Error(`创建任务失败: HTTP ${response.status}`);
      const payload = asRecord(await response.json());
      const runId = readString(payload, "taskId");
      if (!runId) throw new Error("创建任务失败: 响应缺少 taskId");
      return { runId };
    },
    async *streamRun(runId, signal) {
      const url = `${apiBaseUrl}/tasks/${encodeURIComponent(runId)}/stream`;
      for await (const item of eventSourceStream(
        url,
        eventSourceFactory,
        signal,
      )) {
        if (item.type === "error") {
          await abortRun(runId).catch(() => undefined);
          yield {
            type: "run.disconnected",
            warning: "连接已断开，服务端任务可能仍在运行",
          };
          return;
        }

        try {
          const payload = asRecord(JSON.parse(item.data));
          for (const event of mapProjectsNewEvent(payload)) yield event;
        } catch {
          // Ignore malformed third-party events; the connection may still recover.
        }
      }
    },
    abortRun,
  };
}
