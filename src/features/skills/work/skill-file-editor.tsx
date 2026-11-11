"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isSafeWorkSkillFilePath,
  type WorkSkill,
  type WorkSkillTreeNode,
} from "./contracts";
import type { WorkSkillsApi } from "./work-api";

export interface SkillFileEditorProps {
  api: WorkSkillsApi;
  skill: WorkSkill;
}

interface CreateDraft {
  content: string;
  isDir: boolean;
  path: string;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function TreeNodes({
  nodes,
  onSelect,
  selectedPath,
}: {
  nodes: WorkSkillTreeNode[];
  onSelect(node: WorkSkillTreeNode): void;
  selectedPath: string;
}) {
  return (
    <ul className="work-tree-list">
      {nodes.map((node) => (
        <li key={node.path}>
          <button
            aria-current={selectedPath === node.path ? "true" : undefined}
            className="work-tree-node"
            onClick={() => onSelect(node)}
            type="button"
          >
            <span aria-hidden="true">{node.is_dir ? "▸" : "·"}</span>
            {node.is_dir ? `目录 ${node.name}` : `文件 ${node.name}`}
          </button>
          {node.is_dir && node.children?.length ? (
            <TreeNodes nodes={node.children} onSelect={onSelect} selectedPath={selectedPath} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function SkillFileEditor({ api, skill }: SkillFileEditorProps) {
  const canEdit = skill.can_manage && !skill.is_builtin && skill.source_type !== "builtin";
  const [tree, setTree] = useState<WorkSkillTreeNode[]>([]);
  const [selectedPath, setSelectedPath] = useState("");
  const [selectedIsDir, setSelectedIsDir] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deletingRef = useRef(false);

  const loadFile = useCallback(async (path: string, signal?: AbortSignal) => {
    const file = await api.getSkillFile(skill.slug, path, signal);
    setSelectedPath(file.path);
    setSelectedIsDir(false);
    setContent(file.content);
  }, [api, skill.slug]);

  const loadTree = useCallback(async (signal?: AbortSignal) => {
    const nextTree = await api.getSkillTree(skill.slug, signal);
    setTree(nextTree);
  }, [api, skill.slug]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError(null);
      setSelectedPath("");
      setContent("");
      Promise.all([loadTree(controller.signal), loadFile("SKILL.md", controller.signal)])
        .catch((loadError: unknown) => {
          if (!(loadError instanceof DOMException && loadError.name === "AbortError")) {
            setError(errorMessage(loadError, "加载代码管理失败"));
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    });
    return () => controller.abort();
  }, [loadFile, loadTree]);

  async function selectNode(node: WorkSkillTreeNode) {
    setError(null);
    setSelectedPath(node.path);
    setSelectedIsDir(node.is_dir);
    if (node.is_dir) {
      setContent("");
      return;
    }
    try {
      await loadFile(node.path);
    } catch (loadError) {
      setError(errorMessage(loadError, "文件读取失败"));
    }
  }

  async function saveFile() {
    if (!canEdit || !selectedPath || selectedIsDir || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await api.updateSkillFile(skill.slug, selectedPath, content);
      setNotice("文件已保存");
    } catch (saveError) {
      setError(errorMessage(saveError, "保存失败"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  function openCreate(isDir: boolean) {
    setCreateError(null);
    setCreateDraft({ content: "", isDir, path: "" });
  }

  async function createNode() {
    if (!createDraft || creatingRef.current) return;
    const path = createDraft.path.trim();
    if (!isSafeWorkSkillFilePath(path)) {
      setCreateError("文件路径不合法");
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    setCreateError(null);
    try {
      await api.createSkillNode(skill.slug, {
        content: createDraft.isDir ? "" : createDraft.content,
        is_dir: createDraft.isDir,
        path,
      });
      setCreateDraft(null);
      await loadTree();
      setNotice("节点已创建");
    } catch (createFailure) {
      setCreateError(errorMessage(createFailure, "创建失败"));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }

  async function deleteNode() {
    if (!selectedPath || deletingRef.current) return;
    deletingRef.current = true;
    setDeleting(true);
    setError(null);
    try {
      await api.deleteSkillNode(skill.slug, selectedPath);
      setDeleteOpen(false);
      setSelectedPath("");
      setSelectedIsDir(false);
      setContent("");
      await loadTree();
      setNotice("节点已删除");
    } catch (deleteError) {
      setError(errorMessage(deleteError, "删除失败"));
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  }

  return (
    <div className="work-editor-workspace" data-testid="work-file-workspace">
      <aside className="work-file-tree">
        <header className="work-tree-heading">
          <strong>项目结构</strong>
          <div className="work-tree-actions" data-testid="work-tree-actions">
            {canEdit ? (
              <>
                <button aria-label="新建文件" onClick={() => openCreate(false)} type="button">＋文</button>
                <button aria-label="新建目录" onClick={() => openCreate(true)} type="button">＋夹</button>
              </>
            ) : null}
            <button aria-label="刷新目录树" onClick={() => void loadTree()} type="button">↻</button>
          </div>
        </header>
        <div className="work-tree-body">
          {loading ? <p className="work-inline-muted">正在加载目录…</p> : null}
          <TreeNodes nodes={tree} onSelect={(node) => void selectNode(node)} selectedPath={selectedPath} />
        </div>
      </aside>
      <section className="work-file-editor-pane">
        <header className="work-file-editor-heading">
          <span>{selectedPath || "未选择文件"}</span>
          {canEdit && selectedPath ? (
            <button className="work-link-danger" onClick={() => setDeleteOpen(true)} type="button">删除节点</button>
          ) : null}
        </header>
        {error ? <div className="work-inline-error" role="alert">{error}</div> : null}
        {notice ? <div className="work-inline-success" role="status">{notice}</div> : null}
        {!selectedPath || selectedIsDir ? (
          <div className="work-editor-empty">选择文件以开始编辑</div>
        ) : (
          <div className="work-code-editor">
            <textarea
              aria-label={`${selectedPath} 内容`}
              onChange={(event) => setContent(event.target.value)}
              readOnly={!canEdit}
              value={content}
            />
            {canEdit ? (
              <button className="work-button work-button-primary" disabled={saving} onClick={() => void saveFile()} type="button">
                {saving ? "保存中…" : "保存文件"}
              </button>
            ) : null}
          </div>
        )}
      </section>

      {createDraft ? (
        <div aria-labelledby="work-create-node-title" aria-modal="true" className="work-modal-layer" role="dialog">
          <button aria-label="关闭" className="work-modal-backdrop" onClick={() => setCreateDraft(null)} type="button" />
          <section className="work-modal work-node-dialog">
            <h2 id="work-create-node-title">{createDraft.isDir ? "新建目录" : "新建文件"}</h2>
            <label className="work-field">
              <span>路径</span>
              <input
                onChange={(event) => setCreateDraft({ ...createDraft, path: event.target.value })}
                placeholder="src/main.py"
                value={createDraft.path}
              />
            </label>
            {!createDraft.isDir ? (
              <label className="work-field">
                <span>内容</span>
                <textarea
                  onChange={(event) => setCreateDraft({ ...createDraft, content: event.target.value })}
                  rows={5}
                  value={createDraft.content}
                />
              </label>
            ) : null}
            {createError ? <p className="work-inline-error" role="alert">{createError}</p> : null}
            <footer className="work-modal-footer">
              <button className="work-button" onClick={() => setCreateDraft(null)} type="button">取消</button>
              <button className="work-button work-button-primary" disabled={creating} onClick={() => void createNode()} type="button">
                {creating ? "创建中…" : "创建"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {deleteOpen ? (
        <div aria-labelledby="work-delete-node-title" aria-modal="true" className="work-modal-layer" role="dialog">
          <button aria-label="关闭" className="work-modal-backdrop" onClick={() => setDeleteOpen(false)} type="button" />
          <section className="work-modal work-confirm-dialog">
            <h2 id="work-delete-node-title">删除 {selectedPath}</h2>
            <p>删除后无法恢复，请确认当前文件或目录不再需要。</p>
            <footer className="work-modal-footer">
              <button className="work-button" onClick={() => setDeleteOpen(false)} type="button">取消</button>
              <button className="work-button work-button-danger-fill" disabled={deleting} onClick={() => void deleteNode()} type="button">
                {deleting ? "删除中…" : "确认删除节点"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
