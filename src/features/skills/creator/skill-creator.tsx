"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { LoadingState } from "@/components/states/loading-state";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient, SkillMarketMutationResult } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { draftMutationAdapter, draftUpdateAdapter, submissionViewModelAdapter, type SubmissionViewModel } from "../contracts/authoring-view-model";
import { SkillMarketError } from "../contracts/error";
import type { CreatorToolListResponse, RequirementSpecV1, SkillDiagnostic, ToolResolutionResponse } from "../contracts/generated";
import {
  analyzeRequirementAdapter,
  confirmRequirementAdapter,
  confirmToolsAdapter,
  creatorDraftAdapter,
  creatorToolsAdapter,
  generateBundleAdapter,
  recommendToolsAdapter,
  reviseRequirementAdapter,
  runSmokeAdapter,
  suggestSmokeAdapter,
} from "./creator-adapters";
import {
  EMPTY_CREATOR_BASIC,
  creatorDraftMetadata,
  creatorStep,
  invalidateAfterBasic,
  invalidateAfterRequirement,
  invalidateAfterTools,
  recoverCreatorState,
  type CreatorState,
} from "./creator-state";

type PendingAction = "analyze" | "revise" | "confirm-requirement" | "recommend" | "confirm-tools" | "generate" | "suggest" | "smoke" | "save" | "submit";

