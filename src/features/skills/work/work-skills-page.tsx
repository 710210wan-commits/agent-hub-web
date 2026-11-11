"use client";

import { Loader2, RefreshCw, Search, Upload } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { InlineError } from "@/components/states/inline-error";
import { LoadingState } from "@/components/states/loading-state";

import { isAllowedWorkSkillUploadFileName, WORK_SKILL_BATCH_DELETE_MAX, type WorkSkill, type WorkSkillInstallDraft, type WorkSkillShareConfig } from "./contracts";
import { InstallDraftDialog } from "./install-draft-dialog";
import { SkillPreviewDialog } from "./skill-preview-dialog";
import { InstalledWorkSkillCard, RecommendedWorkSkillCard } from "./skill-card";
import { RemoteInstallDialog } from "./remote-install-dialog";
import { useWorkSkills } from "./use-work-skills";
import { WorkConfirmDialog } from "./work-confirm-dialog";
import { getBrowserWorkSkillsApi, WorkSkillsApiError, type WorkSkillsApi } from "./work-api";
import { filterInstalledRecommended, matchRecommendedOption, WORK_RECOMMENDED_SKILLS, type RecommendedSkill } from "./work-recommended";

export interface WorkSkillsPageProps {
  api?: WorkSkillsApi;
  identityGeneration?: number;
  /** “去管理”导航回调；由路由层（Task 5）注入。 */
  onManageSkill?: (slug: string) => void;
}

export function WorkSkillsPage({
  api,
  identityGeneration = 0,
  onManageSkill,
}: WorkSkillsPageProps) {
  const client = api ?? getBrowserWorkSkillsApi();
  return (
    <WorkSkillsMarket
      key={identityGeneration}
      api={client}
      identityGeneration={identityGeneration}
      onManageSkill={onManageSkill}
    />
  );
}

type ConfirmRequest =
  | { kind: "batch"; slugs: string[] }
  | { kind: "uninstall"; skill: WorkSkill };

