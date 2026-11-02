"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { KbDialog } from "@/components/knowledge/kb-dialog";
import { KbDocumentTable } from "@/components/knowledge/kb-document-table";
import { KbLoginGate } from "@/components/knowledge/kb-login-gate";
import { AppShell } from "@/components/shell/app-shell";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import { withMode } from "@/config/modes";
import { useAppMode } from "@/providers/mode-provider";
import {
  KbApiError,
  deleteKbDocument,
  getKbDatabase,
  getKbDocumentStatus,
  kbErrorMessage,
  listKbDocuments,
  uploadKbDocument,
  type KbDatabaseDetail,
  type KbDocument,
  type KbDocumentStatus,
} from "@/lib/kb-api";
import {
  formatKbBytes,
  formatKbCount,
  formatKbDateTime,
} from "@/lib/kb-format";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ["md", "pdf", "docx", "txt"];

type PagePhase = "loading" | "error" | "ready";

interface ActionNotice {
  tone: "success" | "error" | "info";
  text: string;
}

interface ReasonDialogState {
  fileId: string;
  filename: string;
  state: "loading" | "ready" | "error";
  status?: KbDocumentStatus;
  message?: string;
}

/** 文档仍有解析或入库任务未落定时继续轮询；failed 视为已落定，避免失败文档导致无限刷新。 */
function isPendingDocument(document: KbDocument): boolean {
  if (document.parse_status === "failed" || document.index_status === "failed") {
    return false;
  }
  return (
    document.parse_status === "waiting" ||
    document.parse_status === "parsing" ||
    document.index_status === "waiting" ||
    document.index_status === "indexing"
  );
}