export function SkillCreator({ client, draftId }: { client?: SkillMarketClient; draftId?: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillCreatorDaily client={client ?? getBrowserSkillMarketClient()} draftId={draftId} />;
}

function SkillCreatorDaily({ client, draftId }: { client: SkillMarketClient; draftId?: string }) {
  const pendingRef = useRef<PendingAction | undefined>(undefined);
  const retryRef = useRef<(() => void) | undefined>(undefined);
  const [state, setState] = useState<CreatorState>(() => ({ basic: loadSafeBasic() }));
  const [answers, setAnswers] = useState<string[]>([]);
  const [toolCatalog, setToolCatalog] = useState<CreatorToolListResponse>();
  const [toolSearch, setToolSearch] = useState("");
  const [toolRisk, setToolRisk] = useState("all");
  const [resolution, setResolution] = useState<ToolResolutionResponse>();
  const [pending, setPending] = useState<PendingAction>();
  const [error, setError] = useState<SkillMarketError>();
  const [loadingDraft, setLoadingDraft] = useState(Boolean(draftId));
  const [draftGeneration, setDraftGeneration] = useState(0);
  const [toolGeneration, setToolGeneration] = useState(0);
  const [submission, setSubmission] = useState<SubmissionViewModel>();
  const [generationMs, setGenerationMs] = useState<number>();

  useEffect(() => {
    saveSafeBasic(state.basic);
  }, [state.basic]);

  useEffect(() => {
    if (!draftId) return;
    const controller = new AbortController();
    client.query(
      { mode: "daily", operation: "getDraft", pathParameters: { id: draftId }, signal: controller.signal },
      creatorDraftAdapter,
    ).then((draft) => {
      setState(recoverCreatorState(draft));
      setError(undefined);
      setLoadingDraft(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(toCreatorError(reason));
      retryRef.current = () => { setLoadingDraft(true); setDraftGeneration((value) => value + 1); };
      setLoadingDraft(false);
    });
    return () => controller.abort();
  }, [client, draftGeneration, draftId]);

  useEffect(() => {
    if (!state.confirmedRequirement) return;
    const controller = new AbortController();
    client.query({
      mode: "daily", operation: "listCreatorTools",
      queryParameters: { includeInternal: false, scenarioId: state.basic.scenarioId }, signal: controller.signal,
    }, creatorToolsAdapter).then((catalog) => {
      setToolCatalog(catalog);
      setError(undefined);
    }).catch((reason: unknown) => {
      if (!controller.signal.aborted) {
        setError(toCreatorError(reason));
        retryRef.current = () => setToolGeneration((value) => value + 1);
      }
    });
    return () => controller.abort();
  }, [client, state.basic.scenarioId, state.confirmedRequirement, toolGeneration]);

  const filteredTools = useMemo(() => {
    const query = toolSearch.trim().toLocaleLowerCase();
    return (toolCatalog?.items ?? []).filter((item) => {
      const matchesQuery = !query || `${item.manifest.name} ${item.manifest.displayName ?? ""} ${item.manifest.description}`.toLocaleLowerCase().includes(query);
      return matchesQuery && (toolRisk === "all" || item.manifest.riskLevel === toolRisk);
    });
  }, [toolCatalog, toolRisk, toolSearch]);

  function run<T>(
    action: PendingAction,
    request: () => Promise<SkillMarketMutationResult<T>>,
    onSuccess: (value: T) => void,
  ) {
    const retry = () => run(action, request, onSuccess);
    if (pendingRef.current) return;
    pendingRef.current = action;
    retryRef.current = retry;
    setPending(action);
    setError(undefined);
    void request().then((result) => {
      if (result.ok) onSuccess(result.value);
      else setError(result.error);
    }).finally(() => {
      pendingRef.current = undefined;
      setPending(undefined);
    });
  }

  function updateBasic(field: keyof CreatorState["basic"], value: string) {
    setState((current) => invalidateAfterBasic(current, { ...current.basic, [field]: value }));
    setResolution(undefined);
    setSubmission(undefined);
  }

  function analyze() {
    if (!validBasic(state.basic)) return;
    run("analyze", () => client.mutate({
      body: { description: state.basic.description }, mode: "daily", operation: "analyzeRequirement",
    }, analyzeRequirementAdapter), (interview) => {
      setState((current) => invalidateAfterRequirement(current, interview));
      setResolution(undefined);
      setAnswers(interview.questions.map(() => ""));
    });
  }

  function revise() {
    if (!state.interview) return;
    const interview = state.interview;
    const responseAnswers = interview.questions.map((question, index) => ({ answer: answers[index]?.trim() ?? "", question }))
      .filter((item) => item.answer).slice(0, 3);
    if (!responseAnswers.length) return;
    run("revise", () => client.mutate({
      body: { answers: responseAnswers, requirement: interview.requirement },
      mode: "daily", operation: "reviseRequirement",
    }, reviseRequirementAdapter), (interview) => {
      setState((current) => invalidateAfterRequirement(current, interview));
      setResolution(undefined);
      setAnswers(interview.questions.map(() => ""));
    });
  }

  function confirmRequirement() {
    if (!state.interview) return;
    const interview = state.interview;
    run("confirm-requirement", () => client.mutate({
      body: { requirement: interview.requirement }, mode: "daily", operation: "confirmRequirement",
    }, confirmRequirementAdapter), (response) => {
      setResolution(undefined);
      setState((current) => ({ ...current, confirmedRequirement: response.requirement, confirmedToolNames: undefined, selectedToolNames: [] }));
    });
  }

  function recommendTools() {
    if (!state.confirmedRequirement) return;
    run("recommend", () => client.mutate({
      body: { requirement: state.confirmedRequirement, scenarioId: state.basic.scenarioId },
      mode: "daily", operation: "recommendToolResolution",
    }, recommendToolsAdapter), (response) => {
      setResolution(response);
      setState((current) => invalidateAfterTools(current, response.recommendations.map((item) => item.name)));
    });
  }

  function toggleTool(name: string) {
    const selected = state.selectedToolNames ?? [];
    const next = selected.includes(name) ? selected.filter((item) => item !== name) : [...selected, name];
    setState((current) => invalidateAfterTools(current, next));
  }

  function confirmTools() {
    if (!state.confirmedRequirement || !state.selectedToolNames) return;
    run("confirm-tools", () => client.mutate({
      body: { confirmedToolNames: state.selectedToolNames, requirement: state.confirmedRequirement, scenarioId: state.basic.scenarioId },
      mode: "daily", operation: "confirmToolResolution",
    }, confirmToolsAdapter), (response) => {
      setState((current) => ({
        ...current, bundle: undefined, confirmedRequirement: response.requirement,
        confirmedToolNames: current.selectedToolNames ?? [], draftSaved: current.draft ? false : undefined,
        smokeCases: undefined, smokeResult: undefined,
      }));
    });
  }

  function generate() {
    if (!state.confirmedRequirement || state.confirmedToolNames === undefined) return;
    const startedAt = performance.now();
    run("generate", () => client.mutate({
      body: {
        name: state.basic.name, requirement: state.confirmedRequirement,
        scenarioIds: [state.basic.scenarioId], title: state.basic.title, version: state.basic.version,
      },
      mode: "daily", operation: "generateSkillBundle",
    }, generateBundleAdapter), (bundle) => {
      setGenerationMs(Math.round(performance.now() - startedAt));
      setState((current) => ({
        ...current, bundle: { diagnostics: bundle.diagnostics, files: bundle.files },
        draftSaved: current.draft ? false : undefined, smokeCases: undefined, smokeResult: undefined,
      }));
    });
  }

  function suggestSmoke() {
    if (!state.confirmedRequirement || !state.bundle) return;
    run("suggest", () => client.mutate({
      body: { requirement: state.confirmedRequirement }, mode: "daily", operation: "suggestSmokeCases",
    }, suggestSmokeAdapter), (response) => setState((current) => ({ ...current, smokeCases: response.cases, smokeResult: undefined })));
  }

  function updateSmokeCase(index: number, field: "input" | "expected", value: string) {
    const cases = [...(state.smokeCases ?? [])];
    const current = cases[index];
    if (!current) return;
    cases[index] = { ...current, [field]: value };
    setState((previous) => ({ ...previous, draftSaved: previous.draft ? false : undefined, smokeCases: cases, smokeResult: undefined }));
  }

  function runSmoke() {
    if (!state.bundle || !state.smokeCases?.length) return;
    const bundle = state.bundle;
    const smokeCases = state.smokeCases;
    run("smoke", () => client.mutate({
      body: { cases: smokeCases, files: bundle.files, name: state.basic.name, scenarioIds: [state.basic.scenarioId] },
      mode: "daily", operation: "runSmokeCases",
    }, runSmokeAdapter), (response) => setState((current) => ({
      ...current, draftSaved: current.draft ? false : undefined, smokeResult: response,
    })));
  }

  function saveDraft() {
    if (!state.bundle || !state.smokeResult || hasErrors(state)) return;
    const bundle = state.bundle;
    if (state.draft) {
      const draft = state.draft;
      run("save", () => client.mutate({
        body: { expectedRevision: draft.revision, files: bundle.files, metadata: creatorDraftMetadata(state) },
        mode: "daily", operation: "updateDraft", pathParameters: { id: draft.id },
      }, draftUpdateAdapter), (response) => setState((current) => ({
        ...current,
        bundle: current.bundle ? { ...current.bundle, diagnostics: response.diagnostics } : current.bundle,
        draft: response.draft, draftSaved: true,
      })));
      return;
    }
    run("save", () => client.mutate({
      body: { files: bundle.files, metadata: creatorDraftMetadata(state), name: state.basic.name },
      mode: "daily", operation: "createDraft",
    }, draftMutationAdapter), (response) => setState((current) => ({
      ...current,
      bundle: current.bundle ? { ...current.bundle, diagnostics: response.diagnostics } : current.bundle,
      draft: response.draft, draftSaved: true,
    })));
  }

  function submitDraft() {
    if (!state.draft || !state.draftSaved) return;
    run("submit", () => client.mutate({
      mode: "daily", operation: "submitDraft", pathParameters: { id: state.draft?.id },
    }, submissionViewModelAdapter), (response) => {
      setSubmission(response);
      setState((current) => current.draft ? ({ ...current, draft: { ...current.draft, status: "submitted" } }) : current);
    });
  }

  if (loadingDraft) return <LoadingState label="正在恢复 Creator 草稿…" />;
  if (state.draft && state.draft.status !== "editing") {
    return <section className="resource-page skill-creator-page">
      <Link className="back-link" href={`/skills/drafts/${encodeURIComponent(state.draft.id)}?mode=daily`}>← 返回草稿</Link>
      <div className="skill-draft-notice" role="status">该草稿状态为 {state.draft.status}，Creator 不再发起变更。{submission ? ` 已进入审核：${submission.id}。` : ""}</div>
    </section>;
  }
  const step = creatorStep(state);
  const errors = state.bundle?.diagnostics.filter((item) => item.severity === "error") ?? [];

  return (
    <section className="resource-page skill-creator-page">
      <Link className="back-link" href="/skills/mine?mode=daily">← 返回我的 Skill</Link>
      <header className="page-heading"><div><h1>Skill Creator</h1><p>当前阶段：{stepLabel(step)}。服务端结果优先，本地仅短期保留基本进度。</p></div></header>
      <nav className="creator-steps" aria-label="Creator 流程">
        {[
          "基本信息", "Requirement", "Spec 确认", "Tool Resolution", "Bundle", "Diagnostics", "Smoke", "保存草稿",
        ].map((label, index) => <span key={label}>{index + 1}. {label}</span>)}
      </nav>

      <CreatorSection title="1. 基本信息">
        <div className="creator-form-grid">
          <label>名称<input value={state.basic.name} onChange={(event) => updateBasic("name", event.target.value)} /></label>
          <label>标题<input value={state.basic.title} onChange={(event) => updateBasic("title", event.target.value)} /></label>
          <label>版本<input value={state.basic.version} onChange={(event) => updateBasic("version", event.target.value)} /></label>
          <label>目标场景<input disabled value={state.basic.scenarioId} /></label>
        </div>
        <label>需求描述<textarea rows={5} value={state.basic.description} onChange={(event) => updateBasic("description", event.target.value)} /></label>
        <small>需求描述可能包含业务内容，不会写入浏览器持久缓存。</small>
        <button disabled={Boolean(pending) || !validBasic(state.basic)} type="button" onClick={analyze}>{pending === "analyze" ? "正在分析…" : "分析需求"}</button>
      </CreatorSection>

      {state.interview ? <CreatorSection title="2–3. Requirement Interview 与 Spec 确认">
        <p><strong>模型建议摘要：</strong>{state.interview.summary}</p>
        <RequirementSummary requirement={state.interview.requirement} />
        {state.interview.questions.map((question, index) => <label key={question}>{question}<textarea rows={2} value={answers[index] ?? ""} onChange={(event) => {
          const next = [...answers]; next[index] = event.target.value; setAnswers(next);
        }} /></label>)}
        <div className="skill-draft-actions">
          {state.interview.questions.length ? <button disabled={Boolean(pending) || !answers.some((item) => item.trim())} type="button" onClick={revise}>{pending === "revise" ? "正在修订…" : "提交回答并修订"}</button> : null}
          <button disabled={Boolean(pending)} type="button" onClick={confirmRequirement}>{pending === "confirm-requirement" ? "正在确认…" : "确认 Spec"}</button>
        </div>
      </CreatorSection> : null}

      {state.confirmedRequirement ? <CreatorSection title="4. Tool Catalog 与 Tool Resolution">
        <div className="skill-draft-actions">
          <input aria-label="搜索工具" placeholder="搜索工具" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} />
          <select aria-label="风险筛选" value={toolRisk} onChange={(event) => setToolRisk(event.target.value)}><option value="all">全部风险</option><option value="low">low</option><option value="medium">medium</option><option value="high">high</option><option value="input-dependent">input-dependent</option></select>
          <button disabled={Boolean(pending)} type="button" onClick={recommendTools}>{pending === "recommend" ? "正在推荐…" : "获取服务端推荐"}</button>
        </div>
        {resolution ? <div className="creator-recommendations"><strong>推荐理由</strong>{resolution.recommendations.map((item) => <p key={item.name}>{item.name}：{item.reason}</p>)}{resolution.missingCapabilities.map((item) => <p key={item}>缺少能力：{item}</p>)}<Diagnostics diagnostics={resolution.diagnostics} /></div> : null}
        <div className="creator-tool-grid">{filteredTools.map(({ diagnostics, manifest }) => <label className="creator-tool-card" key={manifest.name}>
          <span><input checked={(state.selectedToolNames ?? []).includes(manifest.name)} type="checkbox" onChange={() => toggleTool(manifest.name)} /> <strong>{manifest.displayName ?? manifest.name}</strong></span>
          <span>{manifest.description}</span><span>风险：{manifest.riskLevel} · 可用性：{manifest.availability}</span>
          <span>权限：{manifest.requiredPermissions.join("、") || "无"}</span><span>副作用：{manifest.sideEffects.join("、") || "无"}</span>
          <span>访问：读 {String(manifest.access.read)} / 写 {String(manifest.access.write)} / 破坏性 {String(manifest.access.destructive)}</span>
          {diagnostics.map((item, index) => <span key={`${item.code}-${index}`}>{item.severity}：{item.message}</span>)}
        </label>)}</div>
        <button disabled={Boolean(pending) || state.selectedToolNames === undefined} type="button" onClick={confirmTools}>{pending === "confirm-tools" ? "正在确认…" : "确认工具方案"}</button>
      </CreatorSection> : null}

      {state.confirmedToolNames !== undefined ? <CreatorSection title="5–6. Bundle 与 Diagnostics">
        <button disabled={Boolean(pending)} type="button" onClick={generate}>{pending === "generate" ? "正在生成…" : state.bundle ? "重新生成 Bundle" : "生成 Bundle"}</button>
        {pending === "generate" ? <small>Bundle 生成请求已发送；当前后端契约不提供可确认的取消结果。</small> : null}
        {generationMs !== undefined ? <small>最近一次生成耗时：{generationMs} ms</small> : null}
        {state.bundle ? <><p>{Object.keys(state.bundle.files).length} 个文件，{state.bundle.diagnostics.length} 条 diagnostics。</p><Diagnostics diagnostics={state.bundle.diagnostics} /></> : null}
      </CreatorSection> : null}

      {state.bundle && !errors.length ? <CreatorSection title="7. Smoke Case 与 Evidence">
        <button disabled={Boolean(pending)} type="button" onClick={suggestSmoke}>{pending === "suggest" ? "正在建议…" : "建议 Smoke Cases"}</button>
        {state.smokeCases?.map((item, index) => <div className="creator-smoke-case" key={item.id}>
          <strong>{item.id}</strong>
          <label>输入<textarea value={item.input} onChange={(event) => updateSmokeCase(index, "input", event.target.value)} /></label>
          <label>预期<textarea value={item.expected} onChange={(event) => updateSmokeCase(index, "expected", event.target.value)} /></label>
        </div>)}
        {state.smokeCases?.length ? <button disabled={Boolean(pending)} type="button" onClick={runSmoke}>{pending === "smoke" ? "正在执行…" : "执行 Smoke"}</button> : null}
        {state.smokeResult ? <div aria-label="Smoke Evidence"><p>质量门：{state.smokeResult.qualityGate}</p>{state.smokeResult.evidence.map((item) => <article key={item.case.id}><strong>{item.case.id}：{item.status}{item.errorType ? `（${item.errorType}）` : ""}</strong><p>{item.output ?? item.errorMessage ?? "后端未提供摘要"}</p><small>{item.durationMs} ms</small></article>)}</div> : null}
      </CreatorSection> : null}

      {state.smokeResult ? <CreatorSection title="8. 保存草稿与提交审核">
        <p>{state.draftSaved && state.draft ? `草稿 ${state.draft.id} 已保存（r${state.draft.revision}）。` : "当前 Creator 结果尚未保存。"}</p>
        <div className="skill-draft-actions">
          <button disabled={Boolean(pending) || hasErrors(state)} type="button" onClick={saveDraft}>{pending === "save" ? "正在保存…" : "保存草稿"}</button>
          {state.draftSaved && state.draft?.status === "editing" ? <button disabled={Boolean(pending) || hasErrors(state)} type="button" onClick={submitDraft}>{pending === "submit" ? "正在提交…" : "提交审核"}</button> : null}
          {state.draft ? <Link href={`/skills/drafts/${encodeURIComponent(state.draft.id)}?mode=daily`}>打开草稿</Link> : null}
        </div>
        {submission ? <p role="status">已进入审核：{submission.id}</p> : null}
      </CreatorSection> : null}

      {error ? <SkillMarketErrorState error={error} onRecover={() => retryRef.current?.()} /> : null}
    </section>
  );
}

function CreatorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="creator-section"><h2>{title}</h2>{children}</section>;
}

