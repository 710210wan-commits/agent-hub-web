"use client";

import Link from "next/link";
import { Braces, Code2, Eye, FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import {
  draftDeleteAdapter,
  draftUpdateAdapter,
  draftViewModelAdapter,
  submissionViewModelAdapter,
  type DraftViewModel,
  type SubmissionViewModel,
} from "../contracts/authoring-view-model";
import { SkillMarketError } from "../contracts/error";
import type { SkillDiagnostic } from "../contracts/generated";

interface EditBuffer { files: string; metadata: string }
type Action = "delete" | "save" | "submit";

export function SkillDraftEditor({ client, id }: { client?: SkillMarketClient; id: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillDraftEditorDaily client={client ?? getBrowserSkillMarketClient()} id={id} />;
}

function SkillDraftEditorDaily({ client, id }: { client: SkillMarketClient; id: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const actionRef = useRef<Action | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [draft, setDraft] = useState<DraftViewModel>();
  const [edit, setEdit] = useState<EditBuffer>();
  const [loadingError, setLoadingError] = useState<SkillMarketError>();
  const [mutationError, setMutationError] = useState<SkillMarketError>();
  const [validation, setValidation] = useState<string>();
  const [action, setAction] = useState<Action>();
  const [diagnostics, setDiagnostics] = useState<SkillDiagnostic[]>([]);
  const [submission, setSubmission] = useState<SubmissionViewModel>();
  const [previewFile, setPreviewFile] = useState<string>();
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(() => {
    setLoadingError(undefined);
    setDraft(undefined);
    setEdit(undefined);
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    client.query(
      { mode: "daily", operation: "getDraft", pathParameters: { id }, signal: controller.signal },
      draftViewModelAdapter,
    ).then((loaded) => {
      setDraft(loaded);
      setEdit(toBuffer(loaded));
      setPreviewFile(Object.keys(loaded.files)[0]);
      setShowRaw(false);
      setDiagnostics([]);
      setMutationError(undefined);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setLoadingError(toDraftError(error));
    });
    return () => controller.abort();
  }, [client, generation, id]);

  const startAction = (next: Action) => {
    if (actionRef.current) return false;
    actionRef.current = next;
    setAction(next);
    setMutationError(undefined);
    setValidation(undefined);
    return true;
  };
  const finishAction = () => { actionRef.current = undefined; setAction(undefined); };

  async function save() {
    if (!draft || !edit || !draft.editable || !startAction("save")) return;
    const parsed = parseBuffer(edit);
    if (!parsed.ok) { setValidation(parsed.message); finishAction(); return; }
    const result = await client.mutate({
      body: { expectedRevision: draft.revision, files: parsed.files, metadata: parsed.metadata },
      mode: "daily", operation: "updateDraft", pathParameters: { id },
    }, draftUpdateAdapter);
    if (result.ok) {
      setDraft(result.value.draft);
      setEdit(toBuffer(result.value.draft));
      setDiagnostics(result.value.diagnostics);
    } else setMutationError(result.error);
    finishAction();
  }

  async function submit() {
    if (!draft || !draft.editable || dirty || !startAction("submit")) return;
    const result = await client.mutate(
      { mode: "daily", operation: "submitDraft", pathParameters: { id } },
      submissionViewModelAdapter,
    );
    if (result.ok) {
      setSubmission(result.value);
      setDraft({ ...draft, editable: false, status: "submitted" });
    } else setMutationError(result.error);
    finishAction();
  }

  async function remove() {
    if (!draft || !draft.editable || !window.confirm("确认删除这个草稿？") || !startAction("delete")) return;
    const result = await client.mutate(
      { mode: "daily", operation: "deleteDraft", pathParameters: { id } },
      draftDeleteAdapter,
    );
    if (result.ok) router.replace("/skills/mine?mode=1");
    else setMutationError(result.error);
    finishAction();
  }

  if (!draft && !loadingError) return <LoadingState label="正在加载草稿…" />;
  if (loadingError) return <SkillMarketErrorState error={loadingError} onRecover={load} />;
  if (!draft || !edit) return null;

  const serverBuffer = toBuffer(draft);
  const dirty = edit.files !== serverBuffer.files || edit.metadata !== serverBuffer.metadata;
  const unresolved = diagnostics.filter((item) => item.severity === "error").length;
  const sourcePublication = searchParams.get("sourcePublication");
  const sourceRevision = Number(searchParams.get("revision"));

  return (
    <section className="resource-page skill-draft-page">
      <SkillBackLink href="/skills/mine?mode=1">返回我的 Skill</SkillBackLink>
      <header className="page-heading">
        <div><h1>{draft.name}</h1><p>状态：{draft.status} · 修订 r{draft.revision} · {draft.fileCount} 个文件</p></div>
      </header>

      <FilePreview
        files={draft.files}
        onSelect={(file) => { setPreviewFile(file); setShowRaw(false); }}
        onToggleRaw={() => setShowRaw((value) => !value)}
        selected={previewFile}
        showRaw={showRaw}
      />

      {sourcePublication && sourceRevision === draft.revision ? <div className="skill-draft-notice" role="status">已从 Publication {sourcePublication} 创建新修订 r{draft.revision}；原 Publication 与 Artifact 不会被覆盖。</div> : null}
      {!draft.editable ? <div className="skill-draft-notice" role="status">该草稿已不可编辑，当前仅可查看。</div> : null}
      <div className="skill-draft-panel">
        <p className="skill-draft-memory-note">未保存内容仅保留在当前页面内存中；重新加载会放弃本地编辑。</p>
        <label>文件 JSON<textarea aria-label="文件 JSON" disabled={!draft.editable} rows={12} value={edit.files} onChange={(event) => setEdit({ ...edit, files: event.target.value })} /></label>
        <label>元数据 JSON<textarea aria-label="元数据 JSON" disabled={!draft.editable} rows={7} value={edit.metadata} onChange={(event) => setEdit({ ...edit, metadata: event.target.value })} /></label>
        <p>编辑状态：{dirty ? "有未保存修改" : "已与服务端同步"}</p>
        {validation ? <p className="skill-draft-validation" role="alert">{validation}</p> : null}
        {mutationError ? <SkillMarketErrorState error={mutationError} onRecover={mutationError.recovery === "refresh" ? load : undefined} /> : null}
        {diagnostics.length ? <Diagnostics diagnostics={diagnostics} /> : null}
        {draft.editable ? <div className="skill-draft-actions creator-action-bar">
          <button className="primary-button creator-action-button" disabled={Boolean(action) || !dirty} type="button" onClick={() => void save()}>{action === "save" ? "正在保存…" : "保存修改"}</button>
          <button className="secondary-button creator-action-button skill-draft-danger-button" disabled={Boolean(action)} type="button" onClick={() => void remove()}>{action === "delete" ? "正在删除…" : "删除草稿"}</button>
          <Link className="secondary-button creator-action-button" href={`/skills/creator?mode=1&draftId=${encodeURIComponent(draft.id)}`}>Creator 继续编辑</Link>
        </div> : null}
      </div>

      <section className="skill-draft-submit">
        <h2>提交前确认</h2>
        <p>修订 r{draft.revision} · {draft.fileCount} 个文件 · {unresolved} 个未解决错误</p>
        {dirty ? <p>请先保存当前修改再提交。</p> : null}
        {submission ? <p role="status">已提交审核：{submission.id}（r{submission.revision}）</p> : null}
        {draft.editable ? <div className="creator-action-bar"><button className="primary-button creator-action-button" disabled={Boolean(action) || dirty || unresolved > 0} type="button" onClick={() => void submit()}>{action === "submit" ? "正在提交…" : "提交审核"}</button></div> : null}
      </section>
    </section>
  );
}

function toBuffer(draft: DraftViewModel): EditBuffer {
  return { files: JSON.stringify(draft.files, null, 2), metadata: JSON.stringify(draft.metadata, null, 2) };
}

function parseBuffer(buffer: EditBuffer):
  | { ok: true; files: Record<string, string>; metadata: Record<string, unknown> }
  | { ok: false; message: string } {
  try {
    const files: unknown = JSON.parse(buffer.files);
    const metadata: unknown = JSON.parse(buffer.metadata);
    if (!isRecord(files) || !Object.values(files).every((value) => typeof value === "string")) {
      return { ok: false, message: "文件 JSON 必须是路径到字符串内容的对象。" };
    }
    if (!isRecord(metadata)) return { ok: false, message: "元数据 JSON 必须是对象。" };
    return { files: files as Record<string, string>, metadata, ok: true };
  } catch {
    return { ok: false, message: "请输入有效的 JSON。" };
  }
}

function toDraftError(error: unknown): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return new SkillMarketError({
    area: "draft", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
    recovery: "retry", retryable: true, status: 502, userMessage: "Skill Market 服务暂不可用，请稍后重试。",
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function Diagnostics({ diagnostics }: { diagnostics: SkillDiagnostic[] }) {
  return <ul aria-label="校验结果">{diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.severity}：{item.message}</li>)}</ul>;
}

function FilePreview({ files, onSelect, onToggleRaw, selected, showRaw }: {
  files: Record<string, string>;
  onSelect: (file: string) => void;
  onToggleRaw: () => void;
  selected?: string;
  showRaw: boolean;
}) {
  const names = Object.keys(files);
  const active = selected && selected in files ? selected : names[0];
  const content = active ? files[active] ?? "" : "";
  const markdown = active?.toLowerCase().endsWith(".md");
  const json = active?.toLowerCase().endsWith(".json");
  const typeLabel = markdown ? "Markdown" : json ? "JSON" : "文本";
  let formatted = content;
  if (json && !showRaw) {
    try { formatted = JSON.stringify(JSON.parse(content) as unknown, null, 2); } catch { formatted = content; }
  }

  return (
    <section className="skill-file-preview">
      <div className="skill-file-preview-heading">
        <div><span className="skill-file-preview-eyebrow">草稿内容</span><h2>文件预览</h2><p>选择左侧文件，检查注册前的最终内容。</p></div>
      </div>
      {names.length ? (
        <div className="skill-file-preview-layout">
          <nav aria-label="草稿文件">
            {names.map((name) => (
              <button aria-pressed={name === active} key={name} onClick={() => onSelect(name)} type="button">
                {name.toLowerCase().endsWith(".json") ? <Braces aria-hidden="true" size={14} /> : <FileText aria-hidden="true" size={14} />}
                <span>{name}</span>
              </button>
            ))}
          </nav>
          <div className="skill-file-preview-content">
            <div aria-label="预览控制" className="skill-file-preview-toolbar" role="group">
              <div>
                <strong aria-label="当前预览文件">{active}</strong>
                <span>{typeLabel} · {content.length} 个字符</span>
              </div>
              <button aria-pressed={showRaw} type="button" onClick={onToggleRaw}>
                {showRaw ? <Eye aria-hidden="true" size={14} /> : <Code2 aria-hidden="true" size={14} />}
                {showRaw ? "查看预览" : "查看原文"}
              </button>
            </div>
            {markdown && !showRaw
              ? <div className="skill-file-markdown"><ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown></div>
              : <pre><code>{showRaw ? content : formatted}</code></pre>}
          </div>
        </div>
      ) : <p className="skill-file-preview-empty">草稿中没有可预览的文件。</p>}
    </section>
  );
}