export default function KnowledgeDetailPage() {
  const routeParams = useParams<{ id: string }>();
  const kbId = typeof routeParams?.id === "string" ? routeParams.id : "";
  const { mode } = useAppMode();

  const [phase, setPhase] = useState<PagePhase>("loading");
  const [detail, setDetail] = useState<KbDatabaseDetail | null>(null);
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [documentTotal, setDocumentTotal] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [pollError, setPollError] = useState("");
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const [uploading, setUploading] = useState(false);
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KbDocument | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [reasonDialog, setReasonDialog] = useState<ReasonDialogState | null>(
    null,
  );
  const [retryTarget, setRetryTarget] = useState<KbDocument | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kbId) {
      return;
    }

    let cancelled = false;

    Promise.all([getKbDatabase(kbId), listKbDocuments(kbId)])
      .then(([database, list]) => {
        if (cancelled) return;
        setDetail(database);
        setDocuments(list.documents);
        setDocumentTotal(list.total);
        setPhase("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNeedLogin(error instanceof KbApiError && error.kind === "unauthorized");
        setLoadError(kbErrorMessage(error));
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [kbId]);

  const hasPendingDocuments = documents.some(isPendingDocument);

  useEffect(() => {
    if (phase !== "ready" || !hasPendingDocuments) {
      return;
    }

    // 只要还有文档处于待解析/解析中/待入库/入库中，就每 5 秒刷新一次列表；
    // 全部落定后 hasPendingDocuments 变为 false，本 effect 自动清理定时器。
    let cancelled = false;
    const timer = window.setInterval(() => {
      listKbDocuments(kbId)
        .then((list) => {
          if (cancelled) return;
          setDocuments(list.documents);
          setDocumentTotal(list.total);
          setPollError("");
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPollError(kbErrorMessage(error));
        });
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [hasPendingDocuments, kbId, phase]);

  async function reload() {
    const [database, list] = await Promise.all([
      getKbDatabase(kbId),
      listKbDocuments(kbId),
    ]);
    setDetail(database);
    setDocuments(list.documents);
    setDocumentTotal(list.total);
    setPollError("");
  }

  function handleUploadClick() {
    if (uploading || phase !== "ready") {
      return;
    }
    setNotice(null);
    fileInputRef.current?.click();
  }

  async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const extension = file.name.toLowerCase().split(".").pop() ?? "";
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      setNotice({
        tone: "error",
        text: "仅支持 md、pdf、docx、txt 格式文件",
      });
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice({ tone: "error", text: "文件大小不能超过 100MB" });
      return;
    }

    setUploading(true);
    setNotice({ tone: "info", text: `正在上传「${file.name}」…` });
    try {
      await uploadKbDocument(kbId, file);
      setNotice({
        tone: "success",
        text: `「${file.name}」已上传，正在解析`,
      });
      try {
        await reload();
      } catch (refreshError) {
        setNotice({
          tone: "error",
          text: `上传成功，但刷新列表失败：${kbErrorMessage(refreshError)}`,
        });
      }
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setUploading(false);
    }
  }

  async function handleShowReason(document: KbDocument) {
    setReasonDialog({
      fileId: document.file_id,
      filename: document.filename,
      state: "loading",
    });

    try {
      const status = await getKbDocumentStatus(kbId, document.file_id);
      setReasonDialog((current) =>
        current && current.fileId === document.file_id
          ? { ...current, state: "ready", status }
          : current,
      );
    } catch (error) {
      const message = kbErrorMessage(error);
      setReasonDialog((current) =>
        current && current.fileId === document.file_id
          ? { ...current, state: "error", message }
          : current,
      );
    }
  }

  function closeDeleteDialog() {
    if (deletingFileId) {
      return;
    }
    setDeleteTarget(null);
    setDeleteError("");
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget) {
      return;
    }

    const target = deleteTarget;
    setDeletingFileId(target.file_id);
    setDeleteError("");
    try {
      await deleteKbDocument(kbId, target.file_id);
      setDeleteTarget(null);
      setNotice({ tone: "success", text: `「${target.filename}」已删除` });
      try {
        await reload();
      } catch (refreshError) {
        setNotice({
          tone: "error",
          text: `删除成功，但刷新列表失败：${kbErrorMessage(refreshError)}`,
        });
      }
    } catch (error) {
      setDeleteError(kbErrorMessage(error));
    } finally {
      setDeletingFileId(null);
    }
  }

  return (
    <AppShell title="知识库详情">
      <section className="resource-detail kb-detail">
        <div className="kb-detail-toolbar">
          <Link className="back-link" href={withMode("/knowledge", mode)}>
            <ArrowLeft aria-hidden="true" size={15} />
            返回知识库
          </Link>
          <div className="kb-toolbar-actions">
            {phase === "ready" && hasPendingDocuments ? (
              <span className="kb-poll-indicator">
                <span aria-hidden="true" className="activity-dot" />
                自动刷新中
              </span>
            ) : null}
            <button
              className="kb-primary-button"
              disabled={phase !== "ready" || uploading}
              onClick={handleUploadClick}
              type="button"
            >
              {uploading ? "正在上传…" : "上传文档"}
            </button>
            <input
              accept=".md,.pdf,.docx,.txt"
              className="kb-file-input"
              onChange={handleFileSelected}
              ref={fileInputRef}
              type="file"
            />
          </div>
        </div>

        {!kbId ? (
          <ErrorState message="知识库不存在或已被删除，请返回列表重新选择" />
        ) : null}

        {kbId && phase === "loading" ? (
          <LoadingState label="正在加载知识库…" />
        ) : null}

        {kbId && phase === "error" ? (
          needLogin ? <KbLoginGate /> : <ErrorState message={loadError} />
        ) : null}

        {phase === "ready" && detail ? (
          <>
            <div className="detail-panel kb-detail-panel">
              <h1>{detail.name || "—"}</h1>
              <p className="kb-detail-description">
                {detail.description || "暂无描述"}
              </p>
              <dl className="kb-meta-grid">
                <div>
                  <dt>名称</dt>
                  <dd>{detail.name || "—"}</dd>
                </div>
                <div>
                  <dt>类型</dt>
                  <dd>{detail.kb_type || "—"}</dd>
                </div>
                <div>
                  <dt>文档数</dt>
                  <dd>{formatKbCount(detail.stats?.file_count)}</dd>
                </div>
                <div>
                  <dt>分块数</dt>
                  <dd>{formatKbCount(detail.stats?.chunk_count)}</dd>
                </div>
                <div>
                  <dt>总大小</dt>
                  <dd>{formatKbBytes(detail.stats?.total_size)}</dd>
                </div>
                <div>
                  <dt>创建时间</dt>
                  <dd>{formatKbDateTime(detail.created_at)}</dd>
                </div>
              </dl>
            </div>

            {notice ? (
              <div
                className={`kb-notice is-${notice.tone}`}
                role={notice.tone === "error" ? "alert" : "status"}
              >
                {notice.text}
              </div>
            ) : null}

            <section className="kb-section">
              <div className="kb-section-heading">
                <h2>文档</h2>
                <span className="kb-section-count">
                  共 {formatKbCount(documentTotal)} 个
                </span>
              </div>

              {pollError ? (
                <p className="kb-poll-error" role="status">
                  自动刷新失败：{pollError}
                </p>
              ) : null}

              {documents.length > 0 ? (
                <KbDocumentTable
                  deletingFileId={deletingFileId}
                  documents={documents}
                  onDelete={(document) => {
                    setDeleteError("");
                    setDeleteTarget(document);
                  }}
                  onRetry={(document) => setRetryTarget(document)}
                  onShowReason={handleShowReason}
                />
              ) : (
                <EmptyState
                  description="上传 md、pdf、docx 或 txt 文件后，系统会自动解析并入库。"
                  title="暂无文档"
                />
              )}
            </section>

            {reasonDialog ? (
              <KbDialog
                footer={
                  <button
                    className="kb-secondary-button"
                    onClick={() => setReasonDialog(null)}
                    type="button"
                  >
                    关闭
                  </button>
                }
                onClose={() => setReasonDialog(null)}
                title={`失败原因 · ${reasonDialog.filename}`}
              >
                {reasonDialog.state === "loading" ? (
                  <LoadingState label="正在获取失败原因…" />
                ) : null}
                {reasonDialog.state === "error" ? (
                  <ErrorState message={reasonDialog.message ?? "获取失败原因失败"} />
                ) : null}
                {reasonDialog.state === "ready" && reasonDialog.status ? (
                  <div className="kb-dialog-stack">
                    <p className="kb-dialog-meta">
                      分块数：{formatKbCount(reasonDialog.status.chunk_count)}
                      {"　"}更新时间：
                      {formatKbDateTime(reasonDialog.status.updated_at)}
                    </p>
                    <div className="kb-dialog-reason">
                      {reasonDialog.status.error_message ||
                        "接口未返回失败原因，请在 xiaozhi 管理端查看详细日志。"}
                    </div>
                  </div>
                ) : null}
              </KbDialog>
            ) : null}

            {retryTarget ? (
              <KbDialog
                footer={
                  <button
                    className="kb-secondary-button"
                    onClick={() => setRetryTarget(null)}
                    type="button"
                  >
                    知道了
                  </button>
                }
                onClose={() => setRetryTarget(null)}
                title="重试入库"
              >
                <p className="kb-dialog-text">
                  重试入库尚未接入。请在 xiaozhi 管理端重新触发解析或入库。
                </p>
              </KbDialog>
            ) : null}

            {deleteTarget ? (
              <KbDialog
                dismissible={!deletingFileId}
                footer={
                  <>
                    <button
                      className="kb-secondary-button"
                      disabled={Boolean(deletingFileId)}
                      onClick={closeDeleteDialog}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="kb-danger-button"
                      disabled={Boolean(deletingFileId)}
                      onClick={handleDeleteConfirm}
                      type="button"
                    >
                      {deletingFileId ? "正在删除…" : "确认删除"}
                    </button>
                  </>
                }
                onClose={closeDeleteDialog}
                title="删除文档"
              >
                <p className="kb-dialog-text">
                  确定删除「{deleteTarget.filename}」吗？该操作会同时删除向量数据与对象存储中的文件，且不可撤销。
                </p>
                {deleteError ? <ErrorState message={deleteError} /> : null}
              </KbDialog>
            ) : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
