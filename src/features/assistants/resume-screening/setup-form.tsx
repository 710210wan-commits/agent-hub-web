"use client";

import { FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { InlineError } from "@/components/states/inline-error";
import { useAuth } from "@/providers/auth-provider";

import {
  createAssistantClient,
  isAssistantClientError,
  type AssistantClient,
} from "../api/assistant-client";
import { HrJobDescriptionTextSchema, type AssistantDefinition, type CreateAssistantConversationRequest } from "../contracts/generated";
import { useUploadDraft, type UploadDraftItem } from "./use-upload-draft";

export function ResumeScreeningSetupForm({
  assistant,
  client: clientOverride,
  createRequestId = newRequestId,
  onCancel,
  onCreated,
}: {
  assistant: AssistantDefinition;
  client?: AssistantClient;
  createRequestId?: () => string;
  onCancel?: () => void;
  onCreated?: (conversationId: string) => void;
}) {
  const router = useRouter();
  const { invalidate } = useAuth();
  const client = useMemo(() => clientOverride ?? createAssistantClient(), [clientOverride]);
  const [source, setSource] = useState<"file" | "text">("file");
  const [jdText, setJdText] = useState("");
  const validatedText = HrJobDescriptionTextSchema.safeParse(jdText.trim());
  const jobDescriptionText = source === "text" ? validatedText.data ?? "" : undefined;
  const upload = useUploadDraft({ assistantId: assistant.id, client, createRequestId, jobDescriptionText });
  const jdFiles = upload.items.filter(item => item.role === "job_description");
  const submitSnapshot = useRef<CreateAssistantConversationRequest | null>(null);
  const submitting = useRef(false);
  const [submitState, setSubmitState] = useState<"idle" | "submitting" | "unknown">("idle");
  const [submitError, setSubmitError] = useState<string>();

  const editingLocked = submitState !== "idle";
  const submit = async () => {
    if (submitting.current || !upload.draftId || (!submitSnapshot.current && !upload.canSubmit)) return;
    submitting.current = true;
    const snapshot = submitSnapshot.current ??= {
      draftId: upload.draftId, clientRequestId: createRequestId(), ...(jobDescriptionText ? { jobDescriptionText } : {}),
    };
    setSubmitState("submitting");
    setSubmitError(undefined);
    try {
      const result = await client.createAssistantConversation(assistant.id, snapshot);
      if (onCreated) onCreated(result.conversationId);
      else router.replace(`/chat?mode=1&assistant=${encodeURIComponent(assistant.id)}&conversation=${encodeURIComponent(result.conversationId)}`);
    } catch (error) {
      if (isAssistantClientError(error) && error.status === 401) {
        invalidate();
        return;
      }
      if (isAssistantClientError(error) && [400, 403, 409, 410].includes(error.status)) {
        submitSnapshot.current = null;
        setSubmitState("idle");
        setSubmitError(error.status === 403 ? "权限不足，无法创建筛选会话。"
          : error.status === 410 ? "上传草稿已过期，请重新打开助手。"
            : "无法创建筛选会话，请检查岗位描述与简历。");
        return;
      }
      setSubmitState("unknown");
      setSubmitError("结果未知，可安全重试");
    } finally {
      submitting.current = false;
    }
  };

  const progress = upload.counts.total === 0 ? "尚未选择文件"
    : upload.counts.ready === upload.counts.total ? `已就绪 ${upload.counts.ready}/${upload.counts.total}`
      : `正在上传 ${upload.counts.ready}/${upload.counts.total}`;

  return (
    <section className="assistant-setup-panel" aria-label={`${assistant.name}设置`}>
      <div className="assistant-setup-intro">
        <span className="assistant-setup-mark"><FileText aria-hidden size={22} /></span>
        <div><h1>{assistant.name}</h1><p>{assistant.summary}</p></div>
      </div>

      {upload.draft.kind === "error" ? (
        <div className="assistant-error-stack">
          <InlineError message={upload.draft.message} />
          <button className="assistant-secondary-button" onClick={upload.retryDraft} type="button">
            <RefreshCw aria-hidden size={14} />重试准备上传
          </button>
        </div>
      ) : null}
      {upload.validationError ? <InlineError message={upload.validationError} /> : null}
      {submitError ? <InlineError message={submitError} /> : null}

      <div className="assistant-upload-section">
        <div className="assistant-upload-heading">
          <div><strong>岗位描述</strong><small>{source === "text" ? "粘贴岗位职责和任职要求" : "1 份 PDF 或 DOCX，最大 10 MiB"}</small></div>
          <button className="assistant-text-option" disabled={editingLocked || jdFiles.length > 0}
            title={jdFiles.length ? "移除岗位描述文件后可粘贴文本" : undefined}
            onClick={() => setSource(source === "file" ? "text" : "file")} type="button">
            {source === "file" ? "粘贴文本" : "改用文件"}
          </button>
        </div>
        {source === "text" ? (
          <textarea aria-label="岗位描述文本" className="assistant-jd-text" disabled={editingLocked}
            maxLength={HrJobDescriptionTextSchema.maxLength ?? undefined}
            onChange={event => setJdText(event.target.value)} placeholder="粘贴岗位描述…" rows={6} value={jdText} />
        ) : <>
          <label className="assistant-upload-button">
            <Upload aria-hidden size={15} />上传岗位描述
            <input
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              aria-label="上传岗位描述"
              disabled={editingLocked || upload.draft.kind !== "ready" || jdFiles.length > 0}
              onChange={(event) => {
                upload.addFiles("job_description", Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
              type="file"
            />
          </label>
          <FileList items={jdFiles} upload={upload} disabled={editingLocked} />
        </>}
      </div>

      <div className="assistant-upload-section">
        <div className="assistant-upload-heading">
          <div><strong>候选人简历</strong><small>1–20 份 PDF 或 DOCX，每份最大 10 MiB</small></div>
        </div>
        <label className="assistant-upload-button">
          <Upload aria-hidden size={15} />批量上传简历
          <input
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            aria-label="上传候选人简历"
            disabled={editingLocked || upload.draft.kind !== "ready"}
            multiple
            onChange={(event) => {
              upload.addFiles("resume", Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
            type="file"
          />
        </label>
        <FileList items={upload.items.filter((item) => item.role === "resume")} upload={upload} disabled={editingLocked} />
      </div>

      <div className="assistant-setup-footer">
        <span aria-live="polite" className="assistant-upload-progress">{progress}</span>
        <div>
          <button className="assistant-secondary-button" onClick={() => onCancel ? onCancel() : router.push("/assistants")} type="button">取消</button>
          {submitState === "unknown" ? (
            <button className="assistant-primary-button" onClick={() => void submit()} type="button">重试创建会话</button>
          ) : (
            <button className="assistant-primary-button" disabled={!upload.canSubmit || submitState === "submitting"} onClick={() => void submit()} type="button">
              {submitState === "submitting" ? "正在创建…" : "开始筛选"}
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function FileList({
  items,
  upload,
  disabled,
}: {
  items: UploadDraftItem[];
  upload: ReturnType<typeof useUploadDraft>;
  disabled: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="assistant-file-list">
      {items.map((item) => (
        <li className={`assistant-file-chip is-${item.status}`} key={item.localId}>
          <span><FileText aria-hidden size={14} /><strong>{item.file.name}</strong><small>{fileStatus(item)}</small></span>
          <span className="assistant-file-actions">
            {item.status === "failed" ? (
              <button aria-label={`重试 ${item.file.name}`} disabled={disabled} onClick={() => upload.retryFile(item.localId)} type="button"><RefreshCw aria-hidden size={13} /></button>
            ) : null}
            <button aria-label={`移除 ${item.file.name}`} disabled={disabled || item.status === "removing"} onClick={() => void upload.removeFile(item.localId)} type="button"><Trash2 aria-hidden size={13} /></button>
          </span>
        </li>
      ))}
    </ul>
  );
}

function fileStatus(item: UploadDraftItem): string {
  if (item.status === "uploading") return "上传中";
  if (item.status === "removing") return "移除中";
  if (item.status === "failed") return item.error ?? "上传失败";
  return `${Math.max(1, Math.round(item.file.size / 1024))} KiB`;
}

function newRequestId(): string {
  return crypto.randomUUID();
}
