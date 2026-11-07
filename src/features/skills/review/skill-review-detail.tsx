"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import type { SkillMarketError } from "../contracts/error";
import type { MarketPublication, PublishAndEnableResponse, TriggerTestRun } from "../contracts/generated";
import { ReviewEvidence } from "./review-evidence";
import {
  deleteSubmissionAdapter,
  publishAndEnableAdapter,
  publishSubmissionAdapter,
  reviewQueueAdapter,
  reviewSubmissionAdapter,
  triggerTestRunAdapter,
  triggerTestsAdapter,
  type ReviewSubmissionViewModel,
} from "./review-view-model";
import { toReviewError } from "./use-review-queue";

type Action = "approve" | "delete" | "publish" | "publish-enable" | "reject" | "trigger";
const REVIEW_CHECKS = ["definition", "validator", "trigger"] as const;
const DAILY_TARGET = { scopeId: "daily", scopeType: "scenario" as const };

export function SkillReviewDetail({ client, id }: { client?: SkillMarketClient; id: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillReviewDetailDaily client={client ?? getBrowserSkillMarketClient()} id={id} />;
}

function SkillReviewDetailDaily({ client, id }: { client: SkillMarketClient; id: string }) {
  const router = useRouter();
  const actionRef = useRef<Action | undefined>(undefined);
  const [generation, setGeneration] = useState(0);
  const [submission, setSubmission] = useState<ReviewSubmissionViewModel>();
  const [runs, setRuns] = useState<TriggerTestRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<SkillMarketError>();
  const [action, setAction] = useState<Action>();
  const [query, setQuery] = useState("");
  const [expectedTrigger, setExpectedTrigger] = useState(true);
  const [comment, setComment] = useState("");
  const [checks, setChecks] = useState<Record<string, boolean>>({ definition: false, trigger: false, validator: false });
  const [validation, setValidation] = useState<string>();
  const [publication, setPublication] = useState<MarketPublication>();
  const [publishAndEnable, setPublishAndEnable] = useState<PublishAndEnableResponse>();

  const refresh = useCallback(() => {
    setLoading(true); setNotFound(false); setError(undefined);
    setGeneration((value) => value + 1);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      client.query({ mode: "daily", operation: "listSubmissions", signal: controller.signal }, reviewQueueAdapter),
      client.query({ mode: "daily", operation: "listTriggerTests", pathParameters: { id }, signal: controller.signal }, triggerTestsAdapter),
    ]).then(([submissions, loadedRuns]) => {
      const selected = submissions.find((item) => item.id === id);
      setSubmission(selected); setRuns(loadedRuns); setNotFound(!selected); setLoading(false);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) { setError(toReviewError(cause)); setLoading(false); }
    });
    return () => controller.abort();
  }, [client, generation, id]);

  function start(next: Action) {
    if (actionRef.current) return false;
    actionRef.current = next; setAction(next); setError(undefined); setValidation(undefined);
    return true;
  }
  function finish() { actionRef.current = undefined; setAction(undefined); }

  async function runTrigger() {
    const normalized = query.trim();
    if (!normalized) { setValidation("请输入触发查询。"); return; }
    if (!start("trigger")) return;
    const result = await client.mutate({
      body: { expectedTrigger, query: normalized }, mode: "daily", operation: "runTriggerTests", pathParameters: { id },
    }, triggerTestRunAdapter);
    if (result.ok) { setRuns((current) => [result.value, ...current.filter((item) => item.id !== result.value.id)]); setQuery(""); }
    else setError(result.error);
    finish();
  }

  async function decide(decision: "approved" | "rejected") {
    if (decision === "approved" && REVIEW_CHECKS.some((key) => !checks[key])) { setValidation("批准前请完成全部审核检查项。"); return; }
    if (decision === "rejected" && !comment.trim()) { setValidation("拒绝时必须填写审核评语。"); return; }
    const next = decision === "approved" ? "approve" : "reject";
    if (!start(next)) return;
    const result = await client.mutate({
      body: { checklist: checks, comment: comment.trim() || undefined, decision }, mode: "daily",
      operation: "reviewSubmission", pathParameters: { id },
    }, reviewSubmissionAdapter);
    if (result.ok) { setSubmission(result.value); setComment(""); }
    else setError(result.error);
    finish();
  }

  async function remove() {
    if (!submission || submission.status !== "pending_review" || !window.confirm("确认永久删除这个待审核提交？此操作不可撤销。") || !start("delete")) return;
    const result = await client.mutate({ mode: "daily", operation: "deleteSubmission", pathParameters: { id } }, deleteSubmissionAdapter);
    if (result.ok) router.replace("/skills/review?mode=daily"); else setError(result.error);
    finish();
  }

  async function publish(enable: boolean) {
    if (!submission || submission.status !== "approved" || !start(enable ? "publish-enable" : "publish")) return;
    if (enable) {
      const result = await client.mutate({ body: DAILY_TARGET, mode: "daily", operation: "publishAndEnableSubmission", pathParameters: { id } }, publishAndEnableAdapter);
      if (result.ok) { setPublishAndEnable(result.value); setSubmission({ ...submission, status: "published" }); } else setError(result.error);
    } else {
      const result = await client.mutate({ mode: "daily", operation: "publishSubmission", pathParameters: { id } }, publishSubmissionAdapter);
      if (result.ok) { setPublication(result.value); setSubmission({ ...submission, status: "published" }); } else setError(result.error);
    }
    finish();
  }

  if (loading) return <LoadingState label="正在加载审核详情…" />;
  if (error && !submission) return <SkillMarketErrorState error={error} onRecover={refresh} />;
  if (notFound || !submission) return <EmptyState title="提交不存在或当前身份不可见" description="请返回后端授权的审核队列重新选择。" />;

  return (
    <section className="resource-page skill-review-detail">
      <Link className="back-link" href="/skills/review?mode=daily">← 返回审核队列</Link>
      <header className="page-heading">
        <div><h1>{submission.name}</h1><p>状态：{submission.status} · 修订 r{submission.revision} · 提交 {submission.id}</p></div>
        <button disabled={Boolean(action)} type="button" onClick={refresh}>刷新</button>
      </header>
      {error ? <SkillMarketErrorState error={error} onRecover={error.recovery === "refresh" ? refresh : undefined} /> : null}
      {validation ? <p className="skill-draft-validation" role="alert">{validation}</p> : null}
      <ReviewEvidence submission={submission} />

      <section className="creator-section">
        <h2>Trigger Test</h2>
        <p>结果仅绑定当前提交修订 r{submission.revision}；刷新时重新读取服务端记录。</p>
        <TriggerCases submission={submission} />
        <label>触发查询<input aria-label="触发查询" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <label className="skill-review-inline"><input checked={expectedTrigger} type="checkbox" onChange={(event) => setExpectedTrigger(event.target.checked)} />期望触发</label>
        <button disabled={Boolean(action)} type="button" onClick={() => void runTrigger()}>{action === "trigger" ? "正在运行…" : "运行 Trigger Test"}</button>
        <TriggerHistory runs={runs} />
      </section>

      {submission.status === "pending_review" ? (
        <section className="creator-section">
          <h2>审核决定</h2>
          {REVIEW_CHECKS.map((key) => <label className="skill-review-inline" key={key}><input checked={checks[key]} type="checkbox" onChange={(event) => setChecks({ ...checks, [key]: event.target.checked })} />{checkLabel(key)}</label>)}
          <label>审核评语<textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          <div className="skill-draft-actions">
            <button disabled={Boolean(action)} type="button" onClick={() => void decide("approved")}>批准</button>
            <button disabled={Boolean(action)} type="button" onClick={() => void decide("rejected")}>拒绝</button>
            <button disabled={Boolean(action)} type="button" onClick={() => void remove()}>删除待审核提交</button>
          </div>
        </section>
      ) : null}

      {submission.status === "approved" || publication || publishAndEnable ? (
        <section className="creator-section">
          <h2>发布</h2><p>目标范围由当前日常场景契约固定为 scenario:daily。</p>
          {submission.status === "approved" ? <div className="skill-draft-actions">
            <button disabled={Boolean(action)} type="button" onClick={() => void publish(false)}>仅发布</button>
            <button disabled={Boolean(action)} type="button" onClick={() => void publish(true)}>发布并启用</button>
          </div> : null}
          {publication ? <PublicationResult publication={publication} /> : null}
          {publishAndEnable ? <PublishAndEnableResult result={publishAndEnable} /> : null}
        </section>
      ) : null}
    </section>
  );
}