function WorkSkillsMarket({
  api,
  identityGeneration,
  onManageSkill,
}: {
  api: WorkSkillsApi;
  identityGeneration: number;
  onManageSkill?: (slug: string) => void;
}) {
  const { refresh, setEnabled, state } = useWorkSkills(api, identityGeneration);

  const [searchQuery, setSearchQuery] = useState("");
  const [batchMode, setBatchMode] = useState(false);
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [togglingSlugs, setTogglingSlugs] = useState<string[]>([]);
  const [previewSkill, setPreviewSkill] = useState<WorkSkill | null>(null);
  const [previewMarkdown, setPreviewMarkdown] = useState("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [remoteOpen, setRemoteOpen] = useState(false);
  const [remoteInitialSource, setRemoteInitialSource] = useState<string | undefined>(undefined);
  const [drafts, setDrafts] = useState<WorkSkillInstallDraft[] | null>(null);
  const [draftConfirming, setDraftConfirming] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [installingSources, setInstallingSources] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewSeq = useRef(0);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const skills = useMemo(
    () => (state.kind === "success" || state.kind === "refreshing" ? state.skills : []),
    [state],
  );
  const loading = state.kind === "loading";

  const showToast = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 1800);
  };

  const matchesSearch = useCallback(
    (text: string) => {
      const query = searchQuery.trim().toLowerCase();
      if (!query) return true;
      return text.toLowerCase().includes(query);
    },
    [searchQuery],
  );

  const recommended = useMemo(
    () => filterInstalledRecommended(WORK_RECOMMENDED_SKILLS, skills),
    [skills],
  );

  const visibleGroups = useMemo(() => {
    const installedMatched = skills.filter((skill) =>
      matchesSearch([skill.name, skill.slug, skill.description].filter(Boolean).join(" ")),
    );
    return [
      {
        items: batchMode
          ? []
          : recommended
              .filter((item) => matchesSearch([item.name, item.slug, item.description].join(" ")))
              .map((item) => ({ kind: "recommended" as const, item })),
        key: "recommended",
        title: "推荐",
      },
      {
        items: installedMatched
          .filter((skill) => skill.source_type === "builtin")
          .map((skill) => ({ kind: "installed" as const, skill })),
        key: "builtin",
        title: "内置",
      },
      {
        items: installedMatched
          .filter((skill) => skill.source_type !== "builtin")
          .map((skill) => ({ kind: "installed" as const, skill })),
        key: "uploaded",
        title: "上传的",
      },
    ].filter((group) => group.items.length > 0);
  }, [batchMode, matchesSearch, recommended, skills]);

  const deletableSlugs = useMemo(
    () =>
      skills
        .filter((skill) => skill.can_manage && !skill.is_builtin)
        .filter((skill) =>
          matchesSearch([skill.name, skill.slug, skill.description].filter(Boolean).join(" ")),
        )
        .map((skill) => skill.slug),
    [matchesSearch, skills],
  );

  const handleToggleEnabled = async (skill: WorkSkill) => {
    if (!skill.can_manage || togglingSlugs.includes(skill.slug)) return;
    const next = skill.enabled === false;
    setTogglingSlugs((current) => [...current, skill.slug]);
    try {
      await setEnabled(skill.slug, next);
      showToast(`Skill 已${next ? "启用" : "禁用"}`);
    } catch (error) {
      showToast(errorMessage(error, "更新 Skill 启用状态失败"));
    } finally {
      setTogglingSlugs((current) => current.filter((slug) => slug !== skill.slug));
    }
  };

  const handleCardOpen = (skill: WorkSkill) => {
    if (batchMode) {
      handleToggleSelect(skill.slug);
      return;
    }
    void openPreview(skill);
  };

  const openPreview = async (skill: WorkSkill) => {
    const seq = ++previewSeq.current;
    setPreviewSkill(skill);
    setPreviewMarkdown("");
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const file = await api.getSkillFile(skill.slug, "SKILL.md");
      if (seq !== previewSeq.current) return;
      setPreviewMarkdown(file.content);
    } catch (error) {
      if (seq !== previewSeq.current) return;
      setPreviewError(errorMessage(error, "读取 SKILL.md 失败"));
    } finally {
      if (seq === previewSeq.current) setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    previewSeq.current += 1;
    setPreviewSkill(null);
  };

  const handleToggleSelect = (slug: string) => {
    const target = skills.find((skill) => skill.slug === slug);
    if (!target?.can_manage || target.is_builtin) return;
    setSelectedSlugs((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  };

  const handleBatchSelectAll = () => setSelectedSlugs(deletableSlugs);
  const handleBatchSelectNone = () => setSelectedSlugs([]);
  const handleBatchSelectInvert = () =>
    setSelectedSlugs(deletableSlugs.filter((slug) => !selectedSlugs.includes(slug)));

  const exitBatchMode = () => {
    setBatchMode(false);
    setSelectedSlugs([]);
  };

  const handleBatchDelete = () => {
    const slugs = selectedSlugs.filter((slug) => deletableSlugs.includes(slug));
    if (slugs.length === 0) return;
    if (slugs.length > WORK_SKILL_BATCH_DELETE_MAX) {
      showToast(`批量删除最多 ${WORK_SKILL_BATCH_DELETE_MAX} 个 Skill`);
      return;
    }
    setConfirmRequest({ kind: "batch", slugs });
  };

  const handleUninstall = (skill: WorkSkill) => {
    setConfirmRequest({ kind: "uninstall", skill });
  };

  const handleConfirm = async () => {
    if (!confirmRequest || confirmBusy) return;
    setConfirmBusy(true);
    try {
      if (confirmRequest.kind === "uninstall") {
        await api.deleteSkill(confirmRequest.skill.slug);
        showToast("Skill 已卸载");
        closePreview();
      } else {
        const results = await api.deleteSkillsBatch(confirmRequest.slugs);
        const successCount = results.filter((item) => item.success).length;
        const failedCount = results.length - successCount;
        showToast(
          failedCount === 0
            ? `批量删除成功，已删除 ${successCount} 个技能`
            : `批量删除完成：成功 ${successCount} 个，失败 ${failedCount} 个`,
        );
        exitBatchMode();
      }
      setConfirmRequest(null);
      refresh();
    } catch (error) {
      showToast(errorMessage(error, "删除失败"));
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleUploadFile = async (file: File | undefined) => {
    if (!file) return;
    if (!isAllowedWorkSkillUploadFileName(file.name)) {
      showToast("仅支持上传 .zip 文件或 SKILL.md 文件");
      return;
    }
    if (importBusy) return;
    setImportBusy(true);
    try {
      const draft = await api.prepareSkillUpload(file);
      setDrafts([draft]);
      showToast("解析完成，请确认 Skill 生效范围");
    } catch (error) {
      showToast(errorMessage(error, "解析 Skill 失败"));
    } finally {
      setImportBusy(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  };

  const handleRecommendedInstall = async (item: RecommendedSkill) => {
    if (installingSources.length > 0 || installingSources.includes(item.source)) return;
    setInstallingSources((current) => [...current, item.source]);
    setRemoteInitialSource(item.source);
    try {
      const options = await api.listRemoteSkills(item.source);
      const matched = matchRecommendedOption(item, options);
      if (!matched?.name) {
        setRemoteOpen(true);
        showToast("已拉取推荐来源，请选择要安装的 Skill");
        return;
      }
      const draft = await api.prepareRemoteSkills(item.source, [matched.name]);
      setDrafts([draft]);
      showToast("解析完成，请确认 Skill 生效范围");
    } catch (error) {
      showToast(errorMessage(error, "解析推荐 Skill 失败"));
    } finally {
      setInstallingSources((current) => current.filter((source) => source !== item.source));
    }
  };

  const handleRemoteDrafts = (prepared: WorkSkillInstallDraft[]) => {
    setRemoteOpen(false);
    setDrafts(prepared);
    showToast("解析完成，请确认 Skill 生效范围");
  };

  const handleDraftConfirm = async (shareConfig: WorkSkillShareConfig) => {
    if (!drafts || draftConfirming) return;
    setDraftConfirming(true);
    try {
      const results = [];
      for (const draft of drafts) {
        results.push(...(await api.confirmInstallDraft(draft.draft_id, shareConfig)));
      }
      const successCount = results.filter((item) => item.success).length;
      const failedCount = results.length - successCount;
      showToast(
        failedCount === 0
          ? `已添加 ${successCount} 个 Skill`
          : `添加完成：成功 ${successCount} 个，失败 ${failedCount} 个`,
      );
      setDrafts(null);
      refresh();
    } catch (error) {
      showToast(errorMessage(error, "确认添加 Skill 失败"));
    } finally {
      setDraftConfirming(false);
    }
  };

  const handleDraftCancel = async () => {
    if (!drafts || draftConfirming) return;
    const draftIds = drafts.map((draft) => draft.draft_id);
    setDrafts(null);
    await Promise.allSettled(draftIds.map((id) => api.discardInstallDraft(id)));
  };

  return (
    <section className="work-page">
      <header className="page-heading">
        <div>
          <div className="work-title-row">
            <h1>Skill</h1>
            {skills.length > 0 ? <span className="work-count-badge">{skills.length} 个已安装</span> : null}
          </div>
          <p>发现、安装并维护办公智能体的 Skill。</p>
        </div>
      </header>

      <div className="work-shoulder">
        <label className="work-search">
          <Search aria-hidden="true" size={15} />
          <input
            aria-label="搜索技能"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索技能..."
            type="search"
            value={searchQuery}
          />
        </label>
        {batchMode ? (
          <div className="work-actions">
            <button className="work-link-button" onClick={handleBatchSelectAll} type="button">
              全选
            </button>
            <button className="work-link-button" onClick={handleBatchSelectInvert} type="button">
              反选
            </button>
            <button className="work-link-button" onClick={handleBatchSelectNone} type="button">
              清空
            </button>
            <button
              className="work-button work-button-danger-fill"
              disabled={selectedSlugs.length === 0}
              onClick={handleBatchDelete}
              type="button"
            >
              批量删除 ({selectedSlugs.length})
            </button>
            <button className="work-button" onClick={exitBatchMode} type="button">
              退出管理
            </button>
          </div>
        ) : (
          <div className="work-actions">
            <button
              className="work-button"
              disabled={loading || importBusy || deletableSlugs.length === 0}
              onClick={() => setBatchMode(true)}
              type="button"
            >
              批量管理
            </button>
            <button
              className="work-button"
              disabled={loading || importBusy}
              onClick={() => {
                setRemoteInitialSource(undefined);
                setRemoteOpen(true);
              }}
              type="button"
            >
              远程安装
            </button>
            <label
              className={importBusy ? "work-button work-button-primary is-disabled" : "work-button work-button-primary"}
              htmlFor="work-skill-upload"
            >
              {importBusy ? <Loader2 aria-hidden="true" className="work-spin" size={13} /> : <Upload aria-hidden="true" size={13} />}
              上传 Skill
            </label>
            <input
              accept=".zip,.md"
              hidden
              id="work-skill-upload"
              onChange={(event) => void handleUploadFile(event.target.files?.[0])}
              ref={uploadInputRef}
              type="file"
            />
            <button
              aria-label="刷新 Skills"
              className="work-icon-button"
              disabled={loading}
              onClick={refresh}
              title="刷新 Skills"
              type="button"
            >
              <RefreshCw aria-hidden="true" size={14} />
            </button>
          </div>
        )}
      </div>

      {state.kind === "error" && !state.skills ? (
        <EmptyState
          description={`${state.error.userMessage}（${state.error.code}）`}
          title="Work Skill 加载失败"
        />
      ) : null}
      {state.kind === "error" && state.skills ? <InlineError message={state.error.userMessage} /> : null}
      {loading ? <LoadingState label="正在加载 Skills…" /> : null}

      {!loading && visibleGroups.length === 0 ? (
        <EmptyState
          description={searchQuery ? "换个关键词试试，或清空搜索条件。" : "可以从远程仓库安装，或上传本地 Skill 文件。"}
          title={searchQuery ? "没有匹配的 Skill" : "还没有添加 Skill"}
        />
      ) : null}

      {visibleGroups.map((group) => (
        <section className="work-group" data-group={group.key} key={group.key}>
          <h2 className="work-group-title">{group.title}</h2>
          <div className="work-grid">
            {group.items.map((entry) =>
              entry.kind === "recommended" ? (
                <RecommendedWorkSkillCard
                  installing={installingSources.includes(entry.item.source)}
                  item={entry.item}
                  key={`recommended:${entry.item.slug}`}
                  onInstall={() => void handleRecommendedInstall(entry.item)}
                />
              ) : (
                <InstalledWorkSkillCard
                  key={entry.skill.slug}
                  selectable={batchMode && entry.skill.can_manage && !entry.skill.is_builtin}
                  selected={selectedSlugs.includes(entry.skill.slug)}
                  skill={entry.skill}
                  toggling={togglingSlugs.includes(entry.skill.slug)}
                  onOpen={() => void handleCardOpen(entry.skill)}
                  onSelect={() => handleToggleSelect(entry.skill.slug)}
                  onToggleEnabled={() => void handleToggleEnabled(entry.skill)}
                />
              ),
            )}
          </div>
        </section>
      ))}

      {previewSkill ? (
        <SkillPreviewDialog
          canManage={previewSkill.can_manage}
          error={previewError}
          loading={previewLoading}
          markdown={previewMarkdown}
          onClose={closePreview}
          onManage={() => onManageSkill?.(previewSkill.slug)}
          onToggleEnabled={() => void handleToggleEnabled(previewSkill)}
          onUninstall={() => handleUninstall(previewSkill)}
          skill={previewSkill}
          toggling={togglingSlugs.includes(previewSkill.slug)}
        />
      ) : null}

      {remoteOpen ? (
        <RemoteInstallDialog
          api={api}
          initialSource={remoteInitialSource}
          onClose={() => setRemoteOpen(false)}
          onDraftsPrepared={handleRemoteDrafts}
        />
      ) : null}

      {drafts ? (
        <InstallDraftDialog
          confirming={draftConfirming}
          drafts={drafts}
          onCancel={() => void handleDraftCancel()}
          onConfirm={(shareConfig) => void handleDraftConfirm(shareConfig)}
        />
      ) : null}

      {confirmRequest ? (
        <WorkConfirmDialog
          busy={confirmBusy}
          confirmLabel={confirmRequest.kind === "batch" ? "确定删除" : "卸载"}
          copy={
            confirmRequest.kind === "batch"
              ? `您已选中了 ${confirmRequest.slugs.length} 个技能。该操作将从数据库和物理磁盘中彻底删除这些技能包，且不可恢复！`
              : `卸载后会删除该 Skill 的数据库记录和本地文件，操作不可恢复。`
          }
          onCancel={() => setConfirmRequest(null)}
          onConfirm={() => void handleConfirm()}
          title={confirmRequest.kind === "batch" ? "确定要批量删除选中的技能吗？" : `卸载 ${confirmRequest.skill.name}`}
        />
      ) : null}

      {toast ? (
        <div className="work-toast" role="status">
          {toast}
        </div>
      ) : null}
    </section>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof WorkSkillsApiError) return error.userMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}
