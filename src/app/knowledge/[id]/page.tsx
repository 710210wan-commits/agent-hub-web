"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  canIndexKbDocument,
  canParseKbDocument,
  createKbFolder,
  deleteKbDocument,
  downloadKbDocument,
  exportKbDatabase,
  getKbDatabase,
  getKbDocumentContent,
  getKbDocumentStatus,
  generateKbSampleQuestions,
  getKbQueryParams,
  getKbSampleQuestions,
  indexKbDocuments,
  kbErrorMessage,
  listKbDocuments,
  parseKbDocuments,
  testKbQuery,
  updateKbDatabase,
  uploadKbDocument,
  type KbDatabaseDetail,
  type KbDocument,
  type KbDocumentChunk,
  type KbDocumentStatus,
  type KbExportFormat,
  type KbQueryHit,
  type KbQueryParamField,
} from "@/lib/kb-api";
import {
  formatKbBytes,
  formatKbCount,
  formatKbDateTime,
} from "@/lib/kb-format";
import {
  KB_DOCUMENTS_PAGE_SIZE,
  clampKbPage,
  getKbTotalPages,
} from "@/lib/kb-pagination";

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
/** 与 xiaozhi 上传弹窗保持一致的支持格式 */
const ALLOWED_EXTENSIONS = ["md", "pdf", "docx", "txt", "jpg", "jpeg"];
const ALLOWED_EXTENSIONS_LABEL = ALLOWED_EXTENSIONS.join("、");
const ALLOWED_EXTENSIONS_ACCEPT = ALLOWED_EXTENSIONS.map((ext) => `.${ext}`).join(",");

type PagePhase = "loading" | "error" | "ready";

type KbStatusFilterKey =
  | "all"
  | "parse_waiting"
  | "parsing"
  | "parse_failed"
  | "index_waiting"
  | "indexing"
  | "index_failed"
  | "indexed";

type KbDetailTabKey = "files" | "query";

/** 导出格式：菜单里给出用途说明，避免只显示扩展名造成误解 */
const EXPORT_FORMATS: Array<{
  value: KbExportFormat;
  label: string;
  hint: string;
}> = [
  { value: "csv", label: "CSV 表格", hint: "Excel 可直接打开，适合核对内容" },
  { value: "md", label: "Markdown 文档", hint: "保留段落结构，适合再编辑" },
  { value: "txt", label: "纯文本 TXT", hint: "只要正文，适合快速浏览" },
];

/** 文档状态筛选：按解析/入库两阶段状态归类 */
const STATUS_FILTERS: Array<{
  key: KbStatusFilterKey;
  label: string;
  match: (document: KbDocument) => boolean;
}> = [
  { key: "all", label: "全部", match: () => true },
  {
    key: "parse_waiting",
    label: "待解析",
    match: (document) => document.parse_status === "waiting",
  },
  {
    key: "parsing",
    label: "解析中",
    match: (document) => document.parse_status === "parsing",
  },
  {
    key: "parse_failed",
    label: "解析失败",
    match: (document) => document.parse_status === "failed",
  },
  {
    key: "index_waiting",
    label: "待入库",
    match: (document) =>
      document.parse_status === "parsed" && document.index_status === "waiting",
  },
  {
    key: "indexing",
    label: "入库中",
    match: (document) => document.index_status === "indexing",
  },
  {
    key: "index_failed",
    label: "入库失败",
    match: (document) => document.index_status === "failed",
  },
  {
    key: "indexed",
    label: "已入库",
    match: (document) => document.index_status === "indexed",
  },
];

/** query-params 拉取失败时的检索模式兜底选项（与 xiaozhi 默认一致） */
const DEFAULT_SEARCH_MODE_OPTIONS = [
  { value: "vector", label: "向量" },
  { value: "keyword", label: "关键词（BM25）" },
  { value: "hybrid", label: "混合" },
];

/** 命中分展示：相似度/重排分统一保留 4 位小数 */
function formatQueryScore(value?: number): string {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toFixed(4)
    : "—";
}

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

interface PreviewDialogState {
  fileId: string;
  filename: string;
  state: "loading" | "ready" | "error";
  content?: string;
  chunkCount?: number;
  chunks?: KbDocumentChunk[];
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
  const [documentPage, setDocumentPage] = useState(1);
  const [loadError, setLoadError] = useState("");
  const [needLogin, setNeedLogin] = useState(false);
  const [notice, setNotice] = useState<ActionNotice | null>(null);

