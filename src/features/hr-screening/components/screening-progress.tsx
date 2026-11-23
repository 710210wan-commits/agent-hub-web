import type { HrScreeningBatch } from "@/features/assistants/contracts/generated";

export interface ScreeningProgressValue {
  batchId: string;
  phase: string;
  completedCount: number;
  failedCount: number;
  totalCount: number;
}

const phaseLabels: Record<string, string> = {
  draft: "待开始",
  queued: "排队中",
  running: "正在筛选",
  completed: "筛选完成",
  partial: "部分完成",
  failed: "筛选失败",
  cancelled: "已取消",
};

export function ScreeningProgress({
  batch,
  progress,
}: {
  batch: HrScreeningBatch | null;
  progress?: ScreeningProgressValue | null;
}) {
  const current = progress && (!batch || progress.batchId === batch.batchId) ? progress : batch;
  if (!current) return null;
  const phase = "status" in current ? current.status : current.phase;
  return (
    <section aria-label="筛选进度" className="state-card" role="status">
      <strong>{phaseLabels[phase] ?? "正在处理"}</strong>
      <span>{current.completedCount}/{current.totalCount}</span>
      <span>失败 {current.failedCount}</span>
    </section>
  );
}
