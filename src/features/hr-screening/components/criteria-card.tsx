"use client";

import { useState } from "react";

import type { HrConversationState, HrCriterion } from "@/features/assistants/contracts/generated";

export function CriteriaCard({
  version,
  onSave,
  onConfirm,
}: {
  version: NonNullable<HrConversationState["activeCriteria"]>;
  onSave(criteria: HrCriterion[]): Promise<void>;
  onConfirm(): Promise<void>;
}) {
  const [draft, setDraft] = useState<HrCriterion[]>(version.criteria);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirmed = version.status === "confirmed";

  const update = (criterionId: string, field: keyof Omit<HrCriterion, "criterionId" | "kind">, value: string) => {
    setDirty(true);
    setDraft(current => current.map(criterion => criterion.criterionId === criterionId
      ? { ...criterion, [field]: value }
      : criterion));
  };

  return (
    <section aria-label="筛选标准" className="hr-panel">
      <header className="hr-panel-heading">
        <h2>筛选标准</h2>
        <span className="hr-muted">版本 {version.version} · {confirmed ? "已确认" : "草稿"}</span>
      </header>
      {(confirmed ? version.criteria : draft).map((criterion, index) => (
        <fieldset className="hr-criterion" key={criterion.criterionId} disabled={busy}>
          <legend>{criterion.kind === "required" ? "硬性条件" : "加分条件"} {index + 1}</legend>
          {confirmed ? (
            <dl className="hr-criterion-details">
              <div><dt>标准标题</dt><dd>{criterion.title}</dd></div>
              <div><dt>评估说明</dt><dd>{criterion.instruction}</dd></div>
              <div><dt>证据要求</dt><dd>{criterion.evidenceExpectation}</dd></div>
            </dl>
          ) : (
            <div className="hr-criterion-fields">
              <label>
                标准标题
                <input
                  aria-label={index === 0 ? "标准标题" : `标准标题 ${index + 1}`}
                  onChange={event => update(criterion.criterionId, "title", event.target.value)}
                  value={criterion.title}
                />
              </label>
              <label>
                评估说明
                <textarea
                  aria-label={index === 0 ? "评估说明" : `评估说明 ${index + 1}`}
                  onChange={event => update(criterion.criterionId, "instruction", event.target.value)}
                  value={criterion.instruction}
                  rows={3}
                />
              </label>
              <label>
                证据要求
                <textarea
                  aria-label={index === 0 ? "证据要求" : `证据要求 ${index + 1}`}
                  onChange={event => update(criterion.criterionId, "evidenceExpectation", event.target.value)}
                  value={criterion.evidenceExpectation}
                  rows={3}
                />
              </label>
            </div>
          )}
        </fieldset>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      <div className="hr-actions">
        {!confirmed ? (
          <>
            <button
              className="hr-button"
              disabled={busy || draft.some(criterion => !criterion.title.trim() || !criterion.instruction.trim() || !criterion.evidenceExpectation.trim())}
              onClick={() => {
                setBusy(true);
                setError(null);
                void onSave(draft).then(() => setDirty(false)).catch(() => {
                  setError("保存失败，请稍后重试");
                }).finally(() => setBusy(false));
              }}
              type="button"
            >
              保存标准
            </button>
            <button
              className="hr-button hr-button-primary"
              disabled={busy || dirty}
              onClick={() => {
                setBusy(true);
                setError(null);
                void onConfirm().catch(() => setError("确认失败，请稍后重试")).finally(() => setBusy(false));
              }}
              type="button"
            >
              确认并开始筛选
            </button>
          </>
        ) : <span>标准已确认，可开始或继续筛选</span>}
      </div>
    </section>
  );
}
