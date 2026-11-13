"use client";

import { FileUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import {
  draftDeleteAdapter,
  submissionViewModelAdapter,
} from "../contracts/authoring-view-model";
import type { SkillMarketError } from "../contracts/error";
import type { SkillDraftSummaryViewModel } from "../contracts/skill-mine-view-model";
import { EMPTY_SKILL_CATALOG_FILTER } from "./catalog-filter";
import { catalogDetailHref } from "./catalog-navigation";
import { SkillCatalogCard } from "./skill-catalog-card";
import { SkillMarketWorkPlaceholder } from "./skill-catalog-plaza";
import { useSkillMine } from "./use-skill-mine";

export function SkillMine({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillMineDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillMineDaily({ client }: { client: SkillMarketClient }) {
  const { refresh, state } = useSkillMine(client);
  const busyRef = useRef<string | undefined>(undefined);
  const [busyId, setBusyId] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string>();
  const [error, setError] = useState<SkillMarketError>();
  const [message, setMessage] = useState<string>();
  if (state.kind === "loading") return <LoadingState label="正在加载我的 Skill…" />;
  if (state.kind === "error") {
    return <SkillMarketErrorState error={state.error} onRecover={refresh} />;
  }

  const { drafts, enabled, available } = state.data;

  function begin(id: string): boolean {
    if (busyRef.current) return false;
    busyRef.current = id;
    setBusyId(id);
    setError(undefined);
    setMessage(undefined);
    return true;
  }

  function finish() {
    busyRef.current = undefined;
    setBusyId(undefined);
  }

  function refreshWorkspace() {
    setConfirmDelete(undefined);
    setError(undefined);
    setMessage(undefined);
    refresh();
  }

  async function submitDraft(draft: SkillDraftSummaryViewModel) {
    if (draft.status !== "editing" || !begin(draft.id)) return;
    const result = await client.mutate({
      mode: "daily",
      operation: "submitDraft",
      pathParameters: { id: draft.id },
    }, submissionViewModelAdapter);
    if (result.ok) {
      setMessage(`${draft.name} 已提交审核 · Submission ${result.value.id}`);
      refresh();
    } else setError(result.error);
    finish();
  }

  async function deleteDraft(draft: SkillDraftSummaryViewModel) {
    if (draft.status !== "editing" || !begin(draft.id)) return;
    const result = await client.mutate({
      mode: "daily",
      operation: "deleteDraft",
      pathParameters: { id: draft.id },
    }, draftDeleteAdapter);
    if (result.ok) {
      setConfirmDelete(undefined);
      setMessage(`${draft.name} 已删除。`);
      refresh();
    } else setError(result.error);
    finish();
  }

  return (
    <section className="resource-page skill-mine">
      <SkillBackLink href="/skills?mode=1">返回 Skill 广场</SkillBackLink>
      <header className="page-heading">
        <div><h1>我的 Skill</h1><p>管理草稿、上传目录或 ZIP，并提交审核</p></div>
        <div className="skill-page-actions skill-catalog-actions">
          <Link className="skill-page-action" href="/skills/manage?mode=1">发布管理</Link>
          <Link className="skill-page-action" href="/skills/review?mode=1">审核</Link>
          <Link className="skill-page-action" href="/skills/creator?mode=1">Creator</Link>
        </div>
      </header>

      <Link className="skill-mine-upload" href="/skills/drafts/new?mode=1">
        <FileUp aria-hidden="true" size={20} />
        <span>上传 Skill ZIP 或目录</span>
      </Link>

      {error ? <SkillMarketErrorState error={error} onRecover={error.recovery === "back" ? undefined : refreshWorkspace} /> : null}
      {message ? <div className="skill-draft-notice" role="status">{message}</div> : null}

      <MineSection title="我创建" empty="当前账号没有草稿。" layout="list">
        {drafts.map((draft) => (
          <article aria-label={`草稿 ${draft.name}`} className="skill-mine-draft" key={draft.id}>
            <span className="skill-mine-draft-copy">
              <strong>{draft.name}</strong>
              <span>状态：{draft.status}</span>
              <small>r{draft.revision} · {draft.fileCount} 个文件 · 更新时间未提供</small>
            </span>
            {draft.status === "editing" ? (
              <div className="skill-mine-draft-actions">
                <Link href={`/skills/creator?mode=1&draftId=${encodeURIComponent(draft.id)}`}>编辑</Link>
                <button disabled={Boolean(busyId)} onClick={() => void submitDraft(draft)} type="button">
                  {busyId === draft.id ? "处理中…" : "提交审核"}
                </button>
                <button
                  className="skill-mine-delete"
                  disabled={Boolean(busyId)}
                  onClick={() => confirmDelete === draft.id
                    ? void deleteDraft(draft)
                    : setConfirmDelete(draft.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} />
                  {confirmDelete === draft.id ? "确认删除" : "删除"}
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </MineSection>

      <MineSection title="已安装/启用" empty="当前没有启用的市场 Skill。">
        {enabled.map((item) => (
          <SkillCatalogCard
            href={catalogDetailHref(item.id, EMPTY_SKILL_CATALOG_FILTER, "daily")}
            item={item}
            key={item.id}
          />
        ))}
      </MineSection>

      <MineSection title="可用未安装" empty="当前没有可安装的市场 Skill。">
        {available.map((item) => (
          <SkillCatalogCard
            href={catalogDetailHref(item.id, EMPTY_SKILL_CATALOG_FILTER, "daily")}
            item={item}
            key={item.id}
          />
        ))}
      </MineSection>
    </section>
  );
}

function MineSection({ children, empty, layout = "grid", title }: {
  children: React.ReactNode;
  empty: string;
  layout?: "grid" | "list";
  title: string;
}) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <section className="skill-mine-section">
      <h2>{title}</h2>
      {hasItems ? <div className={layout === "list" ? "skill-mine-draft-list" : "resource-grid"}>{children}</div> : <EmptyState title={empty} />}
    </section>
  );
}
