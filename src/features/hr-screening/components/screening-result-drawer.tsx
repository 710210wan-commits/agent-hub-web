"use client";

import type {
  HrConversationState,
  HrCriterion,
  HrScreeningBatch,
  HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";
import { CandidateDetail } from "./candidate-detail";

export function ScreeningResultDrawer({
  result,
  loading,
  invalid,
  candidates,
  criteria,
  selectedCandidateId,
  onSelectCandidate,
  onClose,
  onCancel,
  onContinue,
  onRetry,
  onExport,
}: {
  result: { batch: HrScreeningBatch; items: HrScreeningBatchItem[] } | null;
  loading: boolean;
  invalid: boolean;
  candidates: HrConversationState["candidates"];
  criteria: HrCriterion[];
  selectedCandidateId?: string;
  onSelectCandidate(candidateId: string): void;
  onClose(): void;
  onCancel(): void;
  onContinue(): void;
  onRetry(item: HrScreeningBatchItem): void;
  onExport(): void;
}) {
  const selected = result?.items.find(item => item.candidateId === selectedCandidateId) ?? result?.items[0];
  return (
    <aside aria-label="筛选结果" aria-modal="true" className="state-card" role="dialog">
      <header>
        <h2>筛选结果</h2>
        <button aria-label="关闭结果" onClick={onClose} type="button">关闭</button>
      </header>
      {invalid ? <p>筛选结果链接无效</p> : loading || !result ? <p>正在加载筛选结果…</p> : (
        <>
          <p>共 {result.batch.totalCount} 人 · 完成 {result.batch.completedCount} · 失败 {result.batch.failedCount}</p>
          <div className="run-actions">
            <button onClick={onExport} type="button">导出 CSV</button>
            {["draft", "queued", "running"].includes(result.batch.status) ? (
              <button onClick={onCancel} type="button">取消筛选批次</button>
            ) : null}
            {["partial", "failed", "cancelled"].includes(result.batch.status) ? (
              <button onClick={onContinue} type="button">继续未完成筛选</button>
            ) : null}
          </div>
          <nav aria-label="候选人结果列表">
            <ul>
              {result.items.map(item => {
                const candidate = candidates.find(entry => entry.candidateId === item.candidateId);
                return (
                  <li key={item.itemId}>
                    <button onClick={() => onSelectCandidate(item.candidateId)} type="button">
                      {candidate?.displayName ?? "候选人"}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>
          {selected ? (
            <CandidateDetail
              candidate={candidates.find(candidate => candidate.candidateId === selected.candidateId)}
              criteria={criteria}
              item={selected}
              onRetry={onRetry}
            />
          ) : <p>候选人结果不存在</p>}
        </>
      )}
    </aside>
  );
}
