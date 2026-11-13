"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import type { SkillMarketError } from "../contracts/error";
import type { MarketInstallation, MarketPublication } from "../contracts/generated";
import { saveArtifact, verifyArtifactDownload } from "./artifact-download";
import {
  availabilityLabel,
  installationStatusAdapter,
  revisePublicationAdapter,
  withdrawPublicationAdapter,
  type PublicationAvailability,
} from "./publication-view-model";
import { toPublicationError, usePublications } from "./use-publications";

type Action = "copy-artifact" | "copy-hash" | "download" | "installation" | "revise" | "withdraw";
const DAILY_SCOPE = { scopeId: "daily", scopeType: "scenario" as const };

export function SkillPublicationDetail({ client, id }: { client?: SkillMarketClient; id: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillPublicationDetailDaily client={client ?? getBrowserSkillMarketClient()} id={id} />;
}

function SkillPublicationDetailDaily({ client, id }: { client: SkillMarketClient; id: string }) {
  const router = useRouter();
  const { refresh, state } = usePublications(client);
  const actionRef = useRef<Action | undefined>(undefined);
  const retryRef = useRef<(() => Promise<void>) | undefined>(undefined);
  const [action, setAction] = useState<Action>();
  const [error, setError] = useState<SkillMarketError>();
  const [message, setMessage] = useState<string>();
  const [installation, setInstallation] = useState<MarketInstallation>();
  const [withdrawn, setWithdrawn] = useState<MarketPublication>();

  if (state.kind === "loading") return <LoadingState label="正在加载 Publication…" />;
  if (state.kind === "error") return (
    <section className="resource-page">
      <SkillBackLink href="/skills/manage?mode=1">返回发布管理</SkillBackLink>
      <SkillMarketErrorState error={state.error} onRecover={state.error.recovery === "back" ? undefined : refresh} />
    </section>
  );
  const publication = state.publications.find((item) => item.id === id);
  if (!publication) return <section className="resource-page"><SkillBackLink href="/skills/manage?mode=1">返回发布管理</SkillBackLink><EmptyState title="Publication 不存在或当前身份不可见" /></section>;

  const publicationHash = publication.contentHash;
  const currentStatus = withdrawn?.status ?? publication.status;
  const availability: PublicationAvailability = currentStatus === "withdrawn"
    ? "withdrawn"
    : installation?.status === "enabled"
      ? "enabled"
      : installation?.status === "disabled"
        ? "installable"
        : publication.availability;
  const canManageInstallation = publication.installable && currentStatus === "published";

  function refreshAuthoritative() {
    setInstallation(undefined); setWithdrawn(undefined); setError(undefined); setMessage(undefined);
    refresh();
  }

  function start(next: Action) {
    if (actionRef.current) return false;
    actionRef.current = next; setAction(next); setError(undefined); setMessage(undefined);
    return true;
  }
  function finish() { actionRef.current = undefined; setAction(undefined); }

  async function copy(value: string, kind: "copy-artifact" | "copy-hash") {
    if (!start(kind)) return;
    try { await navigator.clipboard.writeText(value); setMessage("已复制完整值。"); }
    catch { setMessage("复制失败，请使用字段标题中的完整值。"); }
    finish();
  }

  async function download() {
    retryRef.current = download;
    if (!start("download")) return;
    try {
      const verified = await verifyArtifactDownload(await client.downloadPublication({ id, mode: "daily" }), publicationHash);
      saveArtifact(verified);
      setMessage(`下载已校验：${verified.fileName} · ${verified.blob.type} · SHA-256 ${verified.sha256}`);
    } catch (cause: unknown) { setError(toPublicationError(cause)); }
    finish();
  }

  async function setEnabled(enabled: boolean) {
    retryRef.current = () => setEnabled(enabled);
    if (!canManageInstallation || !start("installation")) return;
    const result = await client.mutate({
      body: { ...DAILY_SCOPE, status: enabled ? "enabled" : "disabled" }, mode: "daily",
      operation: "setInstallationStatus", pathParameters: { id },
    }, installationStatusAdapter);
    if (result.ok) {
      setInstallation(result.value);
      setMessage(`${result.value.scopeType}:${result.value.scopeId} 已${result.value.status === "enabled" ? "启用" : "停用"}；Catalog 与 Runtime 状态由服务端同步。`);
    } else setError(result.error);
    finish();
  }

  async function withdraw() {
    retryRef.current = withdraw;
    if (currentStatus !== "published" || !window.confirm("确认下架？服务端将停用相关安装，并使该 Skill 退出 Runtime；历史 Artifact 不会被修改。") || !start("withdraw")) return;
    const result = await client.mutate({ mode: "daily", operation: "withdrawPublication", pathParameters: { id } }, withdrawPublicationAdapter);
    if (result.ok) { setWithdrawn(result.value); setMessage("Publication 已下架；历史 Artifact 保持不变。"); }
    else setError(result.error);
    finish();
  }

  async function revise() {
    retryRef.current = revise;
    if (!start("revise")) return;
    const result = await client.mutate({ mode: "daily", operation: "revisePublication", pathParameters: { id } }, revisePublicationAdapter);
    if (result.ok) {
      const query = new URLSearchParams({
        mode: "1",
        draftId: result.value.id,
        sourcePublication: id,
        revision: String(result.value.revision),
      });
      router.push(`/skills/creator?${query.toString()}`);
    } else setError(result.error);
    finish();
  }

  return (
    <section className="resource-page skill-publication-detail">
      <SkillBackLink href="/skills/manage?mode=1">返回发布管理</SkillBackLink>
      <header className="page-heading">
        <div><h1>{publication.skillName}</h1><p>Publication {publication.id} · 修订 r{publication.revision}</p></div>
      </header>
      {error ? <SkillMarketErrorState error={error} onRecover={error.recovery === "refresh" ? refreshAuthoritative : error.recovery === "retry" ? () => void retryRef.current?.() : undefined} /> : null}
      {message ? <div className="skill-draft-notice" role="status">{message}</div> : null}

      <section className="creator-section">
        <h2>Publication</h2>
        <dl className="skill-publication-metadata">
          <Row label="状态" value={currentStatus} />
          <Row label="版本" value={`r${publication.revision} · ${publication.isLatest ? "最新修订" : "历史版本"}`} />
          <Row label="Submission" value={publication.submissionId} />
          <Row label="安装摘要" value={availabilityLabel(availability)} />
          <Row label="管理范围" value="scenario:daily（固定；URL 和表单不能扩大范围）" />
        </dl>
      </section>

      <section className="creator-section">
        <h2>Artifact</h2>
        <CopyField action={action} kind="copy-hash" label="Content SHA-256" value={publication.contentHash} onCopy={copy} />
        <CopyField action={action} kind="copy-artifact" label="Artifact Key" value={publication.artifactKey} onCopy={copy} />
        <button disabled={Boolean(action)} type="button" onClick={() => void download()}>{action === "download" ? "正在下载并校验…" : "下载 Artifact"}</button>
        <p>仅当下载字节 SHA-256、响应头与 Publication content hash 三者一致时才会保存文件。</p>
      </section>

      <section className="creator-section">
        <h2>安装与生命周期</h2>
        {canManageInstallation ? <div className="skill-draft-actions">
          {availability === "enabled"
            ? <button disabled={Boolean(action)} type="button" onClick={() => void setEnabled(false)}>停用 daily</button>
            : <button disabled={Boolean(action)} type="button" onClick={() => void setEnabled(true)}>{installation?.status === "disabled" ? "重新启用" : "安装并启用"}</button>}
        </div> : <p>{availabilityLabel(availability)}</p>}
        <p>当前契约未提供可管理 agent scope 或 Installation 列表，因此本页不会构造未知作用域或虚构安装明细。</p>
        <div className="skill-draft-actions">
          <button disabled={Boolean(action)} type="button" onClick={() => void revise()}>创建新修订</button>
          {currentStatus === "published" ? <button disabled={Boolean(action)} type="button" onClick={() => void withdraw()}>下架</button> : null}
        </div>
      </section>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function CopyField({ action, kind, label, onCopy, value }: {
  action?: Action; kind: "copy-artifact" | "copy-hash"; label: string;
  onCopy: (value: string, kind: "copy-artifact" | "copy-hash") => Promise<void>; value: string;
}) {
  const visible = value.length > 28 ? `${value.slice(0, 16)}…${value.slice(-10)}` : value;
  return <div className="skill-publication-copy"><span>{label}</span><code title={value}>{visible}</code><button disabled={Boolean(action)} type="button" onClick={() => void onCopy(value, kind)}>复制</button></div>;
}
