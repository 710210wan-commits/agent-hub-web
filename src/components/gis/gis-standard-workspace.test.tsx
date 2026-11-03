import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GisStreamEvent, GisTransport, GisUpdate } from "@/features/gis/contracts";

import { GisStandardWorkspace } from "./gis-standard-workspace";

const mapRenderer = vi.hoisted(() => ({
  apply: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  destroy: vi.fn(),
}));

type ReadyCallback = (renderer: typeof mapRenderer | null) => void;
const mapHarness: { autoReady: boolean; onReady?: ReadyCallback } = {
  autoReady: true,
};

function FakeMapCanvas({
  onRendererReady,
  children,
}: {
  onRendererReady?: ReadyCallback;
  children?: ReactNode;
}) {
  useEffect(() => {
    mapHarness.onReady = onRendererReady;
    if (mapHarness.autoReady) onRendererReady?.(mapRenderer);
    return () => {
      if (mapHarness.onReady === onRendererReady) mapHarness.onReady = undefined;
      onRendererReady?.(null);
    };
  }, [onRendererReady]);
  return <section aria-label="地图画布">{children}</section>;
}

vi.mock("./map-canvas-slot", () => ({ MapCanvasSlot: FakeMapCanvas }));

const gisUpdate: GisUpdate = {
  version: 1,
  taskId: "task-1",
  key: "task-1:call-1",
  gisData: {
    type: "region",
    regions: [{
      id: "region-1",
      name: "东海监测区",
      type: "monitor",
      coordinates: [[120, 30], [121, 30], [121, 31]],
    }],
  },
};

function updateFor(taskId: string, key: string): GisUpdate {
  return { ...gisUpdate, taskId, key };
}

function makeTransport(events: GisStreamEvent[]) {
  const createRun = vi.fn(async () => ({ runId: "task-1" }));
  const transport: GisTransport & { createRun: typeof createRun } = {
    kind: "projects-new",
    createRun,
    streamRun: async function* () {
      for (const event of events) yield event;
    },
    abortRun: vi.fn(async () => undefined),
  };
  return transport;
}

