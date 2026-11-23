"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createAssistantClient,
  type AssistantClient,
} from "@/features/assistants/api/assistant-client";
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

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestId = () => crypto.randomUUID();

export function HrScreeningView({
  client,
  uploadClient,
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
  uploadClient?: AssistantClient;
  conversationId: string;
  onCanonicalAction(text: string): Promise<void>;
  onAuthRequired?(): void;
  refreshToken: number;
  progress?: ScreeningProgressValue | null;
  selectedBatchId?: string;
  selectedCandidateId?: string;
  onSelectionChange?(selection: { batchId?: string; candidateId?: string }): void;
}) {
  const uploads = useMemo(() => uploadClient ?? createAssistantClient(), [uploadClient]);
  const { state, status, refresh } = useHrScreeningState({ client, conversationId, refreshToken, onAuthRequired });
  const [actionError, setActionError] = useState<string | null>(null);
  const [jdText, setJdText] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
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
        <button onClick={() => void mutate(() => client.generateCriteria(conversationId, requestId()), "标准生成失败，请稍后重试")} type="button">
          生成筛选标准
        </button>
      )}
      {state.activeCriteria?.status === "confirmed" && !state.activeBatch ? (
        <button onClick={() => void onCanonicalAction("确认筛选标准并开始筛选")} type="button">开始筛选</button>
      ) : null}

      <section aria-label="岗位描述" className="state-card">
        <h2>岗位描述</h2>
        <label>
          岗位描述
          <textarea aria-label="岗位描述" onChange={event => setJdText(event.target.value)} value={jdText} />
        </label>
        <button
          disabled={!jdText.trim()}
          onClick={() => void mutate(async () => {
            await client.replaceJobDescription(conversationId, { kind: "text", text: jdText.trim(), clientRequestId: requestId() });
            setJdText("");
          }, "岗位描述替换失败，请稍后重试")}
          type="button"
        >
          替换岗位描述
        </button>
        <label>
          上传岗位描述文件
          <input
            accept=".pdf,.docx"
            aria-label="上传岗位描述文件"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void mutate(async () => {
                const { draft } = await uploads.createUploadDraft("resume-screening", requestId());
                await uploads.uploadDraftFile(draft.draftId, "job_description", file);
                await client.replaceJobDescription(conversationId, { kind: "file", draftId: draft.draftId, clientRequestId: requestId() });
              }, "岗位描述上传失败，请稍后重试");
            }}
            type="file"
          />
        </label>
      </section>

      <section aria-label="候选人文件" className="state-card">
        <h2>候选人简历</h2>
        <input
          accept=".pdf,.docx"
          aria-label="添加简历"
          multiple
          onChange={event => {
            setPendingFiles(Array.from(event.target.files ?? []).slice(0, 20));
            event.target.value = "";
          }}
          type="file"
        />
        {pendingFiles.map((file, index) => (
          <span key={`${file.name}:${file.size}:${index}`}>
            {file.name}
            <button aria-label={`移除 ${file.name}`} onClick={() => setPendingFiles(current => current.filter((_, i) => i !== index))} type="button">移除</button>
          </span>
        ))}
        {pendingFiles.length ? (
          <button
            onClick={() => void mutate(async () => {
              const { draft } = await uploads.createUploadDraft("resume-screening", requestId());
              for (const file of pendingFiles) await uploads.uploadDraftFile(draft.draftId, "resume", file);
              await client.attachResumes(conversationId, draft.draftId, requestId());
              setPendingFiles([]);
            }, "简历上传失败，请稍后重试")}
            type="button"
          >
            上传并绑定 {pendingFiles.length} 份简历
          </button>
        ) : null}
        <ul>
          {state.candidates.map(candidate => (
            <li key={candidate.candidateId}>
              <span>{candidate.displayName}</span>
              <small>{candidate.status === "retired" ? "已退役" : candidate.parseStatus}</small>
              {renaming === candidate.candidateId ? (
                <>
                  <input aria-label="候选人显示名称" onChange={event => setCandidateName(event.target.value)} value={candidateName} />
                  <button
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
                <button onClick={() => { setRenaming(candidate.candidateId); setCandidateName(candidate.displayName); }} type="button">重命名候选人</button>
              )}
              {candidate.status === "active" ? (
                <button onClick={() => void mutate(() => client.updateCandidate(conversationId, candidate.candidateId, { action: "retire", clientRequestId: requestId() }))} type="button">退役候选人</button>
              ) : (
                <button onClick={() => void mutate(() => client.updateCandidate(conversationId, candidate.candidateId, { action: "reactivate", clientRequestId: requestId() }))} type="button">重新激活候选人</button>
              )}
            </li>
          ))}
        </ul>
      </section>

      {state.activeBatch ? <ScreeningResultCard batch={state.activeBatch} onOpen={openResult} /> : null}
      {state.latestCompletedBatch ? <ScreeningResultCard batch={state.latestCompletedBatch} onOpen={openResult} /> : null}
      {selection.batchId || invalidResult ? (
        <ScreeningResultDrawer
          candidates={state.candidates}
          criteria={state.activeCriteria?.criteria ?? []}
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
  const url = URL.createObjectURL(new Blob([result.content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
