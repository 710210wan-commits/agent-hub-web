"use client";

import { Plus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { createAssistantClient, type AssistantClient, type UploadRole } from "@/features/assistants/api/assistant-client";
import type { HrConversationState } from "@/features/assistants/contracts/generated";
import type { PendingDailySend } from "@/features/chat/session/daily-conversation-reducer";
import type { HrScreeningClient } from "../api/hr-screening-client";

type ScreeningAction = NonNullable<PendingDailySend["screening"]>;
type UploadProgress = { requestId: string; draftId?: string; uploaded: number };
type JobDescription = { text: string; file?: File };

export function HrComposerActions({
  client, uploadClient, conversationId, state, busy, refresh, onScreen, onAuthRequired,
}: {
  client: HrScreeningClient;
  uploadClient?: AssistantClient;
  conversationId: string;
  state: HrConversationState | null;
  busy: boolean;
  refresh(): void;
  onScreen(input: ScreeningAction): Promise<void>;
  onAuthRequired?(): void;
}) {
  const uploads = useMemo(() => uploadClient ?? createAssistantClient(), [uploadClient]);
  const active = useRef<AbortController | null>(null);
  const resumeUpload = useRef<UploadProgress | null>(null);
  const jdUpload = useRef<UploadProgress | null>(null);
  const [menu, setMenu] = useState(false);
  const [showJd, setShowJd] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [jd, setJd] = useState<JobDescription>({ text: "" });
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => () => active.current?.abort(), []);

  const disabled = busy || working || Boolean(state?.activeBatch);
  const canScreen = Boolean(state?.activeJobDescription) &&
    (files.length > 0 || Boolean(state?.candidates.some(candidate => candidate.status === "active")));

  async function perform(action: (signal: AbortSignal) => Promise<void>, message: string) {
    if (active.current || disabled) return;
    const abort = new AbortController();
    active.current = abort;
    setWorking(true);
    setError(null);
    try {
      await action(abort.signal);
    } catch (cause) {
      if (abort.signal.aborted) return;
      const status = (cause as { status?: number })?.status;
      if (status === 401) onAuthRequired?.();
      else setError(status === 403 ? "权限不足" : message);
    } finally {
      active.current = null;
      if (!abort.signal.aborted) setWorking(false);
    }
  }

  async function upload(progress: UploadProgress, role: UploadRole, selected: File[], signal: AbortSignal) {
    if (!progress.draftId) {
      const { draft } = await uploads.createUploadDraft("resume-screening", progress.requestId, signal);
      progress.draftId = draft.draftId;
    }
    while (progress.uploaded < selected.length) {
      await uploads.uploadDraftFile(progress.draftId, role, selected[progress.uploaded], signal);
      progress.uploaded++;
    }
    return progress.draftId;
  }

  const action = (scope: ScreeningAction["scope"]) => void perform(async signal => {
    let current = state;
    if (scope === "incremental" && files.length) {
      const progress = resumeUpload.current ??= { requestId: crypto.randomUUID(), uploaded: 0 };
      let draftId;
      try {
        draftId = await upload(progress, "resume", files, signal);
      } catch (cause) {
        // A file upload has no idempotency key. A new draft avoids appending an unknown duplicate on retry.
        resumeUpload.current = null;
        throw cause;
      }
      current = await client.attachResumes(conversationId, draftId, progress.requestId, signal, { deduplicate: true });
      signal.throwIfAborted();
      resumeUpload.current = null;
      setFiles([]);
      refresh();
    }
    if (!current?.activeJobDescription) return;
    setMenu(false);
    await onScreen({ scope, jobDescriptionVersionId: current.activeJobDescription.jobDescriptionVersionId });
  }, "上传或提交失败，请重试");

  const saveJd = () => void perform(async signal => {
    const progress = jdUpload.current ??= { requestId: crypto.randomUUID(), uploaded: 0 };
    if (jd.file) {
      let draftId;
      try {
        draftId = await upload(progress, "job_description", [jd.file], signal);
      } catch (cause) {
        jdUpload.current = null;
        throw cause;
      }
      await client.replaceJobDescription(conversationId, { kind: "file", draftId, clientRequestId: progress.requestId }, signal);
    } else {
      await client.replaceJobDescription(conversationId, { kind: "text", text: jd.text.trim(), clientRequestId: progress.requestId }, signal);
    }
    signal.throwIfAborted();
    jdUpload.current = null;
    setJd({ text: "" });
    setShowJd(false);
    refresh();
  }, "岗位描述保存失败，请重试");

  return (
    <div className="hr-composer-actions" aria-label="简历筛选操作">
      <div className="hr-actions">
        <button aria-expanded={menu} aria-label="简历筛选操作" className="composer-tool" disabled={disabled}
          onClick={() => setMenu(value => !value)} type="button"><Plus aria-hidden="true" size={16} /></button>
        {menu ? <>
          <button className="composer-tool" disabled={disabled} onClick={() => fileInput.current?.click()} type="button">添加简历</button>
          <button className="composer-tool" disabled={disabled} onClick={() => setShowJd(value => !value)} type="button">更改 JD</button>
          {state?.activeJobDescription && state.candidates.some(candidate => candidate.status === "active") ? (
            <button className="composer-tool" disabled={disabled || files.length > 0 || showJd}
              onClick={() => action("rescreen_active")} type="button">用当前 JD 重筛已有简历</button>
          ) : null}
        </> : null}
        <input ref={fileInput} hidden multiple disabled={disabled} aria-label="添加简历" accept=".pdf,.docx" type="file" onChange={event => {
          const selected = Array.from(event.currentTarget.files ?? []);
          event.currentTarget.value = "";
          if (!selected.length) return;
          if (files.length + selected.length > 20) {
            setError("每次最多添加 20 份简历");
            return;
          }
          resumeUpload.current = null;
          setError(null);
          setFiles(previous => [...previous, ...selected]);
        }} />
        {state?.activeJobDescription ? <small>JD 版本 {state.activeJobDescription.version}</small> : null}
        {canScreen ? <button className="hr-button hr-button-primary" disabled={disabled || showJd}
          onClick={() => action("incremental")} type="button">筛选新简历</button> : null}
        {working ? <small role="status">正在提交…</small> : null}
      </div>
      {showJd ? <div className="hr-panel hr-composer-jd">
        <label>新岗位描述<textarea value={jd.text} disabled={disabled || Boolean(jd.file)}
          onChange={event => { jdUpload.current = null; setJd({ text: event.target.value }); }} /></label>
        <label>上传新岗位描述<input accept=".pdf,.docx" type="file" disabled={disabled} onChange={event => {
          jdUpload.current = null;
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          setJd(previous => ({ ...previous, file }));
        }} /></label>
        {jd.file ? <span className="hr-file-row">
          <span>{jd.file.name}</span>
          <button className="hr-button" type="button" disabled={disabled}
            onClick={() => { jdUpload.current = null; setJd(previous => ({ text: previous.text })); }}>移除 JD 文件</button>
        </span> : null}
        <button className="hr-button" type="button" disabled={disabled || (!jd.file && !jd.text.trim())}
          onClick={saveJd}>保存岗位描述</button>
      </div> : null}
      {files.map((file, index) => <span className="hr-file-row" key={`${file.name}:${file.size}:${index}`}>
        <span>{file.name}</span>
        <button aria-label={`移除 ${file.name}`} className="hr-button" type="button" disabled={disabled}
          onClick={() => { resumeUpload.current = null; setFiles(previous => previous.filter((_, i) => i !== index)); }}>移除</button>
      </span>)}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
