import type { ProgressAction } from "./progress-reducer";
import type {
  ProgressFixtureId,
  ProgressStageDefinition,
} from "./progress-state";

export interface ProgressFixture {
  id: ProgressFixtureId;
  title: string;
  description: string;
  stages: ProgressStageDefinition[];
  events: ProgressAction[];
}

const fireStages: ProgressStageDefinition[] = [
  { id: "detect", label: "识别火情" },
  { id: "satellite", label: "调取影像" },
  { id: "assessment", label: "评估态势" },
  { id: "report", label: "生成报告" },
];

const fixtures: Record<ProgressFixtureId, ProgressFixture> = {
  completed: {
    id: "completed",
    title: "完成态",
    description: "四个演示阶段全部完成，适合比较结果收束后的信息密度。",
    stages: fireStages,
    events: [
      { type: "stage.active", id: "detect", label: "正在识别火情" },
      { type: "stage.active", id: "satellite", label: "正在调取影像" },
      { type: "stage.active", id: "assessment", label: "正在评估态势" },
      { type: "stage.active", id: "report", label: "正在生成报告" },
      { type: "run.completed" },
    ],
  },
  failed: {
    id: "failed",
    title: "失败态",
    description: "影像调取失败，后续步骤保持待处理。",
    stages: fireStages,
    events: [
      { type: "stage.active", id: "detect", label: "正在识别火情" },
      { type: "stage.active", id: "satellite", label: "正在调取影像" },
      { type: "run.failed" },
    ],
  },
  stopped: {
    id: "stopped",
    title: "中断态",
    description: "用户中断影像调取；已完成步骤保留。",
    stages: fireStages,
    events: [
      { type: "stage.active", id: "detect", label: "正在识别火情" },
      { type: "stage.active", id: "satellite", label: "正在调取影像" },
      { type: "run.stopped" },
    ],
  },
  "long-running": {
    id: "long-running",
    title: "长时运行",
    description: "长标签和持续运行状态，用于检查遮挡、换行与视觉耐受度。",
    stages: fireStages,
    events: [
      { type: "stage.active", id: "detect", label: "正在识别火情" },
      { type: "stage.active", id: "satellite", label: "正在调取影像" },
      {
        type: "stage.active",
        id: "assessment",
        label: "正在综合卫星影像、气象条件与地面回传信息评估火势蔓延趋势",
      },
    ],
  },
};

export const progressFixtureOptions = Object.values(fixtures).map(
  ({ id, title }) => ({ id, title }),
);

export function getProgressFixture(id: ProgressFixtureId): ProgressFixture {
  return fixtures[id];
}