  const [refreshing, setRefreshing] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<KbDocument[] | null>(null);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [reasonDialog, setReasonDialog] = useState<ReasonDialogState | null>(
    null,
  );
  const [previewDialog, setPreviewDialog] = useState<PreviewDialogState | null>(
    null,
  );
  const [previewView, setPreviewView] = useState<"full" | "chunks">("full");
  const [acting, setActing] = useState(false);
  const [folderPath, setFolderPath] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [statusFilter, setStatusFilter] = useState<KbStatusFilterKey>("all");
  const [sampleQuestions, setSampleQuestions] = useState<string[]>([]);
  const [sampleLoadedKbId, setSampleLoadedKbId] = useState<string | null>(null);
  const [sampleGenerating, setSampleGenerating] = useState(false);
  const [queryParams, setQueryParams] = useState<KbQueryParamField[]>([]);
  const [queryText, setQueryText] = useState("");
  const [queryValues, setQueryValues] = useState<
    Record<string, string | number | boolean>
  >({});
  const [querying, setQuerying] = useState(false);
  // 结果按知识库 ID 记录：切换库后旧库的检索结果与错误自动失效，无需在 effect 里清空
  const [queryResults, setQueryResults] = useState<{
    kbId: string;
    hits: KbQueryHit[];
  } | null>(null);
  const [queryError, setQueryError] = useState<{
    kbId: string;
    message: string;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<KbDetailTabKey>("files");
  const [documentSearch, setDocumentSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorName, setEditorName] = useState("");
  const [editorDescription, setEditorDescription] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState("");

  const currentFolderId = folderPath.length
    ? folderPath[folderPath.length - 1].id
    : undefined;

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }
    function handleOutsideClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      if (target && !target.closest(".kb-export-group")) {
        setExportMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [exportMenuOpen]);
  const canDropFiles = phase === "ready" && !uploading && !deleting;

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!kbId) {
      return;
    }

    let cancelled = false;

    setDocumentPage(1);
    Promise.all([
      getKbDatabase(kbId),
      listKbDocuments(kbId, {
        page: 1,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
      }),
    ])
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

  // 样例问题随知识库切换加载；生成成功后原地替换，不随知识库切换重复拉取
  useEffect(() => {
    if (!kbId) {
      return;
    }
    let cancelled = false;
    getKbSampleQuestions(kbId)
      .then((result) => {
        if (cancelled) return;
        setSampleQuestions(result.questions);
        setSampleLoadedKbId(kbId);
      })
      .catch(() => {
        if (cancelled) return;
        setSampleQuestions([]);
        setSampleLoadedKbId(kbId);
      });

    return () => {
      cancelled = true;
    };
  }, [kbId]);

  // 检索参数定义随知识库切换加载：用 xiaozhi 的定义渲染表单与默认值，
  // 拉取失败时保持空数组，表单回落到内置默认（vector + top_k 10）。
  useEffect(() => {
    if (!kbId) {
      return;
    }
    let cancelled = false;
    getKbQueryParams(kbId)
      .then((fields) => {
        if (cancelled) return;
        setQueryParams(fields);
        const defaults: Record<string, string | number | boolean> = {};
        for (const field of fields) {
          if (field.default !== null && field.default !== undefined) {
            defaults[field.key] = field.default;
          }
        }
        setQueryValues(defaults);
      })
      .catch(() => {
        if (cancelled) return;
        setQueryParams([]);
        setQueryValues({});
      });

    return () => {
      cancelled = true;
    };
  }, [kbId]);

  useEffect(() => {
    if (phase !== "ready" || !hasPendingDocuments) {
      return;
    }

    // 仅在有文档处于待解析/解析中/待入库/入库中时轮询，全部落定后自动停止；
    // 轮询失败静默忽略，用户仍可点「刷新」手动获取。
    let cancelled = false;
    const timer = window.setInterval(() => {
      listKbDocuments(kbId, {
        page: documentPage,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
        parentId: currentFolderId,
      })
        .then((list) => {
          if (cancelled) return;
          setDocuments(list.documents);
          setDocumentTotal(list.total);
        })
        .catch(() => undefined);
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentFolderId, documentPage, hasPendingDocuments, kbId, phase]);

  async function reload() {
    const [database, list] = await Promise.all([
      getKbDatabase(kbId),
      listKbDocuments(kbId, {
        page: documentPage,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
        parentId: currentFolderId,
      }),
    ]);

    // 末页被删空时回退到上一页，避免停在空白页
    if (list.documents.length === 0 && documentPage > 1) {
      const fallback = clampKbPage(
        documentPage - 1,
        list.total,
        KB_DOCUMENTS_PAGE_SIZE,
      );
      const retry = await listKbDocuments(kbId, {
        page: fallback,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
        parentId: currentFolderId,
      });
      setDocumentPage(fallback);
      setDetail(database);
      setDocuments(retry.documents);
      setDocumentTotal(retry.total);
      return;
    }

    setDetail(database);
    setDocuments(list.documents);
    setDocumentTotal(list.total);
    // 已删除或已不存在的文档从选择集中剔除
    setSelectedFileIds((current) =>
      current.filter((fileId) =>
        list.documents.some((document) => document.file_id === fileId),
      ),
    );
  }

  async function goToDocumentPage(next: number) {
    const target = clampKbPage(
      next,
      documentTotal,
      KB_DOCUMENTS_PAGE_SIZE,
    );
    if (target === documentPage || refreshing) {
      return;
    }

    setDocumentPage(target);
    setSelectedFileIds([]);
    setSelectionMode(false);
    setRefreshing(true);
    try {
      const list = await listKbDocuments(kbId, {
        page: target,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
        parentId: currentFolderId,
      });
      setDocuments(list.documents);
      setDocumentTotal(list.total);
    } catch (error) {
      setDocumentPage(documentPage);
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleManualRefresh() {
    if (refreshing || phase !== "ready") {
      return;
    }
    setRefreshing(true);
    try {
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setRefreshing(false);
    }
  }

  function handleUploadClick() {
    if (uploading || phase !== "ready") {
      return;
    }
    setNotice(null);
    fileInputRef.current?.click();
  }

  function handleFilesSelected(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length > 0) {
      void handleUploadFiles(files);
    }
  }

  function handleDragEnter(event: DragEvent<HTMLElement>) {
    if (!canDropFiles) {
      return;
    }
    event.preventDefault();
    setDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!canDropFiles) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave(event: DragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);
    if (!canDropFiles) {
      return;
    }
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length > 0) {
      setNotice(null);
      void handleUploadFiles(files);
    }
  }

  async function handleUploadFiles(files: File[]) {
    // 先整体校验，不合规的文件跳过并汇总提示，合规的按顺序逐个上传
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      const extension = file.name.toLowerCase().split(".").pop() ?? "";
      if (!ALLOWED_EXTENSIONS.includes(extension)) {
        rejected.push(`${file.name}（格式不支持，仅支持 ${ALLOWED_EXTENSIONS_LABEL}）`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(`${file.name}（超过 100MB）`);
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length === 0) {
      setNotice({
        tone: "error",
        text: `没有可上传的文件：${rejected.join("；")}`,
      });
      return;
    }

    const succeeded: string[] = [];
    const duplicates: string[] = [];
    const failed: string[] = [];

    setUploading(true);
    setUploadProgress({ done: 0, total: accepted.length });
    try {
      for (const [index, file] of accepted.entries()) {
        setNotice({
          tone: "info",
          text: `正在上传（${index + 1}/${accepted.length}）：${file.name}`,
        });
        try {
          await uploadKbDocument(kbId, file, currentFolderId);
          succeeded.push(file.name);
        } catch (error) {
          // 409：该知识库内已存在相同内容文件（xiaozhi 按内容哈希去重）
          if (error instanceof KbApiError && error.status === 409) {
            duplicates.push(file.name);
          } else {
            failed.push(`${file.name}（${kbErrorMessage(error)}）`);
          }
        }
        setUploadProgress({ done: index + 1, total: accepted.length });
      }

      if (succeeded.length > 0) {
        try {
          await reload();
        } catch (refreshError) {
          setNotice({
            tone: "error",
            text: `已上传 ${succeeded.length} 个文档，但刷新列表失败：${kbErrorMessage(refreshError)}`,
          });
          return;
        }
      }

      if (
        failed.length === 0 &&
        rejected.length === 0 &&
        duplicates.length === 0
      ) {
        setNotice({
          tone: "success",
          text: `已上传 ${succeeded.length} 个文档`,
        });
      } else {
        const parts: string[] = [`成功 ${succeeded.length} 个`];
        if (failed.length > 0) {
          parts.push(`失败 ${failed.length} 个：${failed.join("；")}`);
        }
        if (duplicates.length > 0) {
          parts.push(
            `跳过 ${duplicates.length} 个（该知识库已存在相同内容）：${duplicates.join("、")}`,
          );
        }
        if (rejected.length > 0) {
          parts.push(`跳过 ${rejected.length} 个：${rejected.join("；")}`);
        }
        setNotice({
          // 只有真正的失败才算错误；内容重复或格式不支持属于「跳过」
          tone: failed.length > 0 && succeeded.length === 0 ? "error" : "info",
          text: parts.join("；"),
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function navigateToFolder(nextPath: Array<{ id: string; name: string }>) {
    setFolderPath(nextPath);
    setDocumentPage(1);
    setSelectedFileIds([]);
    setSelectionMode(false);
    setStatusFilter("all");
    setDocumentSearch("");
    setDragging(false);
    setNotice(null);
    try {
      const list = await listKbDocuments(kbId, {
        page: 1,
        pageSize: KB_DOCUMENTS_PAGE_SIZE,
        parentId: nextPath.length ? nextPath[nextPath.length - 1].id : undefined,
      });
      setDocuments(list.documents);
      setDocumentTotal(list.total);
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    }
  }

  function handleOpenFolder(document: KbDocument) {
    if (!document.is_folder) {
      return;
    }
    void navigateToFolder([
      ...folderPath,
      { id: document.file_id, name: document.filename },
    ]);
  }

  function openFolderDialog() {
    if (phase !== "ready") {
      return;
    }
    setFolderName("");
    setFolderError("");
    setFolderDialogOpen(true);
  }

  function closeFolderDialog() {
    if (creatingFolder) {
      return;
    }
    setFolderDialogOpen(false);
  }

  async function handleCreateFolder() {
    const name = folderName.trim();
    if (!name) {
      setFolderError("请输入文件夹名称");
      return;
    }
    if (creatingFolder) {
      return;
    }

    setCreatingFolder(true);
    setFolderError("");
    try {
      await createKbFolder(kbId, { name, parentId: currentFolderId });
      setFolderDialogOpen(false);
      setNotice({ tone: "success", text: `文件夹「${name}」已创建` });
      await reload();
    } catch (error) {
      setFolderError(kbErrorMessage(error));
    } finally {
      setCreatingFolder(false);
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

  async function handleShowPreview(document: KbDocument) {
    setPreviewView("full");
    setPreviewDialog({
      fileId: document.file_id,
      filename: document.filename,
      state: "loading",
    });

    try {
      const detail = await getKbDocumentContent(kbId, document.file_id);
      setPreviewDialog((current) =>
        current && current.fileId === document.file_id
          ? {
              ...current,
              state: "ready",
              content: detail.content,
              chunkCount: detail.chunk_count,
              chunks: detail.chunks,
            }
          : current,
      );
    } catch (error) {
      const message = kbErrorMessage(error);
      setPreviewDialog((current) =>
        current && current.fileId === document.file_id
          ? { ...current, state: "error", message }
          : current,
      );
    }
  }

  function toggleSelect(document: KbDocument, checked: boolean) {
    setSelectedFileIds((current) =>
      checked
        ? current.includes(document.file_id)
          ? current
          : [...current, document.file_id]
        : current.filter((fileId) => fileId !== document.file_id),
    );
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedFileIds(
      checked
        ? documents
            .filter((document) => !document.is_folder)
            .map((document) => document.file_id)
        : [],
    );
  }

  function enterSelectionMode() {
    setSelectedFileIds([]);
    setSelectionMode(true);
  }

  function exitSelectionMode() {
    if (deleting) {
      return;
    }
    setSelectedFileIds([]);
    setSelectionMode(false);
  }

  function openBatchDelete() {
    const targets = documents.filter(
      (document) =>
        !document.is_folder && selectedFileIds.includes(document.file_id),
    );
    if (targets.length === 0) {
      return;
    }
    setDeleteError("");
    setDeleteTargets(targets);
  }

  function closeDeleteDialog() {
    if (deleting) {
      return;
    }
    setDeleteTargets(null);
    setDeleteError("");
  }

  async function handleDeleteConfirm() {
    if (!deleteTargets || deleting) {
      return;
    }

    const targets = deleteTargets;
    const isBatch = targets.length > 1;
    setDeleting(true);
    setDeleteError("");

    const succeeded: string[] = [];
    const succeededIds: string[] = [];
    const failed: string[] = [];

    try {
      for (const target of targets) {
        try {
          await deleteKbDocument(kbId, target.file_id);
          succeeded.push(target.filename);
          succeededIds.push(target.file_id);
        } catch (error) {
          failed.push(`${target.filename}（${kbErrorMessage(error)}）`);
        }
      }

      if (succeededIds.length > 0) {
        setSelectedFileIds((current) =>
          current.filter((fileId) => !succeededIds.includes(fileId)),
        );
        try {
          await reload();
        } catch (refreshError) {
          setNotice({
            tone: "error",
            text: `删除完成，但刷新列表失败：${kbErrorMessage(refreshError)}`,
          });
        }
      }

      setDeleteTargets(null);
      if (isBatch) {
        // 批量删除结束后退出选择模式，勾选列隐藏
        setSelectedFileIds([]);
        setSelectionMode(false);
      }

      if (failed.length === 0) {
        setNotice({
          tone: "success",
          text:
            targets.length === 1
              ? `「${succeeded[0]}」已删除`
              : `已删除 ${succeeded.length} 个文档`,
        });
      } else {
        setNotice({
          tone: succeeded.length > 0 ? "info" : "error",
          text: `成功 ${succeeded.length} 个；失败 ${failed.length} 个：${failed.join("；")}`,
        });
      }
    } finally {
      setDeleting(false);
    }
  }

  async function submitDocumentTask(
    kind: "parse" | "index",
    targets: KbDocument[],
  ) {
    if (targets.length === 0 || acting) {
      return;
    }
    setActing(true);
    try {
      const fileIds = targets.map((target) => target.file_id);
      const result =
        kind === "parse"
          ? await parseKbDocuments(kbId, fileIds)
          : await indexKbDocuments(kbId, fileIds);
      setNotice({
        tone: "success",
        text: result.message || (kind === "parse" ? "解析任务已提交" : "入库任务已提交"),
      });
      await reload();
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setActing(false);
    }
  }

  async function handleDownload(document: KbDocument) {
    if (acting) {
      return;
    }
    setActing(true);
    try {
      await downloadKbDocument(kbId, document.file_id, document.filename);
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setActing(false);
    }
  }

  const selectedDocuments = documents.filter(
    (document) => !document.is_folder && selectedFileIds.includes(document.file_id),
  );
  const parseCandidates = selectedDocuments.filter(canParseKbDocument);
  const indexCandidates = selectedDocuments.filter(canIndexKbDocument);
  const sampleLoading = sampleLoadedKbId !== kbId;

  const activeFilter =
    STATUS_FILTERS.find((filter) => filter.key === statusFilter) ?? STATUS_FILTERS[0];
  const statusCounts = STATUS_FILTERS.map((filter) => ({
    ...filter,
    count: documents.filter(
      (document) => !document.is_folder && filter.match(document),
    ).length,
  }));
  const searchKeyword = documentSearch.trim().toLowerCase();
  const visibleDocuments = documents.filter((document) => {
    if (document.is_folder) {
      return true;
    }
    if (!activeFilter.match(document)) {
      return false;
    }
    if (!searchKeyword) {
      return true;
    }
    return document.filename.toLowerCase().includes(searchKeyword);
  });

  const documentTotalPages = getKbTotalPages(
    documentTotal,
    KB_DOCUMENTS_PAGE_SIZE,
  );

  function statusChipClass(filter: { key: KbStatusFilterKey; count: number }): string {
    if (statusFilter === filter.key) {
      return "kb-status-chip is-active";
    }
    if (
      (filter.key === "parse_failed" || filter.key === "index_failed") &&
      filter.count > 0
    ) {
      return "kb-status-chip is-alert";
    }
    return "kb-status-chip";
  }

  function queryField(key: string): KbQueryParamField | undefined {
    return queryParams.find((field) => field.key === key);
  }

  function queryValue(
    key: string,
    fallback: string | number | boolean,
  ): string | number | boolean {
    const value = queryValues[key];
    return value === undefined ? fallback : value;
  }

  function setQueryValue(key: string, value: string | number | boolean) {
    setQueryValues((current) => ({ ...current, [key]: value }));
  }

  const searchMode = String(queryValue("search_mode", "vector"));
  const searchModeOptions =
    queryField("search_mode")?.options ?? DEFAULT_SEARCH_MODE_OPTIONS;
  const rerankerOptions = queryField("reranker_model")?.options ?? [];
  // 没有可用的 rerank 模型时不开放开关，避免必然失败的重排调用
  const rerankerAvailable = rerankerOptions.length > 0;
  const rerankerEnabled =
    rerankerAvailable && Boolean(queryValue("use_reranker", false));
  const indexedCount = documents.filter(
    (document) => !document.is_folder && document.index_status === "indexed",
  ).length;
  const activeQueryResults =
    queryResults && queryResults.kbId === kbId ? queryResults.hits : null;
  const activeQueryError =
    queryError && queryError.kbId === kbId ? queryError.message : "";

  async function handleQueryTest() {
    const query = queryText.trim();
    if (!query || querying) {
      return;
    }
    setQuerying(true);
    setQueryError(null);
    setQueryResults(null);
    try {
      const meta: Record<string, unknown> = {
        search_mode: searchMode,
        final_top_k: Number(queryValue("final_top_k", 10)),
        similarity_threshold: Number(queryValue("similarity_threshold", 0)),
        include_distances: true,
      };
      if (searchMode === "hybrid") {
        meta.vector_weight = Number(queryValue("vector_weight", 0.7));
        meta.bm25_weight = Number(queryValue("bm25_weight", 0.3));
      }
      meta.use_reranker = rerankerEnabled;
      if (rerankerEnabled) {
        meta.reranker_model = String(
          queryValue("reranker_model", rerankerOptions[0]?.value ?? ""),
        );
        meta.recall_top_k = Number(queryValue("recall_top_k", 50));
      }

      const result = await testKbQuery(kbId, query, meta);
      setQueryResults({ kbId, hits: result.results });
    } catch (error) {
      setQueryError({ kbId, message: kbErrorMessage(error) });
    } finally {
      setQuerying(false);
    }
  }

  async function handleExport(format: KbExportFormat) {
    if (exporting || phase !== "ready") {
      return;
    }
    setExportMenuOpen(false);
    setExporting(true);
    setNotice(null);
    try {
      const baseName = detail?.name?.trim() || kbId;
      await exportKbDatabase(kbId, format, `${baseName}.${format}`);
      setNotice({
        tone: "success",
        text: `已导出 ${format.toUpperCase()} 文件`,
      });
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setExporting(false);
    }
  }

  async function handleGenerateSamples() {
    if (sampleGenerating || phase !== "ready") {
      return;
    }
    setSampleGenerating(true);
    setNotice(null);
    try {
      const result = await generateKbSampleQuestions(kbId, 10);
      setSampleQuestions(result.questions);
      setSampleLoadedKbId(kbId);
      setNotice({
        tone: result.questions.length > 0 ? "success" : "info",
        text:
          result.questions.length > 0
            ? `已生成 ${formatKbCount(result.questions.length)} 个样例问题`
            : "本次没有生成样例问题，请确认库内已有已入库文档后重试",
      });
    } catch (error) {
      setNotice({ tone: "error", text: kbErrorMessage(error) });
    } finally {
      setSampleGenerating(false);
    }
  }

  function openEditor() {
    setEditorName(detail?.name ?? "");
    setEditorDescription(detail?.description ?? "");
    setEditorError("");
    setEditorOpen(true);
  }

  function closeEditor() {
    if (editorBusy) {
      return;
    }
    setEditorOpen(false);
  }

  async function handleEditorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editorBusy) {
      return;
    }
    const name = editorName.trim();
    if (!name) {
      setEditorError("请输入知识库名称");
      return;
    }
    setEditorBusy(true);
    setEditorError("");
    try {
      await updateKbDatabase(kbId, {
        name,
        description: editorDescription.trim(),
      });
      setEditorOpen(false);
      setNotice({ tone: "success", text: "知识库信息已更新" });
      await reload();
    } catch (error) {
      setEditorError(kbErrorMessage(error));
    } finally {
      setEditorBusy(false);
    }
  }

  async function handleCopyId() {
    try {
      await navigator.clipboard.writeText(kbId);
      setNotice({ tone: "success", text: "已复制知识库 ID" });
    } catch {
      setNotice({ tone: "error", text: "复制失败，请手动选择页面上的 ID" });
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
            {selectionMode ? (
              <>
                <span className="kb-selection-hint">
                  已选 {formatKbCount(selectedFileIds.length)} 个
                </span>
                <button
                  className="kb-tint-button is-blue"
                  disabled={
                    acting ||
                    deleting ||
                    uploading ||
                    parseCandidates.length === 0
                  }
                  onClick={() => void submitDocumentTask("parse", parseCandidates)}
                  type="button"
                >
                  {acting
                    ? "处理中…"
                    : `解析选中（${formatKbCount(parseCandidates.length)}）`}
                </button>
                <button
                  className="kb-tint-button is-green"
                  disabled={
                    acting ||
                    deleting ||
                    uploading ||
                    indexCandidates.length === 0
                  }
                  onClick={() => void submitDocumentTask("index", indexCandidates)}
                  type="button"
                >
                  {acting
                    ? "处理中…"
                    : `入库选中（${formatKbCount(indexCandidates.length)}）`}
                </button>
                <button
                  className="kb-secondary-button"
                  disabled={deleting || uploading}
                  onClick={exitSelectionMode}
                  type="button"
                >
                  取消选择
                </button>
                <button
                  className="kb-danger-button"
                  disabled={
                    deleting ||
                    uploading ||
                    selectedFileIds.length === 0
                  }
                  onClick={openBatchDelete}
                  type="button"
                >
                  {deleting
                    ? "删除中…"
                    : `删除选中（${formatKbCount(selectedFileIds.length)}）`}
                </button>
              </>
            ) : (
              <>
                <button
                  className="kb-tint-button is-blue"
                  disabled={phase !== "ready" || uploading || deleting}
                  onClick={openFolderDialog}
                  type="button"
                >
                  新建文件夹
                </button>
                <button
                  className="kb-danger-outline-button"
                  disabled={
                    phase !== "ready" ||
                    uploading ||
                    deleting ||
                    !documents.some((document) => !document.is_folder)
                  }
                  onClick={enterSelectionMode}
                  type="button"
                >
                  批量操作
                </button>
              </>
            )}
            <div className="kb-export-group">
              <button
                aria-expanded={exportMenuOpen}
                aria-haspopup="menu"
                className="kb-tint-button is-blue"
                disabled={phase !== "ready" || exporting}
                onClick={() => setExportMenuOpen((open) => !open)}
                type="button"
              >
                {exporting ? "导出中…" : "导出"}
                <span aria-hidden="true" className="kb-export-caret">
                  ▾
                </span>
              </button>
              {exportMenuOpen ? (
                <div className="kb-export-menu" role="menu">
                  <span className="kb-export-menu-title">
                    导出全部文档的解析内容
                  </span>
                  {EXPORT_FORMATS.map((format) => (
                    <button
                      className="kb-export-menu-item"
                      key={format.value}
                      onClick={() => void handleExport(format.value)}
                      role="menuitem"
                      type="button"
                    >
                      <span className="kb-export-menu-label">{format.label}</span>
                      <span className="kb-export-menu-hint">{format.hint}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              className="kb-tint-button is-green"
              disabled={phase !== "ready" || refreshing}
              onClick={handleManualRefresh}
              type="button"
            >
              {refreshing ? "刷新中…" : "刷新"}
            </button>
            <button
              className="kb-primary-button"
              disabled={phase !== "ready" || uploading}
              onClick={handleUploadClick}
              type="button"
            >
              {uploading
                ? uploadProgress
                  ? `正在上传 ${uploadProgress.done}/${uploadProgress.total}`
                  : "正在上传…"
                : "上传文档"}
            </button>
            <input
              accept={ALLOWED_EXTENSIONS_ACCEPT}
              className="kb-file-input"
              multiple
              onChange={handleFilesSelected}
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
              <div className="kb-detail-title-row">
                <h1>{detail.name || "—"}</h1>
                <div className="kb-detail-title-actions">
                  <button
                    className="kb-link-button"
                    onClick={() => void handleCopyId()}
                    type="button"
                  >
                    复制 ID
                  </button>
                  <button
                    className="kb-tint-button is-blue"
                    onClick={openEditor}
                    type="button"
                  >
                    编辑知识库
                  </button>
                </div>
              </div>
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

            <div
              aria-label="知识库功能"
              className="kb-detail-tabs"
              role="tablist"
            >
              <button
                aria-selected={detailTab === "files"}
                className={`kb-detail-tab${detailTab === "files" ? " is-active" : ""}`}
                onClick={() => setDetailTab("files")}
                role="tab"
                type="button"
              >
                文件管理
              </button>
              <button
                aria-selected={detailTab === "query"}
                className={`kb-detail-tab${detailTab === "query" ? " is-active" : ""}`}
                onClick={() => setDetailTab("query")}
                role="tab"
                type="button"
              >
                检索测试
              </button>
            </div>

            {detailTab === "files" ? (
              <>
            {!sampleLoading ? (
              <section className="kb-sample-section">
                <div className="kb-section-heading">
                  <div className="kb-folder-bar">
                    <h2>样例问题</h2>
                    <span className="kb-section-hint">
                      由 xiaozhi 根据库内文件名生成，可用于后续检索测试
                    </span>
                  </div>
                  <div className="kb-section-actions">
                    {sampleQuestions.length > 0 ? (
                      <span className="kb-section-count">
                        共 {formatKbCount(sampleQuestions.length)} 个
                      </span>
                    ) : null}
                    <button
                      className="kb-tint-button is-blue"
                      disabled={sampleGenerating || phase !== "ready"}
                      onClick={() => void handleGenerateSamples()}
                      type="button"
                    >
                      {sampleGenerating
                        ? "生成中…"
                        : sampleQuestions.length > 0
                          ? "重新生成"
                          : "生成样例问题"}
                    </button>
                  </div>
                </div>
                {sampleQuestions.length > 0 ? (
                  <ol className="kb-sample-list">
                    {sampleQuestions.map((question, index) => (
                      <li className="kb-sample-item" key={`${index}-${question}`}>
                        {question}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="kb-sample-empty">
                    还没有样例问题。库内有已入库文档后，点右上角即可生成。
                  </p>
                )}
              </section>
            ) : null}

            <section
              className={`kb-section${dragging ? " is-dragging" : ""}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
            >
              <div className="kb-section-heading">
                <div className="kb-folder-bar">
                  <h2>文档</h2>
                  <nav aria-label="文件夹路径" className="kb-breadcrumb">
                    <button
                      className={`kb-breadcrumb-link${folderPath.length === 0 ? " is-current" : ""}`}
                      onClick={() => void navigateToFolder([])}
                      type="button"
                    >
                      全部文件
                    </button>
                    {folderPath.map((folder, index) => (
                      <span className="kb-breadcrumb-item" key={folder.id}>
                        <span aria-hidden="true">/</span>
                        <button
                          className={`kb-breadcrumb-link${index === folderPath.length - 1 ? " is-current" : ""}`}
                          onClick={() =>
                            void navigateToFolder(folderPath.slice(0, index + 1))
                          }
                          type="button"
                        >
                          {folder.name}
                        </button>
                      </span>
                    ))}
                  </nav>
                </div>
                <div className="kb-section-actions">
                  <input
                    aria-label="按文件名搜索"
                    className="kb-doc-search"
                    onChange={(event) => setDocumentSearch(event.target.value)}
                    placeholder="搜索当前页文件名"
                    type="search"
                    value={documentSearch}
                  />
                  {folderPath.length > 0 ? (
                    <button
                      className="kb-back-button"
                      onClick={() => void navigateToFolder(folderPath.slice(0, -1))}
                      type="button"
                    >
                      ← 返回上一层
                    </button>
                  ) : null}
                  <span className="kb-section-count">
                    共 {formatKbCount(documentTotal)} 个
                  </span>
                </div>
              </div>

              <div className="kb-status-filter" role="group" aria-label="按处理状态筛选">
                {statusCounts.map((filter) => (
                  <button
                    aria-pressed={statusFilter === filter.key}
                    className={statusChipClass(filter)}
                    key={filter.key}
                    onClick={() => setStatusFilter(filter.key)}
                    type="button"
                  >
                    {filter.label}
                    <span className="kb-status-chip-count">{filter.count}</span>
                  </button>
                ))}
              </div>

              {dragging ? (
                <div className="kb-drop-overlay">松开鼠标即可上传到当前目录</div>
              ) : null}

              {visibleDocuments.length > 0 ? (
                <KbDocumentTable
                  acting={acting}
                  deleting={deleting}
                  documents={visibleDocuments}
                  onDelete={(document) => {
                    setDeleteError("");
                    setDeleteTargets([document]);
                  }}
                  onDownload={(document) => void handleDownload(document)}
                  onIndex={(document) => void submitDocumentTask("index", [document])}
                  onOpenFolder={handleOpenFolder}
                  onParse={(document) => void submitDocumentTask("parse", [document])}
                  onPreview={handleShowPreview}
                  onShowReason={handleShowReason}
                  onToggleSelect={toggleSelect}
                  onToggleSelectAll={toggleSelectAll}
                  selectedIds={selectedFileIds}
                  selectionEnabled={selectionMode}
                />
              ) : (
                <EmptyState
                  description={
                    documents.length > 0
                      ? "当前筛选条件下暂无文档，可切换其他状态查看。"
                      : `可拖拽或选择 ${ALLOWED_EXTENSIONS_LABEL} 文件，上传后系统会自动解析并入库。`
                  }
                  title={
                    documents.length > 0
                      ? "无匹配文档"
                      : folderPath.length > 0
                        ? "此文件夹暂无内容"
                        : "暂无文档"
                  }
                />
              )}

              {documentTotalPages > 1 ? (
                <div className="kb-pagination">
                  <span className="kb-pagination-info">
                    第 {documentPage} / {documentTotalPages} 页
                  </span>
                  <div className="kb-pagination-actions">
                    <button
                      className="kb-back-button"
                      disabled={documentPage <= 1 || refreshing}
                      onClick={() => void goToDocumentPage(documentPage - 1)}
                      type="button"
                    >
                      上一页
                    </button>
                    <button
                      className="kb-back-button"
                      disabled={documentPage >= documentTotalPages || refreshing}
                      onClick={() => void goToDocumentPage(documentPage + 1)}
                      type="button"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
              </>
            ) : null}

            {detailTab === "query" ? (
            <section className="kb-section kb-query-section">
              <div className="kb-section-heading">
                <div className="kb-folder-bar">
                  <h2>检索测试</h2>
                  <span className="kb-section-hint">
                    用当前参数检索整个知识库，验证分块命中效果
                  </span>
                </div>
                <div className="kb-section-actions">
                  <span className="kb-section-count">
                    当前目录已入库 {formatKbCount(indexedCount)} 个
                  </span>
                </div>
              </div>

              <div className="kb-query-form">
                <label className="kb-query-input">
                  <span>检索内容</span>
                  <textarea
                    disabled={querying}
                    onChange={(event) => setQueryText(event.target.value)}
                    placeholder="输入问题或关键词，例如：报销流程需要哪些材料"
                    rows={3}
                    value={queryText}
                  />
                </label>

                <div className="kb-query-params">
                  <label className="kb-query-field">
                    <span>检索模式</span>
                    <select
                      disabled={querying}
                      onChange={(event) =>
                        setQueryValue("search_mode", event.target.value)
                      }
                      value={searchMode}
                    >
                      {searchModeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label ?? option.value}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="kb-query-field">
                    <span>返回条数（top_k）</span>
                    <input
                      disabled={querying}
                      max={100}
                      min={1}
                      onChange={(event) =>
                        setQueryValue("final_top_k", Number(event.target.value))
                      }
                      type="number"
                      value={Number(queryValue("final_top_k", 10))}
                    />
                  </label>

                  <label className="kb-query-field">
                    <span>相似度阈值</span>
                    <input
                      disabled={querying}
                      max={1}
                      min={0}
                      onChange={(event) =>
                        setQueryValue(
                          "similarity_threshold",
                          Number(event.target.value),
                        )
                      }
                      step={0.05}
                      type="number"
                      value={Number(queryValue("similarity_threshold", 0))}
                    />
                  </label>

                  {searchMode === "hybrid" ? (
                    <>
                      <label className="kb-query-field">
                        <span>向量权重</span>
                        <input
                          disabled={querying}
                          max={1}
                          min={0}
                          onChange={(event) =>
                            setQueryValue(
                              "vector_weight",
                              Number(event.target.value),
                            )
                          }
                          step={0.05}
                          type="number"
                          value={Number(queryValue("vector_weight", 0.7))}
                        />
                      </label>
                      <label className="kb-query-field">
                        <span>BM25 权重</span>
                        <input
                          disabled={querying}
                          max={1}
                          min={0}
                          onChange={(event) =>
                            setQueryValue(
                              "bm25_weight",
                              Number(event.target.value),
                            )
                          }
                          step={0.05}
                          type="number"
                          value={Number(queryValue("bm25_weight", 0.3))}
                        />
                      </label>
                    </>
                  ) : null}

                  {rerankerAvailable ? (
                    <>
                      <label className="kb-query-checkbox">
                        <input
                          checked={Boolean(queryValue("use_reranker", false))}
                          disabled={querying}
                          onChange={(event) =>
                            setQueryValue("use_reranker", event.target.checked)
                          }
                          type="checkbox"
                        />
                        <span>启用重排</span>
                      </label>
                      {rerankerEnabled ? (
                        <label className="kb-query-field">
                          <span>重排模型</span>
                          <select
                            disabled={querying}
                            onChange={(event) =>
                              setQueryValue(
                                "reranker_model",
                                event.target.value,
                              )
                            }
                            value={String(
                              queryValue(
                                "reranker_model",
                                rerankerOptions[0]?.value ?? "",
                              ),
                            )}
                          >
                            {rerankerOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label ?? option.value}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </>
                  ) : (
                    <span className="kb-query-hint">
                      当前环境未配置可用的重排模型，重排不可开启
                    </span>
                  )}
                </div>

                <div className="kb-query-actions">
                  <button
                    className="kb-primary-button"
                    disabled={querying || !queryText.trim()}
                    onClick={() => void handleQueryTest()}
                    type="button"
                  >
                    {querying ? "检索中…" : "开始检索"}
                  </button>
                  {activeQueryResults && !querying ? (
                    <span className="kb-query-meta">
                      命中 {formatKbCount(activeQueryResults.length)} 个分块
                    </span>
                  ) : null}
                </div>
              </div>

              {activeQueryError ? <ErrorState message={activeQueryError} /> : null}

              {activeQueryResults ? (
                activeQueryResults.length > 0 ? (
                  <ol className="kb-query-results">
                    {activeQueryResults.map((hit, index) => (
                      <li
                        className="kb-query-hit"
                        key={hit.chunk_id ?? `${index}-${hit.file_name ?? ""}`}
                      >
                        <div className="kb-query-hit-head">
                          <span className="kb-query-rank">#{index + 1}</span>
                          <span className="kb-query-file">
                            {hit.file_name || "未知文件"}
                          </span>
                          <span className="kb-query-scores">
                            相似度 {formatQueryScore(hit.similarity)}
                            {typeof hit.rerank_score === "number"
                              ? `　重排 ${formatQueryScore(hit.rerank_score)}`
                              : ""}
                          </span>
                        </div>
                        <div className="kb-query-content">{hit.content}</div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="kb-dialog-text">
                    未命中任何分块，可调整检索模式、阈值，或确认文档已完成入库。
                  </p>
                )
              ) : null}
            </section>
            ) : null}

            {editorOpen ? (
              <KbDialog
                footer={
                  <>
                    <button
                      className="kb-secondary-button"
                      disabled={editorBusy}
                      onClick={closeEditor}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="kb-primary-button"
                      disabled={editorBusy}
                      form="kb-detail-editor-form"
                      type="submit"
                    >
                      {editorBusy ? "保存中…" : "保存"}
                    </button>
                  </>
                }
                onClose={closeEditor}
                title="编辑知识库"
              >
                <form
                  className="kb-editor-form"
                  id="kb-detail-editor-form"
                  onSubmit={handleEditorSubmit}
                >
                  <label className="kb-login-field">
                    <span>名称</span>
                    <input
                      autoFocus
                      disabled={editorBusy}
                      maxLength={80}
                      onChange={(event) => setEditorName(event.target.value)}
                      placeholder="请输入知识库名称"
                      type="text"
                      value={editorName}
                    />
                  </label>
                  <label className="kb-login-field">
                    <span>描述（选填）</span>
                    <textarea
                      disabled={editorBusy}
                      maxLength={200}
                      onChange={(event) =>
                        setEditorDescription(event.target.value)
                      }
                      placeholder="简要说明这个知识库的用途"
                      rows={3}
                      value={editorDescription}
                    />
                  </label>
                  {editorError ? (
                    <div className="kb-notice is-error">{editorError}</div>
                  ) : null}
                </form>
              </KbDialog>
            ) : null}

            {previewDialog ? (
              <KbDialog
                footer={
                  <button
                    className="kb-secondary-button"
                    onClick={() => setPreviewDialog(null)}
                    type="button"
                  >
                    关闭
                  </button>
                }
                onClose={() => setPreviewDialog(null)}
                title={`预览 · ${previewDialog.filename}`}
                wide
              >
                {previewDialog.state === "loading" ? (
                  <LoadingState label="正在加载文档内容…" />
                ) : null}
                {previewDialog.state === "error" ? (
                  <ErrorState
                    message={previewDialog.message ?? "加载文档内容失败"}
                  />
                ) : null}
                {previewDialog.state === "ready" ? (
                  <div className="kb-preview">
                    <div
                      aria-label="文档内容视图"
                      className="kb-preview-tabs"
                      role="tablist"
                    >
                      <button
                        aria-selected={previewView === "full"}
                        className={`kb-preview-tab${previewView === "full" ? " is-active" : ""}`}
                        onClick={() => setPreviewView("full")}
                        role="tab"
                        type="button"
                      >
                        全文
                      </button>
                      <button
                        aria-selected={previewView === "chunks"}
                        className={`kb-preview-tab${previewView === "chunks" ? " is-active" : ""}`}
                        onClick={() => setPreviewView("chunks")}
                        role="tab"
                        type="button"
                      >
                        分块
                        <span className="kb-preview-tab-count">
                          {formatKbCount(previewDialog.chunkCount ?? 0)}
                        </span>
                      </button>
                    </div>

                    {previewView === "full" ? (
                      previewDialog.content ? (
                        <div className="kb-preview-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {previewDialog.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="kb-dialog-text">
                          该文档暂无可预览内容，可能尚未解析完成，请稍后刷新再试。
                        </p>
                      )
                    ) : previewDialog.chunks &&
                      previewDialog.chunks.length > 0 ? (
                      <div className="kb-chunk-list">
                        {previewDialog.chunks.map((chunk) => (
                          <article className="kb-chunk-item" key={chunk.id}>
                            <header className="kb-chunk-item-head">
                              <span className="kb-chunk-item-title">
                                分块 {chunk.order + 1}
                              </span>
                              <span className="kb-chunk-item-meta">
                                {formatKbCount(chunk.content.length)} 字
                              </span>
                            </header>
                            <p className="kb-chunk-item-body">{chunk.content}</p>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="kb-dialog-text">
                        该文档暂无分块数据，通常需要完成入库后才会产生分块；可先查看全文或稍后刷新。
                      </p>
                    )}
                  </div>
                ) : null}
              </KbDialog>
            ) : null}

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

            {folderDialogOpen ? (
              <KbDialog
                dismissible={!creatingFolder}
                footer={
                  <>
                    <button
                      className="kb-secondary-button"
                      disabled={creatingFolder}
                      onClick={closeFolderDialog}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="kb-primary-button"
                      disabled={creatingFolder}
                      onClick={handleCreateFolder}
                      type="button"
                    >
                      {creatingFolder ? "创建中…" : "创建"}
                    </button>
                  </>
                }
                onClose={closeFolderDialog}
                title={
                  currentFolderId
                    ? `新建子文件夹（${folderPath[folderPath.length - 1]?.name}）`
                    : "新建文件夹"
                }
              >
                <label className="kb-login-field">
                  <span>文件夹名称</span>
                  <input
                    autoFocus
                    disabled={creatingFolder}
                    maxLength={120}
                    onChange={(event) => setFolderName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void handleCreateFolder();
                      }
                    }}
                    placeholder="请输入文件夹名称"
                    type="text"
                    value={folderName}
                  />
                </label>
                {folderError ? <ErrorState message={folderError} /> : null}
              </KbDialog>
            ) : null}

            {deleteTargets ? (
              <KbDialog
                dismissible={!deleting}
                footer={
                  <>
                    <button
                      className="kb-secondary-button"
                      disabled={deleting}
                      onClick={closeDeleteDialog}
                      type="button"
                    >
                      取消
                    </button>
                    <button
                      className="kb-danger-button"
                      disabled={deleting}
                      onClick={handleDeleteConfirm}
                      type="button"
                    >
                      {deleting ? "正在删除…" : "确认删除"}
                    </button>
                  </>
                }
                onClose={closeDeleteDialog}
                title={
                  deleteTargets.length > 1
                    ? `批量删除文档（${deleteTargets.length} 个）`
                    : deleteTargets[0]?.is_folder
                      ? "删除文件夹"
                      : "删除文档"
                }
              >
                {deleteTargets.length > 1 ? (
                  <div className="kb-dialog-text">
                    <p>
                      确定删除选中的 {deleteTargets.length} 个文档吗？该操作会同时删除向量数据与对象存储中的文件，且不可撤销。
                    </p>
                    <ul className="kb-dialog-list">
                      {deleteTargets.map((target) => (
                        <li key={target.file_id}>{target.filename}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="kb-dialog-text">
                    {deleteTargets[0]?.is_folder
                      ? `确定删除文件夹「${deleteTargets[0]?.filename}」吗？其中的子文件夹与文档会一并删除，且不可撤销。`
                      : `确定删除「${deleteTargets[0]?.filename}」吗？该操作会同时删除向量数据与对象存储中的文件，且不可撤销。`}
                  </p>
                )}
                {deleteError ? <ErrorState message={deleteError} /> : null}
              </KbDialog>
            ) : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}