function RequirementSummary({ requirement }: { requirement: RequirementSpecV1 }) {
  return <dl className="creator-requirement"><div><dt>目标</dt><dd>{requirement.goal}</dd></div><div><dt>输入</dt><dd>{requirement.input.description}</dd></div><div><dt>输出</dt><dd>{requirement.output.description}</dd></div><div><dt>来源</dt><dd>{requirement.status === "confirmed" ? "用户已确认" : "模型建议，待确认"}</dd></div></dl>;
}

function Diagnostics({ diagnostics }: { diagnostics: SkillDiagnostic[] }) {
  if (!diagnostics.length) return <p role="status">未发现 diagnostics。</p>;
  return <div aria-label="Bundle diagnostics">{(["error", "warning"] as const).map((severity) => {
    const items = diagnostics.filter((item) => item.severity === severity);
    return items.length ? <section key={severity}><strong>{severity === "error" ? "错误" : "警告"}（{items.length}）</strong><ul>{items.map((item, index) => <li key={`${item.code}-${index}`}>{item.field ?? "未指定文件"}{item.line ? `:${item.line}` : ""} · {item.message} <small>({item.code})</small></li>)}</ul></section> : null;
  })}</div>;
}

function hasErrors(state: CreatorState): boolean {
  return state.bundle?.diagnostics.some((item) => item.severity === "error") ?? true;
}

