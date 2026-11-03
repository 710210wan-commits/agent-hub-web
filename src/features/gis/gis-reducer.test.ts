import { describe, expect, it } from "vitest";

import type { GisUpdate } from "./contracts";
import { gisReducer } from "./gis-reducer";
import { createInitialGisState, type GisState } from "./gis-state";

function makeUpdate(
  taskId: string,
  key: string,
  name = "船只 A",
): GisUpdate {
  return {
    version: 1,
    taskId,
    key,
    gisData: {
      type: "entity",
      entities: [{
        id: key,
        name,
        type: "ship",
        coordinates: [120, 30],
        importance: "high",
        status: "normal",
      }],
    },
  };
}

function connect(taskId = "task-1"): GisState {
  const started = gisReducer(createInitialGisState(), { type: "resetForNewRun" });
  return gisReducer(started, { type: "runConnected", runId: taskId });
}

describe("gisReducer", () => {
  it("deduplicates by task and key, replaces in place and preserves distinct order", () => {
    let state = connect();
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1", "旧位置"),
    });
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-2", "船只 B"),
    });
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1", "新位置"),
    });

    expect(state.layers.map((layer) => layer.update.key)).toEqual(["key-1", "key-2"]);
    expect(state.layers[0].update.gisData).toMatchObject({
      entities: [{ name: "新位置" }],
    });
  });

  it("ignores updates belonging to another task", () => {
    const state = connect("task-1");
    const next = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-2", "key-1"),
    });

    expect(next).toBe(state);
    expect(next.layers).toEqual([]);
  });

  it("makes the first terminal state win and freezes later updates", () => {
    let state = connect();
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1"),
    });
    state = gisReducer(state, { type: "terminalSuccess", content: "最终结论" });
    const stopped = gisReducer(state, { type: "terminalStop", reason: "迟到停止" });
    const late = gisReducer(stopped, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-2"),
    });

    expect(late.status).toBe("completed");
    expect(late.answer).toBe("最终结论");
    expect(late.notice).toBeNull();
    expect(late.layers).toHaveLength(1);
    expect(late.progress.terminal).toBe("completed");
  });

  it("preserves completed layers on abort and ignores later replay", () => {
    let state = connect();
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1", "已完成图层"),
    });
    state = gisReducer(state, { type: "terminalStop", reason: "生成已停止" });
    const replayed = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1", "迟到覆盖"),
    });

    expect(replayed.status).toBe("stopped");
    expect(replayed.layers).toHaveLength(1);
    expect(replayed.layers[0].update.gisData).toMatchObject({
      entities: [{ name: "已完成图层" }],
    });
    expect(replayed.progress.terminal).toBe("stopped");
  });

  it("keeps explicitly retained results across runs and clears new transient layers", () => {
    let state = connect("task-1");
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "old-key", "历史结果"),
    });
    state = gisReducer(state, { type: "terminalSuccess", content: "历史正文" });
    state = gisReducer(state, { type: "keepResult" });
    state = gisReducer(state, { type: "resetForNewRun" });
    state = gisReducer(state, { type: "runConnected", runId: "task-2" });
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-2", "new-key", "本轮结果"),
    });
    state = gisReducer(state, { type: "resetForNewRun" });

    expect(state.layers).toHaveLength(1);
    expect(state.layers[0]).toMatchObject({
      kept: true,
      update: { taskId: "task-1", key: "old-key" },
    });
    expect(state.status).toBe("submitting");
    expect(state.answer).toBe("");
    expect(state.progress.stages).toEqual([]);
  });

  it("clears retained and transient layers on an explicit map clear", () => {
    let state = connect();
    state = gisReducer(state, {
      type: "applyGisUpdate",
      update: makeUpdate("task-1", "key-1"),
    });
    state = gisReducer(state, { type: "terminalSuccess", content: "完成" });
    state = gisReducer(state, { type: "keepResult" });
    state = gisReducer(state, { type: "clearMap" });

    expect(state.layers).toEqual([]);
  });

  it("stores only validated GIS fields and drops raw runtime internals", () => {
    const update = makeUpdate("task-1", "key-1");
    Object.assign(update.gisData, {
      reasoning: "secret chain",
      observation: "raw body",
    });
    const entities = update.gisData.entities as Array<Record<string, unknown>>;
    entities[0].rawArguments = "secret args";

    const state = gisReducer(connect(), { type: "applyGisUpdate", update });

    expect(state.layers).toHaveLength(1);
    expect(JSON.stringify(state.layers[0])).not.toMatch(
      /secret chain|raw body|secret args|rawArguments|reasoning|observation/,
    );
  });
});
