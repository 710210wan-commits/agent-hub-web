import type { GisUpdate } from "./contracts";
import { gisDataSchema } from "./map/gis-data-schema";
import { createProgressState, progressReducer } from "./progress/progress-reducer";
import type {
  GisRunStatus,
  GisState,
} from "./gis-state";

export type GisAction =
  | { type: "resetForNewRun" }
  | { type: "runConnected"; runId: string }
  | { type: "activityUpdate"; label: string }
  | { type: "applyGisUpdate"; update: GisUpdate }
  | { type: "terminalSuccess"; content: string }
  | { type: "terminalFailure"; message: string }
  | { type: "terminalStop"; reason: string }
  | { type: "terminalDisconnect"; warning: string }
  | { type: "keepResult" }
  | { type: "clearMap" };

function isTerminal(status: GisRunStatus): boolean {
  return ["completed", "failed", "stopped", "disconnected"].includes(status);
}

function layerId(update: GisUpdate): string {
  return `${update.taskId}\0${update.key}`;
}

function sanitizeUpdate(update: GisUpdate): GisUpdate | null {
  if (
    update.version !== 1 ||
    !update.taskId.trim() ||
    !update.key.trim()
  ) {
    return null;
  }
  const parsed = gisDataSchema.safeParse(update.gisData);
  if (!parsed.success) return null;
  return {
    version: 1,
    taskId: update.taskId,
    key: update.key,
    ...(update.toolCallId ? { toolCallId: update.toolCallId } : {}),
    ...(update.toolName ? { toolName: update.toolName } : {}),
    gisData: parsed.data,
  };
}

function terminalState(
  state: GisState,
  status: GisRunStatus,
  notice: string | null,
  answer = state.answer,
): GisState {
  if (state.status === "idle" || isTerminal(state.status)) return state;
  const progressAction = status === "completed"
    ? { type: "run.completed" } as const
    : status === "failed"
      ? { type: "run.failed" } as const
      : { type: "run.stopped" } as const;
  return {
    ...state,
    status,
    answer,
    notice,
    progress: progressReducer(state.progress, progressAction),
  };
}

export function gisReducer(state: GisState, action: GisAction): GisState {
  switch (action.type) {
    case "resetForNewRun":
      return {
        status: "submitting",
        runId: null,
        activeTaskId: null,
        answer: "",
        notice: null,
        progress: createProgressState(),
        layers: state.layers.filter((layer) => layer.kept),
      };
    case "runConnected":
      if (state.status !== "submitting" || !action.runId.trim()) return state;
      return {
        ...state,
        status: "working",
        runId: action.runId,
        activeTaskId: action.runId,
      };
    case "activityUpdate": {
      const label = action.label.trim();
      if (state.status !== "working" || !label) return state;
      return {
        ...state,
        progress: progressReducer(state.progress, {
          type: "stage.active",
          id: label,
          label,
        }),
      };
    }
    case "applyGisUpdate": {
      if (
        state.status !== "working" ||
        state.activeTaskId !== action.update.taskId
      ) {
        return state;
      }
      const update = sanitizeUpdate(action.update);
      if (!update) return state;
      const id = layerId(update);
      const index = state.layers.findIndex((layer) => layerId(layer.update) === id);
      if (index === -1) {
        return {
          ...state,
          layers: [...state.layers, { update, kept: false }],
        };
      }
      return {
        ...state,
        layers: state.layers.map((layer, layerIndex) =>
          layerIndex === index ? { update, kept: layer.kept } : layer
        ),
      };
    }
    case "terminalSuccess":
      return terminalState(state, "completed", null, action.content);
    case "terminalFailure":
      return terminalState(state, "failed", action.message);
    case "terminalStop":
      return terminalState(state, "stopped", action.reason);
    case "terminalDisconnect":
      return terminalState(state, "disconnected", action.warning);
    case "keepResult":
      if (!isTerminal(state.status) || state.layers.every((layer) => layer.kept)) {
        return state;
      }
      return {
        ...state,
        layers: state.layers.map((layer) => ({ ...layer, kept: true })),
      };
    case "clearMap":
      return state.layers.length === 0 ? state : { ...state, layers: [] };
  }
}