function validBasic(basic: CreatorState["basic"]): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(basic.name) && basic.title.trim().length > 0
    && basic.version.trim().length > 0 && basic.description.trim().length >= 10;
}

function stepLabel(step: ReturnType<typeof creatorStep>): string {
  const labels: Record<ReturnType<typeof creatorStep>, string> = {
    requirement: "Requirement Interview", confirmation: "Spec 确认", tools: "Tool Resolution",
    bundle: "Bundle 生成", diagnostics: "Diagnostics 修正", smoke: "Smoke", save: "保存草稿", complete: "已保存",
  };
  return labels[step];
}

function loadSafeBasic(): CreatorState["basic"] {
  if (typeof window === "undefined") return EMPTY_CREATOR_BASIC;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem("skill-creator-safe-progress") ?? "null");
    if (!value || typeof value !== "object") return EMPTY_CREATOR_BASIC;
    const input = value as Partial<CreatorState["basic"]>;
    return {
      ...EMPTY_CREATOR_BASIC, name: typeof input.name === "string" ? input.name : "",
      scenarioId: input.scenarioId === "daily" ? "daily" : "daily",
      title: typeof input.title === "string" ? input.title : "",
      version: typeof input.version === "string" ? input.version : "1.0.0",
    };
  } catch { return EMPTY_CREATOR_BASIC; }
}

function saveSafeBasic(basic: CreatorState["basic"]): void {
  try {
    sessionStorage.setItem("skill-creator-safe-progress", JSON.stringify({
      name: basic.name, scenarioId: basic.scenarioId, title: basic.title, version: basic.version,
    }));
  } catch { /* Storage can be unavailable; Creator remains usable in memory. */ }
}

function toCreatorError(error: unknown): SkillMarketError {
  if (error instanceof SkillMarketError) return error;
  return new SkillMarketError({
    area: "creator", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
    recovery: "retry", retryable: true, status: 502,
    userMessage: "Skill Market 服务暂不可用，请稍后重试。",
  });
}
