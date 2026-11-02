import type { GisStreamEvent, GisTransport, GisUpdate } from "../contracts";
import {
  eventSourceStream,
  type EventSourceFactory,
} from "../../chat/transports/event-source-stream";
import {
  asRecord,
  readString,
  type ProjectsNewEvent,
} from "../../chat/transports/projects-new-contract";
import { mapProjectsNewEvent } from "../../chat/transports/projects-new-transport";

interface ProjectsNewGisTransportOptions {
  apiBaseUrl: string;
  fetchFn?: typeof fetch;
  eventSourceFactory?: EventSourceFactory;
  idFactory?: () => string;
}

function projectGisUpdate(event: ProjectsNewEvent): GisUpdate | undefined {
  if (event.version !== 1) return undefined;
  const taskId = readString(event, "taskId");
  const key = readString(event, "key");
  const gisData = asRecord(event.gisData);
  if (!taskId || !key || Object.keys(gisData).length === 0) return undefined;

  const toolCallId = readString(event, "toolCallId");
  const toolName = readString(event, "toolName");
  return {
    version: 1,
    taskId,
    key,
    ...(toolCallId ? { toolCallId } : {}),
    ...(toolName ? { toolName } : {}),
    gisData,
  };
}

export function mapProjectsNewGisEvent(
  event: ProjectsNewEvent,
): GisStreamEvent[] {
  if (readString(event, "type") !== "gis_update") {
    return mapProjectsNewEvent(event);
  }
  const update = projectGisUpdate(event);
  return update ? [{ type: "gis.update", update }] : [];
}

export function createProjectsNewGisTransport(
  options: ProjectsNewGisTransportOptions,
): GisTransport {
  const fetchFn = options.fetchFn ?? fetch;
  const eventSourceFactory =
    options.eventSourceFactory ?? ((url: string) => new EventSource(url));
  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const sessionId = idFactory();
  const apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, "");

  async function abortRun(runId: string): Promise<void> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const fetchRequest = fetchFn(
      `${apiBaseUrl}/tasks/${encodeURIComponent(runId)}/abort`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      },
    );
    const response = await Promise.race([
      fetchRequest,
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => {
          controller.abort();
          resolve(null);
        }, 2_000);
      }),
    ]).finally(() => {
      if (timeout) clearTimeout(timeout);
    });
    if (!response) return;
    if (!response.ok) throw new Error(`停止任务失败: HTTP ${response.status}`);
  }

  return {
    kind: "projects-new",
    async createRun(input, signal) {
      const scenario = input.profile === "standard"
        ? { query: input.query, scenarioId: "gis-standard" }
        : { demoId: input.demoId, scenarioId: "gis-demo" };
      const response = await fetchFn(`${apiBaseUrl}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          ...scenario,
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
          void abortRun(runId).catch(() => undefined);
          yield {
            type: "run.disconnected",
            warning: "连接已断开，服务端任务可能仍在运行",
          };
          return;
        }

        try {
          const payload = asRecord(JSON.parse(item.data));
          for (const event of mapProjectsNewGisEvent(payload)) {
            yield event;
            if (
              event.type === "answer.done" ||
              event.type === "run.stopped" ||
              event.type === "run.failed"
            ) {
              return;
            }
          }
        } catch {
          // Ignore malformed events; a later valid public event may still arrive.
        }
      }
    },
    abortRun,
  };
}
