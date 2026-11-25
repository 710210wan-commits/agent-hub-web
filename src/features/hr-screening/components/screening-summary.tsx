"use client";

import { useEffect, useRef, useState } from "react";

import type { HrScreeningSummary } from "@/features/assistants/contracts/generated";
import type { HrScreeningClient } from "../api/hr-screening-client";

const tierLabels = { recommended: "推荐", manual_review: "待人工复核", not_matched: "暂不匹配" };
const pageSize = 25;
type Tier = keyof typeof tierLabels;

export function ScreeningSummary({ client, conversationId, open, onClose, refreshToken, onAuthRequired, onOpen }: {
  client: HrScreeningClient;
  conversationId: string;
  open: boolean;
  onClose(): void;
  refreshToken: string;
  onAuthRequired?(): void;
  onOpen(batchId: string, candidateId: string): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  const [tier, setTier] = useState<Tier>();
  const [scope, setScope] = useState<HrScreeningSummary["scope"]>("all");
  const [groupId, setGroupId] = useState("");
  const [offset, setOffset] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ key: string; value: HrScreeningSummary | null } | null>(null);
  const key = JSON.stringify([conversationId, scope, groupId, tier, offset, refreshToken, attempt]);

  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    void client.getSummary(conversationId, { scope, groupId: groupId || undefined, tier, offset, limit: pageSize }, abort.signal)
      .then(value => { if (!abort.signal.aborted) setOutcome({ key, value }); })
      .catch((error: unknown) => {
        if (abort.signal.aborted) return;
        if ((error as { status?: number })?.status === 401) onAuthRequired?.();
        else setOutcome({ key, value: null });
      });
    return () => abort.abort();
  }, [client, conversationId, groupId, key, offset, onAuthRequired, open, scope, tier]);

  const current = outcome?.key === key ? outcome : null;
  const result = current?.value;
  const setViewScope = (next: HrScreeningSummary["scope"]) => { setScope(next); setOffset(0); };
  return (
    <dialog ref={dialogRef} aria-label="累计筛选结果" className="hr-panel hr-result-dialog"
      onCancel={event => { event.preventDefault(); onClose(); }}>
      {open ? <>
      <header className="hr-panel-heading">
        <h2>累计筛选结果</h2>
        <button className="hr-button" onClick={onClose} type="button">关闭累计结果</button>
      </header>
      <div className="hr-actions">
        <button className="hr-button" aria-pressed={scope === "all"} type="button" onClick={() => setViewScope("all")}>全部已筛</button>
        <button className="hr-button" aria-pressed={scope === "active"} type="button" onClick={() => setViewScope("active")}>当前名单</button>
        {outcome?.value?.groups.length ? (
          <label>统计版本<select value={groupId} onChange={event => { setGroupId(event.target.value); setOffset(0); }}>
            <option value="">当前 JD 和标准</option>
            {outcome.value.groups.map((group, index) => <option key={group.groupId} value={group.groupId}>
              JD {group.jobDescriptionVersion} · 标准 {group.criteriaVersion} · 结果组 {index + 1}
            </option>)}
          </select></label>
        ) : null}
      </div>
      {!current ? <p>正在加载累计结果…</p> : !result ? (
        <div role="alert">累计结果暂不可用 <button className="hr-button" type="button" onClick={() => setAttempt(value => value + 1)}>重试</button></div>
      ) : (
        <>
          <p>共 {result.counts.total} 人 · 已评分 {result.counts.scored} · 已移出 {result.counts.retired}</p>
          <div className="hr-result-tiers" aria-label="累计分档">
            {([
              ["recommended", result.counts.recommended],
              ["manual_review", result.counts.manualReview],
              ["not_matched", result.counts.notMatched],
            ] as const).map(([value, count]) => (
              <button key={value} aria-pressed={tier === value} data-tier={value} type="button"
                onClick={() => { setTier(tier === value ? undefined : value); setOffset(0); }}>
                {tierLabels[value]} {count}
              </button>
            ))}
          </div>
          {result.counts.failed || result.counts.pending ? <p>失败 {result.counts.failed} · 待评分 {result.counts.pending}</p> : null}
          {!result.group && scope === "all" ? <p>当前版本暂无已筛结果</p> : null}
          {result.rows.length ? <ul className="hr-candidate-list" aria-label="累计候选人">
            {result.rows.map(row => <li className="hr-candidate-row" key={row.candidateId}>
              <span>{row.displayName}{row.candidateStatus === "retired" ? " · 已移出" : ""}</span>
              <div className="hr-actions">
                <small>{row.advisoryTier ? tierLabels[row.advisoryTier] : row.status === "failed" ? "失败" : "待评分"}</small>
                {row.score !== null ? <strong>{row.score} 分</strong> : null}
                {row.batchId ? <button className="hr-button" type="button" aria-label={`查看 ${row.displayName} 的筛选结果`}
                  onClick={() => onOpen(row.batchId!, row.candidateId)}>查看</button> : null}
              </div>
            </li>)}
          </ul> : tier ? <p>此档暂无候选人</p> : null}
          {offset || result.nextOffset !== null ? <div className="hr-actions">
            <button className="hr-button" disabled={!offset} type="button" onClick={() => setOffset(Math.max(0, offset - pageSize))}>上一页</button>
            <button className="hr-button" disabled={result.nextOffset === null} type="button"
              onClick={() => { if (result.nextOffset !== null) setOffset(result.nextOffset); }}>下一页</button>
          </div> : null}
        </>
      )}
      </> : null}
    </dialog>
  );
}
