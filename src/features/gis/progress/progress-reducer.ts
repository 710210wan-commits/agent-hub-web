import type {
  ProgressStageDefinition,
  ProgressState,
  ProgressTerminalStatus,
} from "./progress-state";

export type ProgressAction =
  | { type: "stage.active"; id: string; label: string }
  | { type: "stage.completed"; id: string; label?: string }
  | { type: "run.completed" }
  | { type: "run.failed" }
  | { type: "run.stopped" };

export function createProgressState(
  definitions: ProgressStageDefinition[] = [],
): ProgressState {
  return {
    stages: definitions.map(({ id, label }) => ({
      id,
      label,
      status: "pending",
    })),
    terminal: null,
  };
}

export function progressReducer(
  state: ProgressState,
  action: ProgressAction,
): ProgressState {
  if (state.terminal) return state;

  if (action.type === "stage.active") {
    const id = action.id.trim();
    const label = action.label.trim();
    if (!id || !label) return state;

    const stages = state.stages.map((stage) =>
      stage.status === "running" && stage.id !== id
        ? { ...stage, status: "completed" as const }
        : stage,
    );
    const index = stages.findIndex((stage) => stage.id === id);
    if (index === -1) {
      return {
        ...state,
        stages: [...stages, { id, label, status: "running" }],
      };
    }
    return {
      ...state,
      stages: stages.map((stage, stageIndex) =>
        stageIndex === index ? { id, label, status: "running" } : stage,
      ),
    };
  }

  if (action.type === "stage.completed") {
    const id = action.id.trim();
    if (!id) return state;
    const index = state.stages.findIndex((stage) => stage.id === id);
    if (index === -1) {
      const label = action.label?.trim();
      return label
        ? {
            ...state,
            stages: [...state.stages, { id, label, status: "completed" }],
          }
        : state;
    }
    return {
      ...state,
      stages: state.stages.map((stage, stageIndex) =>
        stageIndex === index
          ? {
              id: stage.id,
              label: action.label?.trim() || stage.label,
              status: "completed",
            }
          : stage,
      ),
    };
  }

  const terminal = terminalStatus(action.type);
  return {
    terminal,
    stages: state.stages.map((stage) =>
      stage.status === "running" ? { ...stage, status: terminal } : stage,
    ),
  };
}

function terminalStatus(type: ProgressAction["type"]): ProgressTerminalStatus {
  if (type === "run.failed") return "failed";
  if (type === "run.stopped") return "stopped";
  return "completed";
}
