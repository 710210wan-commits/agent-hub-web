"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { KbAuthNotice } from "@/components/knowledge/kb-auth-notice";
import { KbDialog } from "@/components/knowledge/kb-dialog";
import { ResourcePageTemplate } from "@/components/resources/resource-page-template";
import { AppShell } from "@/components/shell/app-shell";
import { ErrorState } from "@/components/states/error-state";
import { knowledgeFixtures } from "@/config/resource-fixtures";
import { useKbAuthBridge } from "@/features/knowledge/use-kb-auth-bridge";
import {
  KbApiError,
  createKbDatabase,
  deleteKbDatabase,
  getKbDatabase,
  kbErrorMessage,
  listKbChunkPresets,
  listKbDatabases,
  listKbEmbeddingModels,
  updateKbDatabase,
  type KbChunkPreset,
  type KbDatabase,
  type KbEmbeddingModel,
} from "@/lib/kb-api";
import { useAuth } from "@/providers/auth-provider";

interface KnowledgeListItem {
  id: string;
  name: string;
  description: string;
  meta?: string;
}

interface EditorState {
  mode: "create" | "edit";
  kbId: string;
  name: string;
  description: string;
  embeddingModelSpec: string;
  chunkPresetId: string;
  autoGenerateQuestions: boolean;
  presets: KbChunkPreset[];
  models: KbEmbeddingModel[];
  loadingOptions: boolean;
  busy: boolean;
  error: string;
}

function toListItem(db: KbDatabase): KnowledgeListItem {
  return {
    id: db.kb_id,
    name: db.name,
    description: db.description,
    meta: db.supports_documents ? `文档库 · ${db.type}` : db.type,
  };
}

type PageState = "loading" | "error" | "ready";

