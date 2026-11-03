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

function FakeMapCanvas({
  onRendererReady,
  children,
}: {
  onRendererReady?: (renderer: typeof mapRenderer | null) => void;
  children?: ReactNode;
}) {
  useEffect(() => {
    onRendererReady?.(mapRenderer);
    return () => onRendererReady?.(null);
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

describe("GisStandardWorkspace", () => {
  beforeEach(() => {
    Object.values(mapRenderer).forEach((spy) => spy.mockClear());
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
});
