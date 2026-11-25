"use client";

import { useEffect, useRef, useState } from "react";
import type {
  HrConversationState,
  HrScreeningBatch,
  HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";
import { CandidateDetail } from "./candidate-detail";

const tierLabels = {
  recommended: "推荐",
  manual_review: "待人工复核",
  not_matched: "暂不匹配",
} as const;
type Tier = keyof typeof tierLabels;
const tierOrder: Record<Tier, number> = { recommended: 0, manual_review: 1, not_matched: 2 };
const statusLabels: Record<HrScreeningBatchItem["status"], string> = {
  pending: "待评估",
  queued: "待评估",
  running: "评估中",
  completed: "未分档",
  failed: "评估失败",
  cancelled: "已取消",
};

function evidenceScore(item: HrScreeningBatchItem): number | null {
  if (item.status !== "completed" || item.assessments.length === 0) return null;
  const met = item.assessments.filter(assessment => assessment.decision === "meets" && assessment.evidence.length > 0).length;
  return Math.round(100 * met / item.assessments.length);
}

export function ScreeningResultDrawer({
  result,
  loading,
  invalid,
  candidates,
  activeCriteria,
  selectedCandidateId,
  onSelectCandidate,
  onClose,
  returnToSummary,
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
  returnToSummary?: boolean;
  onCancel(): void;
  onContinue(): void;
  onRetry(item: HrScreeningBatchItem): void;
  onExport(): void;
}) {
  const [filter, setFilter] = useState<Tier | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  const matchingCriteria = activeCriteria?.criteriaVersionId === result?.batch.criteriaVersionId
    ? activeCriteria?.criteria : undefined;
  const tierCounts: Record<Tier, number> = { recommended: 0, manual_review: 0, not_matched: 0 };
  const ranked = (result?.items ?? []).map(item => {
    const tier = item.status === "completed" ? item.advisoryTier : null;
    if (tier) tierCounts[tier] += 1;
    return { item, tier, rank: tier ? tierOrder[tier] : 3, score: evidenceScore(item) };
  }).sort((a, b) => a.rank - b.rank || (b.score ?? -1) - (a.score ?? -1));
  const visible = filter ? ranked.filter(row => row.tier === filter) : ranked;
  const selected = (visible.find(row => row.item.candidateId === selectedCandidateId) ?? visible[0])?.item;
  const candidatesById = new Map(candidates.map(candidate => [candidate.candidateId, candidate]));

  return (
    <dialog
      aria-label="筛选结果"
      className="hr-panel hr-result-dialog"
      onCancel={event => {
        event.preventDefault();
        onClose();
      }}
      ref={dialogRef}
    >
      <header className="hr-panel-heading">
        <h2>筛选结果</h2>
        <button className="hr-button" aria-label={returnToSummary ? "返回累计结果" : "关闭结果"}
          onClick={onClose} type="button">{returnToSummary ? "返回累计结果" : "关闭"}</button>
      </header>
      {invalid ? <p>筛选结果链接无效</p> : loading || !result ? <p>正在加载筛选结果…</p> : (
        <>
          <p>共 {result.batch.totalCount} 人 · 完成 {result.batch.completedCount} · 失败 {result.batch.failedCount}</p>
          <ul aria-label="筛选分档统计" className="hr-result-tiers">
            {(Object.keys(tierCounts) as Array<keyof typeof tierCounts>).map(tier => (
              <li key={tier}>
                <button aria-pressed={filter === tier} data-tier={tier} onClick={() => setFilter(tier)} type="button">
                  <span>{tierLabels[tier]}</span>{" "}
                  <strong>{tierCounts[tier]} 人</strong>
                </button>
              </li>
            ))}
          </ul>
          <p className="hr-muted">分数为有证据支持的满足项占比（满分 100），仅供同批次比较。</p>
          {!matchingCriteria ? <p className="hr-muted">此批次使用历史标准。标准名称见该批次 CSV。</p> : null}
          <div className="hr-actions">
            <button aria-pressed={filter === null} className="hr-button hr-result-filter-all" onClick={() => setFilter(null)} type="button">全部候选人</button>
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
              {visible.map(({ item, tier, score }) => (
                <li key={item.itemId}>
                  <button aria-current={selected?.candidateId === item.candidateId ? "true" : undefined} className="hr-button" onClick={() => onSelectCandidate(item.candidateId)} type="button">
                    <span className="hr-result-name">{candidatesById.get(item.candidateId)?.displayName ?? "候选人"}</span>{" "}
                    <span className="hr-result-tier" data-tier={tier ?? undefined}>{tier ? tierLabels[tier] : statusLabels[item.status]}</span>{" "}
                    {score !== null ? <strong className="hr-result-score">{score} 分</strong> : null}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
          {selected ? (
            <CandidateDetail
              candidate={candidatesById.get(selected.candidateId)}
              criteria={matchingCriteria}
              item={selected}
              onRetry={onRetry}
            />
          ) : <p>{filter ? "此档暂无候选人" : "候选人结果不存在"}</p>}
        </>
      )}
    </dialog>
  );
}
