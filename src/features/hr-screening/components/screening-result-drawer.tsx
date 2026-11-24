"use client";

import type {
  HrConversationState,
  HrScreeningBatch,
  HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";
import { CandidateDetail } from "./candidate-detail";

export function ScreeningResultDrawer({
  result,
  loading,
  invalid,
  candidates,
  activeCriteria,
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
  activeCriteria: HrConversationState["activeCriteria"];
  selectedCandidateId?: string;
  onSelectCandidate(candidateId: string): void;
  onClose(): void;
  onCancel(): void;
  onContinue(): void;
  onRetry(item: HrScreeningBatchItem): void;
  onExport(): void;
}) {
  const selected = result?.items.find(item => item.candidateId === selectedCandidateId) ?? result?.items[0];
  const matchingCriteria = activeCriteria?.criteriaVersionId === result?.batch.criteriaVersionId
    ? activeCriteria?.criteria : undefined;
  return (
    <aside aria-label="筛选结果" className="hr-panel" role="dialog">
      <header className="hr-panel-heading">
        <h2>筛选结果</h2>
        <button className="hr-button" aria-label="关闭结果" onClick={onClose} type="button">关闭</button>
      </header>
      {invalid ? <p>筛选结果链接无效</p> : loading || !result ? <p>正在加载筛选结果…</p> : (
        <>
          <p>共 {result.batch.totalCount} 人 · 完成 {result.batch.completedCount} · 失败 {result.batch.failedCount}</p>
          {!matchingCriteria ? <p className="hr-muted">此批次使用历史标准。标准名称见该批次 CSV。</p> : null}
          <div className="hr-actions">
            <button className="hr-button" onClick={onExport} type="button">导出 CSV</button>
            {["draft", "queued", "running"].includes(result.batch.status) ? (
              <button className="hr-button" onClick={onCancel} type="button">取消筛选批次</button>
            ) : null}
            {["partial", "failed", "cancelled"].includes(result.batch.status) ? (
              <button className="hr-button" onClick={onContinue} type="button">继续未完成筛选</button>
            ) : null}
          </div>
          <nav aria-label="候选人结果列表" className="hr-result-nav">
            <ul>
              {result.items.map(item => {
                const candidate = candidates.find(entry => entry.candidateId === item.candidateId);
                return (
                  <li key={item.itemId}>
                    <button aria-current={selected?.candidateId === item.candidateId ? "true" : undefined} className="hr-button" onClick={() => onSelectCandidate(item.candidateId)} type="button">
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
              criteria={matchingCriteria}
              item={selected}
              onRetry={onRetry}
            />
          ) : <p>候选人结果不存在</p>}
        </>
      )}
    </aside>
  );
}
