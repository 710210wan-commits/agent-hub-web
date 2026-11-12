"use client";

import { Download, Eye, FilePenLine, Power, PowerOff } from "lucide-react";
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
import { saveArtifact, verifyArtifactDownload } from "./artifact-download";
import {
  installationStatusAdapter,
  revisePublicationAdapter,
  withdrawPublicationAdapter,
  type PublicationViewModel,
} from "./publication-view-model";
import { toPublicationError, usePublications } from "./use-publications";

const DAILY_SCOPE = { scopeId: "daily", scopeType: "scenario" as const };

export function SkillPublicationList({ client }: { client?: SkillMarketClient }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillPublicationListDaily client={client ?? getBrowserSkillMarketClient()} />;
}

function SkillPublicationListDaily({ client }: { client: SkillMarketClient }) {
  const router = useRouter();
  const { refresh, state } = usePublications(client);
  const busyRef = useRef(false);
  const [busyId, setBusyId] = useState<string>();
  const [expandedId, setExpandedId] = useState<string>();
  const [error, setError] = useState<SkillMarketError>();
  const [message, setMessage] = useState<string>();

  if (state.kind === "loading") return <LoadingState label="正在加载发布记录…" />;
  if (state.kind === "error") {
    return <section className="resource-page"><SkillBackLink href="/skills?mode=daily">返回 Skill 广场</SkillBackLink><SkillMarketErrorState error={state.error} onRecover={state.error.recovery === "back" ? undefined : refresh} /></section>;
  }

  function begin(id: string): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusyId(id); setError(undefined); setMessage(undefined);
    return true;
  }
  function end() { busyRef.current = false; setBusyId(undefined); }

  async function download(publication: PublicationViewModel) {
    if (!begin(publication.id)) return;
    try {
      const verified = await verifyArtifactDownload(
        await client.downloadPublication({ id: publication.id, mode: "daily" }),
        publication.contentHash,
      );
      saveArtifact(verified);
      setMessage(`下载已校验：${verified.fileName} · SHA-256 ${verified.sha256}`);
    } catch (cause: unknown) {
      setError(toPublicationError(cause));
    }
    end();
  }

  async function setEnabled(publication: PublicationViewModel, enabled: boolean) {
    if (!publication.installable || !begin(publication.id)) return;
    const result = await client.mutate({
      body: { ...DAILY_SCOPE, status: enabled ? "enabled" : "disabled" }, mode: "daily",
      operation: "setInstallationStatus", pathParameters: { id: publication.id },
    }, installationStatusAdapter);
    if (result.ok) {
      setMessage(`${result.value.scopeType}:${result.value.scopeId} 已${result.value.status === "enabled" ? "启用" : "停用"}；Catalog 与 Runtime 状态由服务端同步。`);
      refresh();
    } else setError(result.error);
    end();
  }

  async function withdraw(publication: PublicationViewModel) {
    if (publication.status !== "published") return;
    if (!window.confirm("确认下架？服务端将停用相关安装，并使该 Skill 退出 Runtime；历史 Artifact 不会被修改。")) return;
    if (!begin(publication.id)) return;
    const result = await client.mutate({ mode: "daily", operation: "withdrawPublication", pathParameters: { id: publication.id } }, withdrawPublicationAdapter);
    if (result.ok) {
      setMessage("Publication 已下架；历史 Artifact 保持不变。");
      refresh();
    } else setError(result.error);
    end();
  }

  async function revise(publication: PublicationViewModel) {
    if (!begin(publication.id)) return;
    const result = await client.mutate({ mode: "daily", operation: "revisePublication", pathParameters: { id: publication.id } }, revisePublicationAdapter);
    if (result.ok) {
      const query = new URLSearchParams({
        mode: "daily",
        draftId: result.value.id,
        sourcePublication: publication.id,
        revision: String(result.value.revision),
      });
      router.push(`/skills/creator?${query.toString()}`);
    } else setError(result.error);
    end();
  }

  return (
    <section className="resource-page skill-publication-list">
      <SkillBackLink href="/skills?mode=daily">返回 Skill 广场</SkillBackLink>
      <header className="page-heading">
        <div><h1>发布管理</h1><p>按场景启用、停用或下架不可变 Skill 修订；安装目标固定为 scenario:daily</p></div>
      </header>
      {error ? <SkillMarketErrorState error={error} onRecover={error.recovery === "retry" ? () => refresh() : undefined} /> : null}
      {message ? <div className="skill-draft-notice" role="status">{message}</div> : null}
      {state.publications.length ? (
        <div className="skill-publication-rows">
          {state.publications.map((publication) => {
            const busy = Boolean(busyId);
            return (
              <article className="skill-publication-row" key={publication.id}>
                <div className="skill-publication-row-copy">
                  <h2>{publication.skillName} <small>r{publication.revision}</small></h2>
                  <p>
                    {publication.status} · <code>{publication.contentHash.slice(0, 16)}…</code>
                    {" · "}{publication.installationSummary}
                  </p>
                </div>
                <div className="skill-publication-row-actions">
                  <button
                    aria-expanded={expandedId === publication.id}
                    disabled={busy}
                    onClick={() => setExpandedId(expandedId === publication.id ? undefined : publication.id)}
                    type="button"
                  >
                    <Eye aria-hidden="true" size={14} />查看详情
                  </button>
                  <button disabled={busy} onClick={() => void download(publication)} type="button">
                    <Download aria-hidden="true" size={14} />下载制品
                  </button>
                  {publication.status === "published" && publication.installable ? (
                    <>
                      <button
                        className="skill-publication-enable"
                        disabled={busy}
                        onClick={() => void setEnabled(publication, true)}
                        type="button"
                      >
                        <Power aria-hidden="true" size={14} />安装/启用
                      </button>
                      <button
                        className="skill-publication-disable"
                        disabled={busy}
                        onClick={() => void setEnabled(publication, false)}
                        type="button"
                      >
                        <PowerOff aria-hidden="true" size={14} />停用
                      </button>
                    </>
                  ) : null}
                  {publication.status === "published" ? (
                    <button
                      className="skill-publication-withdraw"
                      disabled={busy}
                      onClick={() => void withdraw(publication)}
                      type="button"
                    >
                      下架
                    </button>
                  ) : null}
                  {publication.status === "withdrawn" ? (
                    <button
                      className="skill-publication-revise"
                      disabled={busy}
                      onClick={() => void revise(publication)}
                      type="button"
                    >
                      <FilePenLine aria-hidden="true" size={14} />创建新修订
                    </button>
                  ) : null}
                </div>
                {expandedId === publication.id ? (
                  <dl className="skill-publication-metadata skill-publication-row-detail">
                    <div><dt>Publication ID</dt><dd>{publication.id}</dd></div>
                    <div><dt>状态 / 修订</dt><dd>{publication.status} / r{publication.revision}</dd></div>
                    <div><dt>SHA-256</dt><dd><code>{publication.contentHash}</code></dd></div>
                    <div><dt>Artifact Key</dt><dd><code>{publication.artifactKey}</code></dd></div>
                  </dl>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <EmptyState title="当前没有 Publication" description="发布成功后会出现在这里。" />}
    </section>
  );
}
