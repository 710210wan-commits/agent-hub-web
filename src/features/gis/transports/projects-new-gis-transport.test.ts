import { describe, expect, it, vi } from "vitest";

import type { GisStreamEvent } from "../contracts";
import type { EventSourceLike } from "../../chat/transports/event-source-stream";
import {
  createProjectsNewGisTransport,
  mapProjectsNewGisEvent,
} from "./projects-new-gis-transport";

class FakeEventSource implements EventSourceLike {
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  closed = false;

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }

  fail() {
    this.onerror?.(new Event("error"));
  }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function nextEvent(stream: AsyncIterable<GisStreamEvent>) {
  return stream[Symbol.asyncIterator]().next();
}

describe("projects-new GIS transport", () => {
  it("creates a standard GIS run with a query and the standard scenario", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ taskId: "task-standard", status: "running" }),
    );
    const transport = createProjectsNewGisTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => new FakeEventSource(),
      idFactory: () => "fixed-id",
    });

    await expect(
      transport.createRun({ profile: "standard", query: "查询东海船舶" }),
    ).resolves.toEqual({ runId: "task-standard" });
    expect(fetchFn).toHaveBeenCalledWith(
      "/agent-api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          query: "查询东海船舶",
          scenarioId: "gis-standard",
          userId: "agent-hub-web",
          sessionId: "fixed-id",
          clientRequestId: "fixed-id",
        }),
      }),
    );
  });

  it("creates a demo run with only the fixed demo id and demo scenario", async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({ taskId: "task-demo", status: "running" }),
    );
    const transport = createProjectsNewGisTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => new FakeEventSource(),
      idFactory: () => "fixed-id",
    });

    await transport.createRun({ profile: "demo", demoId: "oil-spill" });

    const request = fetchFn.mock.calls[0]?.[1];
    expect(request?.body).toBe(JSON.stringify({
      demoId: "oil-spill",
      scenarioId: "gis-demo",
      userId: "agent-hub-web",
      sessionId: "fixed-id",
      clientRequestId: "fixed-id",
    }));
    expect(String(request?.body)).not.toContain("query");
  });

  it("projects only the public GIS envelope and strips raw siblings", () => {
    const gisData = {
      type: "region",
      regions: [{
        id: "region-1",
        name: "测试区域",
        type: "monitor",
        coordinates: [[120, 30], [121, 30], [121, 31]],
      }],
    };
    const mapped = mapProjectsNewGisEvent({
      type: "gis_update",
      version: 1,
      taskId: "task-1",
      key: "task-1:call-1",
      toolCallId: "call-1",
      toolName: "RegionMark",
      gisData,
      observation: "raw observation",
      reasoning: "private reasoning",
      toolInput: { secret: true },
    });

    expect(mapped).toEqual([{
      type: "gis.update",
      update: {
        version: 1,
        taskId: "task-1",
        key: "task-1:call-1",
        toolCallId: "call-1",
        toolName: "RegionMark",
        gisData,
      },
    }]);
    expect(JSON.stringify(mapped)).not.toContain("raw observation");
    expect(JSON.stringify(mapped)).not.toContain("private reasoning");
    expect(JSON.stringify(mapped)).not.toContain("secret");
  });

  it("maps safe lifecycle and final-answer events through the chat contract", () => {
    expect(mapProjectsNewGisEvent({ type: "agent_turn" })).toEqual([
      { type: "activity.update", label: "正在处理请求" },
    ]);
    expect(mapProjectsNewGisEvent({
      type: "loop_stop",
      result: { finalAnswer: "最终可见正文", stoppedBy: "final_answer" },
    })).toEqual([{ type: "answer.done", content: "最终可见正文" }]);
  });

  it("emits a truthful disconnect and attempts abort", async () => {
    const source = new FakeEventSource();
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ ok: true }));
    const transport = createProjectsNewGisTransport({
      apiBaseUrl: "/agent-api",
      fetchFn,
      eventSourceFactory: () => source,
    });

    const pending = nextEvent(transport.streamRun("task-disconnected"));
    await Promise.resolve();
    source.fail();

    await expect(pending).resolves.toEqual({
      done: false,
      value: {
        type: "run.disconnected",
        warning: "连接已断开，服务端任务可能仍在运行",
      },
    });
    expect(source.closed).toBe(true);
    expect(fetchFn).toHaveBeenCalledWith(
      "/agent-api/tasks/task-disconnected/abort",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("closes after the first terminal event and ignores late GIS updates", async () => {
    const source = new FakeEventSource();
    const transport = createProjectsNewGisTransport({
      apiBaseUrl: "/agent-api",
      fetchFn: vi.fn<typeof fetch>(),
      eventSourceFactory: () => source,
    });
    const iterator = transport.streamRun("task-terminal")[Symbol.asyncIterator]();
    const first = iterator.next();
    await Promise.resolve();
    source.emit({
      type: "loop_stop",
      result: { finalAnswer: "最终正文", stoppedBy: "final_answer" },
    });

    await expect(first).resolves.toEqual({
      done: false,
      value: { type: "answer.done", content: "最终正文" },
    });
    source.emit({
      type: "gis_update",
      version: 1,
      taskId: "task-terminal",
      key: "task-terminal:late",
      gisData: { type: "region" },
    });
    await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });
    expect(source.closed).toBe(true);
  });
});
