import type { ChatStreamEvent } from "../contracts/events";

export type MockRunScenario =
  | "completed"
  | "stopped"
  | "disconnected"
  | "failed";

export const mockRunFixtures: Record<MockRunScenario, ChatStreamEvent[]> = {
  completed: [
    { type: "run.connected", runId: "mock-run-completed" },
    {
      type: "activity.update",
      label: "正在读取项目资料并调用内部数据服务",
      completedStepCount: 3,
    },
    { type: "answer.delta", delta: "综合现有资料，" },
    { type: "answer.delta", delta: "本周需重点关注三类风险。" },
    { type: "answer.done" },
  ],
  stopped: [
    { type: "run.connected", runId: "mock-run-stopped" },
    { type: "activity.update", label: "正在整理资料", completedStepCount: 2 },
    { type: "answer.delta", delta: "已生成的部分正文。" },
    { type: "run.stopped", reason: "生成已停止" },
  ],
  disconnected: [
    { type: "run.connected", runId: "mock-run-disconnected" },
    { type: "answer.delta", delta: "已保留的部分正文。" },
    {
      type: "run.disconnected",
      warning: "连接已断开，服务端任务可能仍在运行",
    },
  ],
  failed: [
    { type: "run.connected", runId: "mock-run-failed" },
    { type: "activity.update", label: "正在创建任务" },
    { type: "run.failed", message: "任务执行失败，请稍后重试" },
  ],
};