function submit(query = "查询东海船舶") {
  fireEvent.change(screen.getByRole("textbox", { name: "GIS 问题" }), {
    target: { value: query },
  });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function deferredValue<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("GisStandardWorkspace", () => {
  beforeEach(() => {
    Object.values(mapRenderer).forEach((spy) => spy.mockClear());
    mapHarness.autoReady = true;
    mapHarness.onReady = undefined;
  });

  it("runs a standard query through safe progress, map updates and final text", async () => {
    const transport = makeTransport([
      { type: "run.connected", runId: "task-1" },
      { type: "activity.update", label: "正在查询船舶" },
      { type: "gis.update", update: gisUpdate },
      { type: "answer.done", content: "东海查询完成" },
    ]);
    render(<GisStandardWorkspace transport={transport} />);

    submit();

    expect(await screen.findByText("东海查询完成")).toBeInTheDocument();
    expect(transport.createRun).toHaveBeenCalledWith(
      { profile: "standard", query: "查询东海船舶" },
      expect.any(AbortSignal),
    );
    expect(
      screen.getByTestId("progress-variant-b").querySelector(".progress-timeline-current"),
    ).toHaveTextContent("正在查询船舶");
    expect(screen.getByText("图层更新 1 项")).toBeInTheDocument();
    expect(mapRenderer.apply).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      key: "task-1:call-1",
    }));
    expect(screen.queryByText(/演示卡片|Skill 选择|日常模式|办公模式/)).not.toBeInTheDocument();
  });

  it("stops the active run and ignores late map and answer events", async () => {
    const release = deferred();
    const transport = makeTransport([]);
    transport.streamRun = async function* () {
      yield { type: "activity.update", label: "正在调用区域查询" } as const;
      await release.promise;
      yield { type: "gis.update", update: gisUpdate } as const;
      yield { type: "answer.done", content: "迟到正文" } as const;
    };
    render(<GisStandardWorkspace transport={transport} />);

    submit();
    await waitFor(() => {
      expect(
        screen.getByTestId("progress-variant-b").querySelector(".progress-timeline-current"),
      ).toHaveTextContent("正在调用区域查询");
    });
    fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
    expect(transport.abortRun).toHaveBeenCalledWith("task-1");
    expect(screen.getByText("生成已停止")).toBeInTheDocument();

    await act(async () => {
      release.resolve();
    });

    expect(screen.queryByText("迟到正文")).not.toBeInTheDocument();
    expect(mapRenderer.apply).not.toHaveBeenCalled();
    expect(screen.getByText("图层更新 0 项")).toBeInTheDocument();
  });

  it("keeps results, clears the map and regenerates the last standard query", async () => {
    const transport = makeTransport([
      { type: "gis.update", update: gisUpdate },
      { type: "answer.done", content: "可保留的结果" },
    ]);
    render(<GisStandardWorkspace transport={transport} />);
    submit();
    expect(await screen.findByText("可保留的结果")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "保留结果" }));
    expect(screen.getByText(/已保留 1 项/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空地图" }));
    expect(screen.getByText("图层更新 0 项")).toBeInTheDocument();
    expect(mapRenderer.clear).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    await waitFor(() => expect(transport.createRun).toHaveBeenCalledTimes(2));
    expect(transport.createRun).toHaveBeenLastCalledWith(
      { profile: "standard", query: "查询东海船舶" },
      expect.any(AbortSignal),
    );
    expect(await screen.findByText("可保留的结果")).toBeInTheDocument();
  });

  it("aborts a late-created task after stop without opening its stream", async () => {
    const created = deferredValue<{ runId: string }>();
    const transport = makeTransport([]);
    transport.createRun.mockImplementation(() => created.promise);
    const streamRun = vi.fn(async function* () {});
    transport.streamRun = streamRun;
    render(<GisStandardWorkspace transport={transport} />);

    submit();
    fireEvent.click(screen.getByRole("button", { name: "停止任务" }));
    expect(screen.getByText("生成已停止")).toBeInTheDocument();

    await act(async () => {
      created.resolve({ runId: "task-late" });
    });

    await waitFor(() => expect(transport.abortRun).toHaveBeenCalledWith("task-late"));
    expect(streamRun).not.toHaveBeenCalled();
    expect(screen.getByText("生成已停止")).toBeInTheDocument();
  });

  it("replays sanitized state when the renderer becomes ready after completion", async () => {
    mapHarness.autoReady = false;
    const transport = makeTransport([
      { type: "gis.update", update: gisUpdate },
      { type: "answer.done", content: "早于地图完成" },
    ]);
    render(<GisStandardWorkspace transport={transport} />);
    submit();

    expect(await screen.findByText("早于地图完成")).toBeInTheDocument();
    expect(mapRenderer.apply).not.toHaveBeenCalled();

    act(() => mapHarness.onReady?.(mapRenderer));

    expect(mapRenderer.clear).toHaveBeenCalledOnce();
    expect(mapRenderer.apply).toHaveBeenCalledOnce();
    expect(mapRenderer.apply).toHaveBeenCalledWith(expect.objectContaining({
      taskId: "task-1",
      key: "task-1:call-1",
    }));
  });

  it("keeps retained layers across runs and ignores an old stream after the new terminal", async () => {
    const oldStream = deferred();
    const transport = makeTransport([]);
    transport.createRun
      .mockResolvedValueOnce({ runId: "task-1" })
      .mockResolvedValueOnce({ runId: "task-2" })
      .mockResolvedValueOnce({ runId: "task-3" });
    transport.streamRun = async function* (runId: string) {
      if (runId === "task-1") {
        yield { type: "gis.update", update: updateFor("task-1", "task-1:kept") } as const;
        yield { type: "answer.done", content: "旧任务正文" } as const;
        await oldStream.promise;
        yield {
          type: "gis.update",
          update: updateFor("task-1", "task-1:late"),
        } as const;
        yield { type: "answer.done", content: "旧任务迟到正文" } as const;
        yield { type: "run.disconnected", warning: "旧任务断线" } as const;
      } else if (runId === "task-2") {
        yield { type: "gis.update", update: updateFor("task-2", "task-2:transient") } as const;
        yield { type: "answer.done", content: "新任务正文" } as const;
      }
    };
    render(<GisStandardWorkspace transport={transport} />);

    submit();
    expect(await screen.findByText("旧任务正文")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保留结果" }));
    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    expect(await screen.findByText("新任务正文")).toBeInTheDocument();
    expect(screen.getByText("图层更新 2 项")).toBeInTheDocument();
    expect(mapRenderer.remove).not.toHaveBeenCalled();

    await act(async () => {
      oldStream.resolve();
    });
    expect(screen.getByText("新任务正文")).toBeInTheDocument();
    expect(screen.queryByText("旧任务迟到正文")).not.toBeInTheDocument();
    expect(screen.queryByText("旧任务断线")).not.toBeInTheDocument();
    expect(mapRenderer.apply).not.toHaveBeenCalledWith(expect.objectContaining({
      key: "task-1:late",
    }));

    fireEvent.click(screen.getByRole("button", { name: "重新生成" }));
    await waitFor(() => expect(transport.createRun).toHaveBeenCalledTimes(3));
    expect(mapRenderer.remove).toHaveBeenCalledOnce();
    expect(mapRenderer.remove).toHaveBeenCalledWith("task-2:transient");
    expect(mapRenderer.remove).not.toHaveBeenCalledWith("task-1:kept");
    expect(screen.getByText("图层更新 1 项")).toBeInTheDocument();
  });

  it("delivers final text after rejecting a malformed GIS update", async () => {
    const malformed = updateFor("task-1", "task-1:invalid");
    const regions = malformed.gisData.regions as Array<{ coordinates: number[][] }>;
    regions[0].coordinates = [[181, 30], [121, 30], [121, 31]];
    const transport = makeTransport([
      { type: "gis.update", update: malformed },
      { type: "answer.done", content: "最终正文不受影响" },
    ]);
    render(<GisStandardWorkspace transport={transport} />);

    submit();

    expect(await screen.findByText("最终正文不受影响")).toBeInTheDocument();
    expect(mapRenderer.apply).not.toHaveBeenCalled();
    expect(screen.getByText("图层更新 0 项")).toBeInTheDocument();
  });
});