export default function KnowledgePage() {
  // 401 分流：完整态自动 invalidate 回登录页；演示态页面内引导
  useKbAuthBridge();
  const { status: authStatus } = useAuth();
  const [items, setItems] = useState<KnowledgeListItem[]>([]);
  const [state, setState] = useState<PageState>("loading");
  const [isDemo, setIsDemo] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("加载失败，请稍后重试");
  const [needLogin, setNeedLogin] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KnowledgeListItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    // 演示模式：URL 带 ?demo=1 时用本地演示数据渲染页面（不请求后端），
    // 用于在登录/后端依赖未就绪时预览最终 UI 效果。
    // 演示与真实取数走同一条异步流程，保证状态流转一致。
    let cancelled = false;
    const url = new URLSearchParams(window.location.search);
    const isDemoMode = url.has("demo");
    const load: Promise<KnowledgeListItem[]> = isDemoMode
      ? Promise.resolve(knowledgeFixtures.map((entry) => ({ ...entry })))
      : listKbDatabases().then((databases) => databases.map(toListItem));

    load
      .then((rows) => {
        if (cancelled) return;
        setIsDemo(isDemoMode);
        setItems(rows);
        setState("ready");
        setNeedLogin(false);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setNeedLogin(error instanceof KbApiError && error.kind === "unauthorized");
        setErrorMessage(kbErrorMessage(error));
        setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authStatus, reloadKey]);

  function reloadList() {
    setReloadKey((current) => current + 1);
  }

  function openCreateEditor() {
    setEditor({
      mode: "create",
      kbId: "",
      name: "",
      description: "",
      embeddingModelSpec: "",
      chunkPresetId: "",
      autoGenerateQuestions: false,
      presets: [],
      models: [],
      loadingOptions: true,
      busy: false,
      error: "",
    });
    void loadEditorOptions("create", "");
  }

  function openEditEditor(item: KnowledgeListItem) {
    setEditor({
      mode: "edit",
      kbId: item.id,
      name: item.name,
      description: item.description,
      embeddingModelSpec: "",
      chunkPresetId: "",
      autoGenerateQuestions: false,
      presets: [],
      models: [],
      loadingOptions: true,
      busy: false,
      error: "",
    });
    void loadEditorOptions("edit", item.id);
  }

  /**
   * 加载表单下拉项（分块策略、嵌入模型）；编辑模式同时取库详情，
   * 回填当前分块策略与自动生成问题开关。加载失败不阻塞名称/描述编辑。
   */
  async function loadEditorOptions(mode: "create" | "edit", kbId: string) {
    try {
      const [presets, models, detail] = await Promise.all([
        listKbChunkPresets(),
        listKbEmbeddingModels(),
        mode === "edit" ? getKbDatabase(kbId) : Promise.resolve(null),
      ]);
      setEditor((current) => {
        if (!current || current.mode !== mode || current.kbId !== kbId) {
          return current;
        }
        return {
          ...current,
          presets,
          models,
          chunkPresetId: detail?.additional_params?.chunk_preset_id ?? "",
          autoGenerateQuestions: Boolean(
            detail?.additional_params?.auto_generate_questions,
          ),
          loadingOptions: false,
        };
      });
    } catch {
      setEditor((current) =>
        current ? { ...current, loadingOptions: false } : current,
      );
    }
  }

  function closeEditor() {
    if (editor?.busy) {
      return;
    }
    setEditor(null);
  }

  async function handleEditorSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || editor.busy) {
      return;
    }
    const name = editor.name.trim();
    if (!name) {
      setEditor({ ...editor, error: "请输入知识库名称" });
      return;
    }

    setEditor({ ...editor, busy: true, error: "" });
    try {
      const description = editor.description.trim();
      if (editor.mode === "create") {
        await createKbDatabase({
          name,
          description,
          embeddingModelSpec: editor.embeddingModelSpec || undefined,
          chunkPresetId: editor.chunkPresetId || undefined,
        });
      } else {
        await updateKbDatabase(editor.kbId, {
          name,
          description,
          chunkPresetId: editor.chunkPresetId || undefined,
          autoGenerateQuestions: editor.autoGenerateQuestions,
        });
      }
      setEditor(null);
      reloadList();
    } catch (error) {
      setEditor((current) =>
        current ? { ...current, busy: false, error: kbErrorMessage(error) } : current,
      );
    }
  }

  function openDeleteDialog(item: KnowledgeListItem) {
    setDeleteError("");
    setDeleteBusy(false);
    setDeleteTarget(item);
  }

  function closeDeleteDialog() {
    if (deleteBusy) {
      return;
    }
    setDeleteTarget(null);
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || deleteBusy) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError("");
    try {
      await deleteKbDatabase(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteBusy(false);
      reloadList();
    } catch (error) {
      setDeleteError(kbErrorMessage(error));
      setDeleteBusy(false);
    }
  }

  if (authStatus === "demo") {
    return (
      <AppShell title="知识库">
        <KbAuthNotice />
      </AppShell>
    );
  }

  return (
    <AppShell title="知识库">
      <ResourcePageTemplate
        title="知识库"
        description={isDemo ? "管理对话可选的知识来源（当前为演示数据）" : "管理对话可选的知识来源"}
        createLabel="新建知识库"
        detailBasePath="/knowledge"
        headerAction={
          isDemo ? undefined : (
            <button onClick={openCreateEditor} type="button">
              新建知识库
            </button>
          )
        }
        items={items}
        renderItem={(item, href) => (
          <div className="kb-database-card" key={item.id}>
            <Link className="kb-database-card-main" href={href}>
              <span className="resource-card-copy">
                <strong>{item.name}</strong>
                <span>{item.description}</span>
                {item.meta ? <small>{item.meta}</small> : null}
              </span>
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
            {isDemo ? null : (
              <div className="kb-database-card-actions">
                <button
                  className="kb-link-button"
                  onClick={() => openEditEditor(item)}
                  type="button"
                >
                  编辑
                </button>
                <button
                  className="kb-link-button"
                  onClick={() => openDeleteDialog(item)}
                  type="button"
                >
                  删除
                </button>
              </div>
            )}
          </div>
        )}
        state={state}
        errorSlot={
          state === "error" ? (
            needLogin ? (
              <KbAuthNotice />
            ) : (
              <ErrorState message={errorMessage} />
            )
          ) : undefined
        }
      />

      {editor ? (
        <KbDialog
          dismissible={!editor.busy}
          footer={
            <>
              <button
                className="kb-secondary-button"
                disabled={editor.busy}
                onClick={closeEditor}
                type="button"
              >
                取消
              </button>
              <button
                className="kb-primary-button"
                disabled={editor.busy}
                form="kb-editor-form"
                type="submit"
              >
                {editor.busy ? "保存中…" : "保存"}
              </button>
            </>
          }
          onClose={closeEditor}
          title={editor.mode === "create" ? "新建知识库" : "编辑知识库"}
        >
          <form className="kb-editor-form" id="kb-editor-form" onSubmit={handleEditorSubmit}>
            <label className="kb-login-field">
              <span>名称</span>
              <input
                autoFocus
                disabled={editor.busy}
                maxLength={80}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
                placeholder="请输入知识库名称"
                type="text"
                value={editor.name}
              />
            </label>

            <label className="kb-login-field">
              <span>描述（选填）</span>
              <textarea
                disabled={editor.busy}
                maxLength={200}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, description: event.target.value } : current,
                  )
                }
                placeholder="简要说明这个知识库的用途"
                rows={3}
                value={editor.description}
              />
            </label>

            {editor.mode === "create" ? (
              <label className="kb-login-field">
                <span>嵌入模型</span>
                <select
                  disabled={editor.busy || editor.loadingOptions}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, embeddingModelSpec: event.target.value }
                        : current,
                    )
                  }
                  value={editor.embeddingModelSpec}
                >
                  <option value="">自动（使用 xiaozhi 当前可用模型）</option>
                  {editor.models.map((model) => (
                    <option key={model.spec} value={model.spec}>
                      {model.display_name}
                      {model.dimension ? ` · ${model.dimension} 维` : ""}（{model.provider}）
                    </option>
                  ))}
                </select>
                <small className="kb-field-hint">
                  {editor.loadingOptions
                    ? "正在加载可选模型…"
                    : "建库后不可更换，请确认后再保存。"}
                </small>
              </label>
            ) : null}

            <label className="kb-login-field">
              <span>分块策略</span>
              <select
                disabled={editor.busy || editor.loadingOptions}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? { ...current, chunkPresetId: event.target.value }
                      : current,
                  )
                }
                value={editor.chunkPresetId}
              >
                <option value="">默认（沿用 xiaozhi 默认策略）</option>
                {editor.presets.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
              {(() => {
                const activePreset = editor.presets.find(
                  (preset) => preset.value === editor.chunkPresetId,
                );
                if (activePreset?.description) {
                  return <small className="kb-field-hint">{activePreset.description}</small>;
                }
                return editor.loadingOptions ? (
                  <small className="kb-field-hint">正在加载分块策略…</small>
                ) : null;
              })()}
            </label>

            {editor.mode === "edit" ? (
              <label className="kb-switch-field">
                <input
                  checked={editor.autoGenerateQuestions}
                  disabled={editor.busy}
                  onChange={(event) =>
                    setEditor((current) =>
                      current
                        ? { ...current, autoGenerateQuestions: event.target.checked }
                        : current,
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <strong>自动生成问题</strong>
                  <small>上传文档后自动生成测试问题，便于后续检索测试使用</small>
                </span>
              </label>
            ) : null}

            {editor.error ? <div className="kb-notice is-error">{editor.error}</div> : null}
          </form>
        </KbDialog>
      ) : null}

      {deleteTarget ? (
        <KbDialog
          dismissible={!deleteBusy}
          footer={
            <>
              <button
                className="kb-secondary-button"
                disabled={deleteBusy}
                onClick={closeDeleteDialog}
                type="button"
              >
                取消
              </button>
              <button
                className="kb-danger-button"
                disabled={deleteBusy}
                onClick={handleDeleteConfirm}
                type="button"
              >
                {deleteBusy ? "删除中…" : "确认删除"}
              </button>
            </>
          }
          onClose={closeDeleteDialog}
          title="删除知识库"
        >
          <p className="kb-dialog-text">
            将删除知识库「{deleteTarget.name}」及其下全部文档与解析结果，删除后不可恢复。
          </p>
          {deleteError ? <div className="kb-notice is-error">{deleteError}</div> : null}
        </KbDialog>
      ) : null}
    </AppShell>
  );
}
