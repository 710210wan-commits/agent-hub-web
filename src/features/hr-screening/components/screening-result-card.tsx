import type { HrScreeningBatch } from "@/features/assistants/contracts/generated";

export function ScreeningResultCard({ batch, onOpen }: {
  batch: HrScreeningBatch;
  onOpen(batchId: string): void;
}) {
  return (
    <section aria-label="筛选结果摘要" className="hr-panel">
      <h2>筛选结果</h2>
      <p>共 {batch.totalCount} 人 · 完成 {batch.completedCount} · 失败 {batch.failedCount}</p>
      <button className="hr-button" onClick={() => onOpen(batch.batchId)} type="button">查看完整结果</button>
    </section>
  );
}
