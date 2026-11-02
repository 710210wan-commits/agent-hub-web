import { describe, expect, it } from "vitest";

import {
  createProgressState,
  progressReducer,
  type ProgressAction,
} from "./progress-reducer";

function reduce(actions: ProgressAction[]) {
  return actions.reduce(progressReducer, createProgressState());
}

describe("progressReducer", () => {
  it("replaces repeated updates for one active stage instead of appending duplicates", () => {
    const state = reduce([
      { type: "stage.active", id: "query", label: "正在查询船舶" },
      { type: "stage.active", id: "query", label: "正在汇总 12 艘船舶" },
    ]);

    expect(state.stages).toEqual([
      { id: "query", label: "正在汇总 12 艘船舶", status: "running" },
    ]);
  });

  it("keeps stage order and closes the current stage once at the first terminal event", () => {
    const initial = createProgressState([
      { id: "detect", label: "识别火情" },
      { id: "satellite", label: "调取影像" },
      { id: "assessment", label: "评估态势" },
    ]);
    const actions: ProgressAction[] = [
      { type: "stage.active", id: "detect", label: "正在识别火情" },
      { type: "stage.active", id: "satellite", label: "正在调取影像" },
      { type: "run.failed" },
      { type: "run.completed" },
    ];
    const state = actions.reduce(progressReducer, initial);

    expect(state).toEqual({
      stages: [
        { id: "detect", label: "正在识别火情", status: "completed" },
        { id: "satellite", label: "正在调取影像", status: "failed" },
        { id: "assessment", label: "评估态势", status: "pending" },
      ],
      terminal: "failed",
    });
  });

  it.each([
    ["run.completed", "completed"],
    ["run.failed", "failed"],
    ["run.stopped", "stopped"],
  ] as const)("maps %s to the current stage status %s", (type, expected) => {
    const state = reduce([
      { type: "stage.active", id: "report", label: "正在生成报告" },
      { type },
    ]);

    expect(state.stages[0]?.status).toBe(expected);
    expect(state.terminal).toBe(expected);
  });

  it("stores only sanitized stage fields when input contains raw runtime data", () => {
    const unsafeAction = {
      type: "stage.active",
      id: "analysis",
      label: "正在评估态势",
      reasoning: "private chain of thought",
      toolInput: { secret: "raw input" },
      observation: "raw observation body",
      logFilePath: "S:/secret/task.jsonl",
    } as ProgressAction;
    const state = progressReducer(createProgressState(), unsafeAction);

    expect(state.stages).toEqual([
      { id: "analysis", label: "正在评估态势", status: "running" },
    ]);
    expect(JSON.stringify(state)).not.toContain("private chain of thought");
    expect(JSON.stringify(state)).not.toContain("raw input");
    expect(JSON.stringify(state)).not.toContain("raw observation body");
    expect(JSON.stringify(state)).not.toContain("task.jsonl");
  });
});
