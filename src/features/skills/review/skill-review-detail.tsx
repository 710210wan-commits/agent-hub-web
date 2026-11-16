"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
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

type Action = "approve" | "delete" | "publish" | "publish-enable" | "reject" | "trigger" | "trigger-all";
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
  const [triggerValidation, setTriggerValidation] = useState<string>();
  const [publication, setPublication] = useState<MarketPublication>();
  const [publishAndEnable, setPublishAndEnable] = useState<PublishAndEnableResponse>();
  const [presetProgress, setPresetProgress] = useState<{ current: number; total: number }>();

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
    if (next === "trigger" || next === "trigger-all") setTriggerValidation(undefined);
    return true;
  }
  function finish() { actionRef.current = undefined; setAction(undefined); }

  async function runTrigger() {
    const normalized = query.trim();
    if (!normalized) { setTriggerValidation("请先输入触发查询，再运行 Trigger Test。"); return; }
    if (!start("trigger")) return;
    const result = await client.mutate({
      body: { expectedTrigger, query: normalized }, mode: "daily", operation: "runTriggerTests", pathParameters: { id },
    }, triggerTestRunAdapter);
    if (result.ok) { setRuns((current) => [result.value, ...current.filter((item) => item.id !== result.value.id)]); setQuery(""); setTriggerValidation(undefined); }
    else setError(result.error);
    finish();
  }

  async function runMissingTriggerCases() {
    if (!submission) return;
    const missing = submission.triggerCases.filter((item) => !runs.some((run) => run.passed && run.query === item.query && run.expectedTrigger === item.expectedTrigger));
    if (!missing.length || !start("trigger-all")) return;
    let nextRuns = runs;
    for (const [index, item] of missing.entries()) {
      setPresetProgress({ current: index + 1, total: missing.length });
      const result = await client.mutate({
        body: { expectedTrigger: item.expectedTrigger, query: item.query }, mode: "daily",
        operation: "runTriggerTests", pathParameters: { id },
      }, triggerTestRunAdapter);
      if (!result.ok) { setError(result.error); break; }
      nextRuns = [result.value, ...nextRuns.filter((run) => run.id !== result.value.id)];
      setRuns(nextRuns);
    }
    setPresetProgress(undefined);
    finish();
  }

  async function decide(decision: "approved" | "rejected") {
    if (decision === "approved" && REVIEW_CHECKS.some((key) => !checks[key])) { setValidation("批准前请完成全部审核检查项。"); return; }
    if (decision === "approved") {
      if (hasExplicitSelectionCaseConflict(submission)) { setValidation("预置 Trigger Case 与“显式选择 Skill”规则冲突。请删除当前待审核提交，返回作者工作台重新提交后再审核。"); return; }
      const gate = triggerGateStatus(submission, runs);
      if (!gate.passed) { setValidation(`Trigger 审核门禁未通过：当前 ${gate.passedCases}/${gate.totalCases} 个预置 Case 已通过。请先让每个正向和反向 Case 都获得匹配的通过记录。`); return; }
    }
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
    if (result.ok) router.replace("/skills/review?mode=1"); else setError(result.error);
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
  const triggerGate = triggerGateStatus(submission, runs);
  const triggerCaseConflict = hasExplicitSelectionCaseConflict(submission);

  return (
    <section className="resource-page skill-review-detail">
      <SkillBackLink href="/skills/review?mode=1">返回审核队列</SkillBackLink>
      <header className="page-heading">
        <div><h1>{submission.name}</h1><p>状态：{submission.status} · 修订 r{submission.revision} · 提交 {submission.id}</p></div>
      </header>
      {error ? <SkillMarketErrorState error={error} onRecover={error.recovery === "refresh" ? refresh : undefined} /> : null}
      <ReviewEvidence submission={submission} />

      <section className="creator-section">
        <h2 className="skill-review-evidence-title">Trigger Test</h2>
        <p>结果仅绑定当前提交修订 r{submission.revision}，并以服务端记录为准。</p>
        <TriggerCases runs={runs} submission={submission} />
        {triggerCaseConflict ? <p className="skill-trigger-gate is-failed">当前提交的正向 Case 没有包含“使用 {submission.name}”这类显式选择语句，与 Skill 规则冲突。请删除待审核提交并重新提交。</p> : null}
        {submission.triggerCases.length ? <div className="creator-action-bar creator-action-bar-compact">
          <button className="primary-button creator-action-button" disabled={Boolean(action) || triggerGate.passed || triggerCaseConflict} type="button" onClick={() => void runMissingTriggerCases()}>
            {action === "trigger-all" && presetProgress ? `正在运行 ${presetProgress.current}/${presetProgress.total}…` : triggerGate.passed ? "全部预置 Case 已通过" : "运行全部未通过 Case"}
          </button>
        </div> : null}
        {!triggerCaseConflict ? <TriggerGate submission={submission} runs={runs} /> : null}
        <p className="skill-trigger-gate-hint">点击一次即可运行尚未通过的预置 Case；系统会自动使用每条 Case 的正确预期。</p>
        <details className="skill-trigger-advanced">
          <summary>额外测试（不影响审核）</summary>
          <div className="skill-trigger-advanced-content">
            <label>触发查询<input aria-label="触发查询" value={query} onChange={(event) => { setQuery(event.target.value); if (event.target.value.trim()) setTriggerValidation(undefined); }} /><small>输入一句用户问题，用来验证当前 Skill 是否应该被触发。</small></label>
            <fieldset className="skill-trigger-expectation">
              <legend>预期结果</legend>
              <label><input checked={expectedTrigger} name="trigger-expectation" type="radio" onChange={() => setExpectedTrigger(true)} />应该触发</label>
              <label><input checked={!expectedTrigger} name="trigger-expectation" type="radio" onChange={() => setExpectedTrigger(false)} />不应该触发</label>
            </fieldset>
            <p className="skill-trigger-hint">未显式选择 {submission.name} 的普通请求，应选择“不应该触发”；显式写“使用 {submission.name} …”时，应选择“应该触发”。</p>
            {triggerValidation ? <p className="skill-draft-validation" role="alert">{triggerValidation}</p> : null}
            <div className="creator-action-bar"><button className="secondary-button creator-action-button" disabled={Boolean(action)} type="button" onClick={() => void runTrigger()}>{action === "trigger" ? "正在运行…" : "运行额外测试"}</button></div>
            <TriggerHistory runs={runs} />
          </div>
        </details>
      </section>

      {submission.status === "pending_review" ? (
        <section className="creator-section">
          <h2 className="skill-review-evidence-title">审核决定</h2>
          <p>Validator 已在提交时由后端执行。请查看上方“Tool 与 Validator”的 diagnostics 后再勾选；勾选仅表示已复核，不会重新运行校验。</p>
          {REVIEW_CHECKS.map((key) => <label className="skill-review-inline" key={key}><input checked={checks[key]} type="checkbox" onChange={(event) => setChecks({ ...checks, [key]: event.target.checked })} />{checkLabel(key)}</label>)}
          <label>审核评语<textarea rows={4} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          {validation ? <p className="skill-draft-validation" role="alert">{validation}</p> : null}
          <div className="skill-draft-actions creator-action-bar">
            <button className="primary-button creator-action-button" disabled={Boolean(action)} type="button" onClick={() => void decide("approved")}>批准</button>
            <button className="secondary-button creator-action-button" disabled={Boolean(action)} type="button" onClick={() => void decide("rejected")}>拒绝</button>
            <button className="secondary-button creator-action-button skill-draft-danger-button" disabled={Boolean(action)} type="button" onClick={() => void remove()}>删除待审核提交</button>
          </div>
        </section>
      ) : null}

      {submission.status === "approved" || publication || publishAndEnable ? (
        <section className="creator-section">
          <h2 className="skill-review-evidence-title">发布</h2><p>目标范围由当前决策场景契约固定为 scenario:daily。</p>
          {submission.status === "approved" ? <div className="skill-draft-actions creator-action-bar">
            <button className="secondary-button creator-action-button" disabled={Boolean(action)} type="button" onClick={() => void publish(false)}>仅发布</button>
            <button className="primary-button creator-action-button" disabled={Boolean(action)} type="button" onClick={() => void publish(true)}>发布并启用</button>
          </div> : null}
          {publication ? <PublicationResult publication={publication} /> : null}
          {publishAndEnable ? <PublishAndEnableResult result={publishAndEnable} /> : null}
        </section>
      ) : null}
    </section>
  );
}

