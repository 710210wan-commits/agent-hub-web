"use client";

import { useEffect, useState } from "react";

import type {
  HrScreeningBatch,
  HrScreeningBatchItem,
} from "@/features/assistants/contracts/generated";
import type { HrScreeningClient } from "../api/hr-screening-client";
import { useHrScreeningState } from "../session/use-hr-screening-state";
import { CriteriaCard } from "./criteria-card";
import { ScreeningProgress, type ScreeningProgressValue } from "./screening-progress";
import { ScreeningResultCard } from "./screening-result-card";
import { ScreeningResultDrawer } from "./screening-result-drawer";
import { ScreeningSummary } from "./screening-summary";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestId = () => crypto.randomUUID();
const parseLabels = {
  uploaded: "待解析",
  queued: "等待解析",
  parsing: "解析中",
  parsed: "已解析",
  failed: "解析失败",
};

export function HrScreeningView({
  client,
  sharedState,
  conversationId,
  onCanonicalAction,
  onAuthRequired,
  refreshToken,
  progress,
  selectedBatchId,
  selectedCandidateId,
  onSelectionChange,
}: {
  client: HrScreeningClient;
  sharedState?: ReturnType<typeof useHrScreeningState>;
  conversationId: string;
  onCanonicalAction(text: string): Promise<void>;
  onAuthRequired?(): void;
  refreshToken: number;
  progress?: ScreeningProgressValue | null;
  selectedBatchId?: string;
  selectedCandidateId?: string;
  onSelectionChange?(selection: { batchId?: string; candidateId?: string }): void;
}) {
  const localState = useHrScreeningState({ client, conversationId: sharedState ? undefined : conversationId,
    refreshToken, onAuthRequired });
  const { state, status, refresh, manualRefresh } = sharedState ?? localState;
  const [actionError, setActionError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState("");
  const [internalSelection, setInternalSelection] = useState<{ batchId?: string; candidateId?: string }>({});
  const selection = onSelectionChange || selectedBatchId !== undefined || selectedCandidateId !== undefined
    ? { batchId: selectedBatchId, candidateId: selectedCandidateId }
    : internalSelection;
  const requestKey = `${conversationId}:${selection.batchId ?? ""}:${selection.candidateId ?? ""}:${refreshToken}`;
  const invalidInput = Boolean(selection.batchId && (!uuid.test(selection.batchId)
    || (selection.candidateId && !uuid.test(selection.candidateId))));
  const [outcome, setOutcome] = useState<{
    key: string;
    result: { batch: HrScreeningBatch; items: HrScreeningBatchItem[] } | null;
    invalid: boolean;
  } | null>(null);

  useEffect(() => {
    const batchId = selection.batchId;
    if (!batchId || invalidInput) return;
    const abort = new AbortController();
    void client.getBatch(batchId, abort.signal).then(next => {
      if (abort.signal.aborted) return;
      const invalid = next.batch.conversationId !== conversationId
        || Boolean(selection.candidateId && !next.items.some(item => item.candidateId === selection.candidateId));
      setOutcome({ key: requestKey, result: invalid ? null : next, invalid });
    }).catch((error: unknown) => {
      if (abort.signal.aborted) return;
      if (statusCode(error) === 401) {
        onAuthRequired?.();
        return;
      }
      setOutcome({ key: requestKey, result: null, invalid: true });
    });
    return () => abort.abort();
  }, [client, conversationId, invalidInput, onAuthRequired, requestKey, selection.batchId, selection.candidateId]);

  const result = outcome?.key === requestKey ? outcome.result : null;
  const resultLoading = Boolean(selection.batchId && !invalidInput && outcome?.key !== requestKey);
  const invalidResult = invalidInput || Boolean(outcome?.key === requestKey && outcome.invalid);

  if (status === "unavailable") return <p>筛选资料已过期或不可用</p>;
  if (status === "loading") return <p>正在加载筛选资料…</p>;
  if (status === "error") return <p role="alert">筛选资料加载失败，请稍后重试</p>;
  if (!state) return null;

  const currentBatch = state.activeBatch ?? state.latestCompletedBatch;
  const openResult = (batchId: string, candidateId?: string) => {
    if (onSelectionChange) onSelectionChange({ batchId, candidateId });
    else setInternalSelection({ batchId, candidateId });
  };
  const closeResult = () => {
    if (onSelectionChange) onSelectionChange({});
    else setInternalSelection({});
  };
  const mutate = async (action: () => Promise<unknown>, message = "操作失败，请稍后重试", rethrow = false) => {
    setActionError(null);
    try {
      await action();
      refresh();
    } catch (error) {
      if (statusCode(error) === 401) {
        onAuthRequired?.();
        return;
      }
      setActionError(message);
      if (rethrow) throw new Error(message);
    }
  };

  return (
    <section aria-label="简历筛选助手" className="hr-screening-view">
      <ScreeningProgress batch={state.activeBatch} progress={progress} />
      {actionError ? <p role="alert">{actionError}</p> : null}

      {state.activeCriteria ? (
        <CriteriaCard
          key={`${state.activeCriteria.criteriaVersionId}:${state.activeCriteria.version}:${state.activeCriteria.status}`}
          version={state.activeCriteria}
          onConfirm={async () => {
            if (!state.activeCriteria) return;
            await mutate(async () => {
              await client.confirmCriteria(conversationId, state.activeCriteria!.version, requestId());
              await onCanonicalAction("确认筛选标准并开始筛选");
            }, "确认失败，请稍后重试", true);
          }}
          onSave={async criteria => {
            if (!state.activeCriteria) return;
            await client.updateCriteria(conversationId, state.activeCriteria.version, criteria, requestId());
            refresh();
          }}
        />
      ) : (
        <button className="hr-button hr-button-primary" onClick={() => void mutate(() => client.generateCriteria(conversationId, requestId()), "标准生成失败，请稍后重试")} type="button">
          生成筛选标准
        </button>
      )}
      <section aria-label="候选人文件" className="hr-panel">
        <h2>候选人简历</h2>
        <ul className="hr-candidate-list">
          {state.candidates.map(candidate => (
            <li className="hr-candidate-row" key={candidate.candidateId}>
              <div className="hr-candidate-identity">
                <span>{candidate.displayName}</span>
                <small>{candidate.status === "retired" ? "已退役" : parseLabels[candidate.parseStatus]}</small>
              </div>
              <div className="hr-actions">
                {renaming === candidate.candidateId ? (
                  <>
                    <input aria-label="候选人显示名称" onChange={event => setCandidateName(event.target.value)} value={candidateName} />
                    <button
                      className="hr-button"
                      onClick={() => void mutate(async () => {
                        await client.updateCandidate(conversationId, candidate.candidateId, { action: "rename", displayName: candidateName, clientRequestId: requestId() });
                        setRenaming(null);
                      })}
                      type="button"
                    >
                      保存候选人名称
                    </button>
                  </>
                ) : (
                  <button className="hr-button" onClick={() => { setRenaming(candidate.candidateId); setCandidateName(candidate.displayName); }} type="button">重命名候选人</button>
                )}
                {candidate.status === "active" ? (
                  <button className="hr-button" onClick={() => void mutate(() => client.updateCandidate(conversationId, candidate.candidateId, { action: "retire", clientRequestId: requestId() }))} type="button">退役候选人</button>
                ) : (
                  <button className="hr-button" onClick={() => void mutate(() => client.updateCandidate(conversationId, candidate.candidateId, { action: "reactivate", clientRequestId: requestId() }))} type="button">重新激活候选人</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {sharedState ? <ScreeningSummary client={client} conversationId={conversationId}
        refreshToken={String(refreshToken) + ":" + String(manualRefresh)} onAuthRequired={onAuthRequired} onOpen={openResult} /> : null}
      {currentBatch ? <>
        <h2 className="hr-batch-heading">本轮筛选</h2>
        <ScreeningResultCard batch={currentBatch} onOpen={openResult} />
      </> : null}
      {selection.batchId || invalidResult ? (
        <ScreeningResultDrawer
          candidates={state.candidates}
          activeCriteria={state.activeCriteria}
          invalid={invalidResult}
          loading={resultLoading}
          onCancel={() => void mutate(async () => {
            const next = await client.cancelBatch(selection.batchId!, requestId());
            setOutcome({ key: requestKey, result: next, invalid: false });
          })}
          onClose={closeResult}
          onContinue={() => void onCanonicalAction("继续未完成的简历筛选批次")}
          onExport={() => void mutate(() => exportCsv(client, selection.batchId!), "导出失败，请稍后重试")}
          onRetry={item => void mutate(async () => {
            const next = await client.retryItem(selection.batchId!, item.itemId, requestId());
            setOutcome({ key: requestKey, result: next, invalid: false });
          })}
          onSelectCandidate={candidateId => openResult(selection.batchId!, candidateId)}
          result={result}
          selectedCandidateId={selection.candidateId}
        />
      ) : null}
    </section>
  );
}

function statusCode(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("status" in error)) return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : undefined;
}

async function exportCsv(client: HrScreeningClient, batchId: string) {
  const result = await client.exportBatchCsv(batchId);
  if (typeof URL.createObjectURL !== "function") return;
  // Excel uses the BOM to identify UTF-8 when opening a local CSV.
  const content = result.content.replace(/^\uFEFF/, "");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
