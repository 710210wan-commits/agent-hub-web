export type ProgressStageStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "stopped";

export type ProgressTerminalStatus = "completed" | "failed" | "stopped";
export type ProgressViewVariant = "a" | "b" | "c";
export type ProgressFixtureId =
  | "completed"
  | "failed"
  | "stopped"
  | "long-running";

export interface ProgressStageDefinition {
  id: string;
  label: string;
}

export interface ProgressStage extends ProgressStageDefinition {
  status: ProgressStageStatus;
}

export interface ProgressState {
  stages: ProgressStage[];
  terminal: ProgressTerminalStatus | null;
}

export const progressStatusLabel: Record<ProgressStageStatus, string> = {
  pending: "待处理",
  running: "进行中",
  completed: "已完成",
  failed: "失败",
  stopped: "已停止",
};