function TriggerCases({ runs, submission }: {
  runs: TriggerTestRun[];
  submission: ReviewSubmissionViewModel;
}) {
  if (!submission.triggerCases.length) return <p>未配置预置 Trigger Case；可以在下方手动输入查询进行测试。</p>;
  return <div className="creator-tool-grid">{submission.triggerCases.map((item) => {
    const matchingRuns = runs.filter((run) => run.query === item.query && run.expectedTrigger === item.expectedTrigger);
    const status = matchingRuns.some((run) => run.passed) ? "passed" : matchingRuns.length ? "failed" : "pending";
    return <article className="creator-tool-card skill-trigger-case" key={item.id}>
      <div className="skill-trigger-case-heading">
        <strong>{item.id}</strong>
        <span className={`skill-trigger-case-status is-${status}`}>{triggerCaseStatusLabel(status)}</span>
      </div>
      <p>{item.query}</p>
      <span>预期：{triggerValueLabel(item.expectedTrigger)}</span>
    </article>;
  })}</div>;
}

function triggerCaseStatusLabel(status: "failed" | "passed" | "pending"): string {
  return { failed: "未通过", passed: "已通过", pending: "待测试" }[status];
}

function TriggerHistory({ runs }: { runs: TriggerTestRun[] }) {
  if (!runs.length) return <p>暂无 Trigger Test 记录。</p>;
  const passed = runs.filter((run) => run.passed).length;
  return <><p>结果摘要：{passed}/{runs.length} 通过</p><div className="history-list">{runs.map((run) => (
    <article className={`history-item skill-trigger-result ${run.passed ? "is-passed" : "is-failed"}`} key={run.id}>
      <strong className="skill-trigger-result-status">{run.passed ? "通过" : "未通过"}</strong>
      <div className="skill-trigger-result-body">
        <strong>{run.query}</strong>
        <span>期望：{triggerValueLabel(run.expectedTrigger)} · 实际：{triggerValueLabel(run.actualTrigger)}</span>
        {run.reason ? <p>判定原因：{run.reason}</p> : null}
      </div>
      <time>{run.durationMs} ms</time>
    </article>
  ))}</div></>;
}