function TriggerCases({ submission }: { submission: ReviewSubmissionViewModel }) {
  if (!submission.triggerCases.length) return <p>预置 Trigger Case：后端未提供</p>;
  return <div className="creator-tool-grid">{submission.triggerCases.map((item) => (
    <article className="creator-tool-card" key={item.id}>
      <strong>{item.id}</strong><span>{item.query}</span><span>期望触发：{String(item.expectedTrigger)}</span>
    </article>
  ))}</div>;
}

function TriggerHistory({ runs }: { runs: TriggerTestRun[] }) {
  if (!runs.length) return <p>暂无 Trigger Test 记录。</p>;
  const passed = runs.filter((run) => run.passed).length;
  return <><p>结果摘要：{passed}/{runs.length} 通过</p><div className="history-list">{runs.map((run) => (
    <article className="history-item" key={run.id}>
      <strong>{run.passed ? "通过" : "未通过"}</strong>
      <p>{run.id} · {run.query} · 期望 {String(run.expectedTrigger)} / 实际 {String(run.actualTrigger)}{run.reason ? ` · ${run.reason}` : ""}</p>
      <time>{run.durationMs} ms</time>
    </article>
  ))}</div></>;
}

function PublicationResult({ publication }: { publication: MarketPublication }) {
  return <p role="status">发布成功：{publication.id} · submission {publication.submissionId} · r{publication.revision}</p>;
}

function PublishAndEnableResult({ result }: { result: PublishAndEnableResponse }) {
  return <div role="status">
    <p>发布成功：{result.publication.value.id} · submission {result.publication.value.submissionId}</p>
    {result.installation.status === "completed"
      ? <p>启用成功：{result.installation.value.scopeType}:{result.installation.value.scopeId}</p>
      : <p className="skill-draft-validation">发布已完成，但启用失败：{result.installation.error}。请单独处理启用，不要重复发布。</p>}
  </div>;
}

function checkLabel(key: typeof REVIEW_CHECKS[number]) {
  return { definition: "Definition 已核对", trigger: "Trigger 证据已核对", validator: "Validator 已核对" }[key];
}