function triggerValueLabel(value: boolean): string { return value ? "触发" : "不触发"; }

function TriggerGate({ runs, submission }: { runs: TriggerTestRun[]; submission: ReviewSubmissionViewModel }) {
  const gate = triggerGateStatus(submission, runs);
  return <p className={`skill-trigger-gate ${gate.passed ? "is-passed" : "is-failed"}`}>
    审核门禁：{gate.passed ? "已通过" : "未通过"} · {gate.passedCases}/{gate.totalCases} 个预置 Case 已通过
  </p>;
}

function triggerGateStatus(submission: ReviewSubmissionViewModel | undefined, runs: TriggerTestRun[]) {
  const cases = submission?.triggerCases ?? [];
  const passedCases = cases.filter((item) => runs.some((run) => run.passed && run.query === item.query && run.expectedTrigger === item.expectedTrigger)).length;
  const hasPositive = cases.some((item) => item.expectedTrigger);
  const hasNegative = cases.some((item) => !item.expectedTrigger);
  return { passed: hasPositive && hasNegative && passedCases === cases.length, passedCases, totalCases: cases.length };
}

function hasExplicitSelectionCaseConflict(submission: ReviewSubmissionViewModel | undefined): boolean {
  const whenToUse = submission?.validationReport?.requirement?.trigger.whenToUse ?? "";
  if (!/(?:显式|明确).{0,8}(?:选择|选中|指定)|explicit(?:ly)?\s+(?:select|choose|invoke)/i.test(whenToUse)) return false;
  return submission?.triggerCases.some((item) => item.expectedTrigger && !item.query.includes(submission.name)) ?? false;
}

function PublicationResult({ publication }: { publication: MarketPublication }) {
  return <p role="status">发布成功：{publication.id} · submission {publication.submissionId} · r{publication.revision}</p>;
}

function PublishAndEnableResult({ result }: { result: PublishAndEnableResponse }) {
  return <div role="status">
    <p>发布成功：{result.publication.value.id} · submission {result.publication.value.submissionId}</p>
    {result.installation.status === "completed"
      ? <p>启用成功：{result.installation.value.scopeType}:{result.installation.value.scopeId}</p>
      : <><p className="skill-draft-validation">发布已完成，但启用失败：{result.installation.error}。请单独处理启用，不要重复发布。</p><Link href={`/skills/manage/${encodeURIComponent(result.publication.value.id)}?mode=1`}>前往发布管理继续启用</Link></>}
  </div>;
}

function checkLabel(key: typeof REVIEW_CHECKS[number]) {
  return { definition: "Definition 已核对", trigger: "Trigger 证据已核对", validator: "Validator 已核对" }[key];
}
