"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { LoadingState } from "@/components/states/loading-state";
import { SkillBackLink } from "@/features/skills/components/skill-back-link";
import { SkillMarketWorkPlaceholder } from "@/features/skills/catalog/skill-catalog-plaza";
import { SkillMarketErrorState } from "@/features/skills/components/skill-market-error-state";
import { useAppMode } from "@/providers/mode-provider";

import type { SkillMarketClient, SkillMarketMutationResult } from "../api/client";
import { getBrowserSkillMarketClient } from "../api/browser-client";
import { draftMutationAdapter, draftUpdateAdapter } from "../contracts/authoring-view-model";
import { SkillMarketError, type SkillMarketRecoveryAction } from "../contracts/error";
import type { CreatorGenerateResponse, CreatorToolListResponse, RequirementSpecV1, SkillDiagnostic, ToolResolutionResponse } from "../contracts/generated";
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

type PendingAction = "analyze" | "revise" | "confirm-requirement" | "recommend" | "generate" | "suggest" | "smoke" | "save";

interface ConfirmAndRecommendResult {
  requirement: RequirementSpecV1;
  resolution: ToolResolutionResponse;
}

interface ConfirmAndGenerateResult {
  bundle: CreatorGenerateResponse;
  requirement: RequirementSpecV1;
}

export function SkillCreator({ client, draftId }: { client?: SkillMarketClient; draftId?: string }) {
  const { mode } = useAppMode();
  if (mode === "work") return <SkillMarketWorkPlaceholder />;
  return <SkillCreatorDaily client={client ?? getBrowserSkillMarketClient()} draftId={draftId} />;
}

function SkillCreatorDaily({ client, draftId }: { client: SkillMarketClient; draftId?: string }) {
  const router = useRouter();
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const pendingRef = useRef<PendingAction | undefined>(undefined);
  const retryRef = useRef<(() => void) | undefined>(undefined);
  const savedDraftRef = useRef<string | null>(null);
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
  const [generationMs, setGenerationMs] = useState<number>();

  useEffect(() => {
    saveSafeBasic(state.basic);
  }, [state.basic]);

  useEffect(() => {
    if (!draftId || savedDraftRef.current === draftId) return;
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
  }

  function editRequirementDescription() {
    setError(undefined);
    descriptionRef.current?.focus();
    descriptionRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  }

  function recoverFromError(action: SkillMarketRecoveryAction) {
    if (action === "edit") {
      editRequirementDescription();
      return;
    }
    retryRef.current?.();
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

  function confirmRequirementAndRecommend() {
    if (!state.interview) return;
    const interview = state.interview;
    const scenarioId = state.basic.scenarioId;
    run("confirm-requirement", async (): Promise<SkillMarketMutationResult<ConfirmAndRecommendResult>> => {
      const confirmed = await client.mutate({
        body: { requirement: interview.requirement }, mode: "daily", operation: "confirmRequirement",
      }, confirmRequirementAdapter);
      if (!confirmed.ok) return confirmed;
      const recommended = await client.mutate({
        body: { requirement: confirmed.value.requirement, scenarioId },
        mode: "daily", operation: "recommendToolResolution",
      }, recommendToolsAdapter);
      if (!recommended.ok) return recommended;
      return { ok: true, value: { requirement: confirmed.value.requirement, resolution: recommended.value } };
    }, ({ requirement, resolution }) => {
      setResolution(resolution);
      setState((current) => ({
        ...current,
        bundle: undefined,
        confirmedRequirement: requirement,
        confirmedToolNames: undefined,
        draftSaved: current.draft ? false : undefined,
        selectedToolNames: resolution.recommendations.map((item) => item.name),
        smokeCases: undefined,
        smokeResult: undefined,
      }));
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

  function confirmToolsAndGenerate() {
    if (!state.confirmedRequirement || !state.selectedToolNames) return;
    const basic = state.basic;
    const selectedToolNames = state.selectedToolNames;
    const requirement = state.confirmedRequirement;
    const startedAt = performance.now();
    run("generate", async (): Promise<SkillMarketMutationResult<ConfirmAndGenerateResult>> => {
      const confirmed = await client.mutate({
        body: { confirmedToolNames: selectedToolNames, requirement, scenarioId: basic.scenarioId },
        mode: "daily", operation: "confirmToolResolution",
      }, confirmToolsAdapter);
      if (!confirmed.ok) return confirmed;
      const generated = await client.mutate({
        body: {
          name: basic.name, requirement: confirmed.value.requirement,
          scenarioIds: [basic.scenarioId], title: basic.title, version: basic.version,
        },
        mode: "daily", operation: "generateSkillBundle",
      }, generateBundleAdapter);
      if (!generated.ok) return generated;
      return { ok: true, value: { bundle: generated.value, requirement: confirmed.value.requirement } };
    }, ({ bundle, requirement }) => {
      setGenerationMs(Math.round(performance.now() - startedAt));
      setState((current) => ({
        ...current, bundle: { diagnostics: bundle.diagnostics, files: bundle.files }, confirmedRequirement: requirement,
        confirmedToolNames: selectedToolNames, draftSaved: current.draft ? false : undefined,
        smokeCases: undefined, smokeResult: undefined,
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
    if (!state.bundle || hasErrors(state)) return;
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
    }, draftMutationAdapter), (response) => {
      savedDraftRef.current = response.draft.id;
      setState((current) => ({
        ...current,
        bundle: current.bundle ? { ...current.bundle, diagnostics: response.diagnostics } : current.bundle,
        draft: response.draft, draftSaved: true,
      }));
      router.replace(`/skills/creator?mode=1&draftId=${encodeURIComponent(response.draft.id)}`);
    });
  }

  if (loadingDraft) return <LoadingState label="正在恢复 Creator 草稿…" />;
  if (state.draft && state.draft.status !== "editing") {
    return <section className="resource-page skill-creator-page">
      <SkillBackLink href="/skills?mode=1">返回 Skill 广场</SkillBackLink>
      <div className="skill-draft-notice" role="status">该草稿状态为 {state.draft.status}，Creator 不再发起变更。</div>
    </section>;
  }
  const step = creatorStep(state);
  const errors = state.bundle?.diagnostics.filter((item) => item.severity === "error") ?? [];
  const requiredCapabilities = state.confirmedRequirement?.tools.requiredCapabilities ?? [];
  const missingCapabilities = resolution?.missingCapabilities ?? state.confirmedRequirement?.tools.missingCapabilities ?? [];
  const hasMissingCapabilities = missingCapabilities.length > 0;
  const capabilityResolutionInconsistent = requiredCapabilities.length === 0;
  const missingCapabilityError = error ? isMissingCapabilityError(error) : false;

  return (
    <section className="resource-page skill-creator-page">
      <SkillBackLink href="/skills?mode=1">返回 Skill 广场</SkillBackLink>
      <header className="page-heading"><div><h1>Skill Creator</h1><p>当前阶段：{stepLabel(step)}。服务端结果优先，本地仅短期保留基本进度。</p></div></header>
      <nav className="creator-steps" aria-label="Creator 流程">
        {[
          "需求定义", "工具与生成", "验证", "保存与提交",
        ].map((label, index) => <span key={label}>{index + 1}. {label}</span>)}
      </nav>

      <CreatorSection title="1. 基本信息">
        <div className="creator-form-grid">
          <label>名称<input value={state.basic.name} onChange={(event) => updateBasic("name", event.target.value)} /></label>
          <label>标题<input value={state.basic.title} onChange={(event) => updateBasic("title", event.target.value)} /></label>
          <label>版本<input value={state.basic.version} onChange={(event) => updateBasic("version", event.target.value)} /></label>
          <label>目标场景<input disabled value={state.basic.scenarioId} /></label>
        </div>
        <label>需求描述<textarea ref={descriptionRef} rows={5} value={state.basic.description} onChange={(event) => updateBasic("description", event.target.value)} /></label>
        <small>需求描述可能包含业务内容，不会写入浏览器持久缓存。</small>
        <div className="creator-action-bar">
          <button className="primary-button creator-action-button" disabled={Boolean(pending) || !validBasic(state.basic)} type="button" onClick={analyze}>{pending === "analyze" ? "正在分析…" : "分析需求"}</button>
        </div>
      </CreatorSection>

      {state.interview ? <CreatorSection title="2–3. Requirement Interview 与 Spec 确认">
        <p className="creator-spec-hint"><strong>Spec 是什么？</strong> Spec 是生成 Skill 前的结构化需求合同，用来固定目标、输入、输出、触发边界和成功标准，后续的工具推荐、Bundle 生成和审核都以它为准。</p>
        <p><strong>模型建议摘要：</strong>{state.interview.summary}</p>
        <RequirementSummary confirmed={Boolean(state.confirmedRequirement)} requirement={state.confirmedRequirement ?? state.interview.requirement} />
        {state.interview.questions.map((question, index) => <label key={question}>{question}<textarea rows={2} value={answers[index] ?? ""} onChange={(event) => {
          const next = [...answers]; next[index] = event.target.value; setAnswers(next);
        }} /></label>)}
        <div className="skill-draft-actions creator-action-bar">
          {state.interview.questions.length ? (
            <button className="secondary-button creator-action-button" disabled={Boolean(pending) || !answers.some((item) => item.trim())} type="button" onClick={revise}>{pending === "revise" ? "正在修订…" : "提交回答并修订 Spec"}</button>
          ) : (
            <button className="secondary-button creator-action-button" disabled={Boolean(pending)} type="button" onClick={editRequirementDescription}>修改需求描述</button>
          )}
          <button className="primary-button creator-action-button" disabled={Boolean(pending)} type="button" onClick={confirmRequirementAndRecommend}>{pending === "confirm-requirement" ? "正在确认并推荐…" : "确认 Spec 并推荐工具"}</button>
        </div>
      </CreatorSection> : null}

      {state.confirmedRequirement ? <CreatorSection title="4. Tool Catalog 与 Tool Resolution">
        <p>这里展示当前 daily 场景可用的工具及其安全元数据。只选 Skill 确实需要的工具；纯 Prompt Skill 可以保持 0 个工具。</p>
        <div className="creator-tool-toolbar">
          <input aria-label="搜索工具" placeholder="搜索工具" value={toolSearch} onChange={(event) => setToolSearch(event.target.value)} />
          <select aria-label="风险筛选" value={toolRisk} onChange={(event) => setToolRisk(event.target.value)}><option value="all">全部风险</option><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="input-dependent">依输入判断</option></select>
          <button className="secondary-button creator-action-button" disabled={Boolean(pending)} type="button" onClick={recommendTools}>{pending === "recommend" ? "正在推荐…" : resolution ? "重新获取服务端推荐" : "获取服务端推荐"}</button>
        </div>
        {resolution ? <ToolRecommendationSummary resolution={resolution} /> : null}
        {hasMissingCapabilities ? <CreatorCapabilityBlocker capabilities={missingCapabilities} inconsistent={capabilityResolutionInconsistent} onEdit={editRequirementDescription} title={capabilityResolutionInconsistent ? "服务端能力解析不一致" : "暂时无法生成 Bundle"} /> : null}
        <div className="creator-tool-grid">{filteredTools.map((item) => <ToolCard
          checked={(state.selectedToolNames ?? []).includes(item.manifest.name)}
          item={item}
          key={item.manifest.name}
          onToggle={() => toggleTool(item.manifest.name)}
          recommendation={resolution?.recommendations.find((entry) => entry.name === item.manifest.name)?.reason}
        />)}</div>
        <div className="creator-selection-summary"><span>已选择 <strong>{state.selectedToolNames?.length ?? 0}</strong> 个工具</span><small>{hasMissingCapabilities ? "仍有能力缺口，暂时不能生成 Bundle。" : state.selectedToolNames?.length ? "确认后将写入 Skill Definition。" : "当前为无工具配置，适合纯 Prompt Skill。"}</small></div>
        <div className="creator-action-bar">
          <button className="primary-button creator-action-button" disabled={Boolean(pending) || state.selectedToolNames === undefined || hasMissingCapabilities} type="button" onClick={confirmToolsAndGenerate}>{pending === "generate" ? "正在确认并生成…" : state.bundle ? "重新确认工具并生成 Bundle" : "确认工具并生成 Bundle"}</button>
        </div>
      </CreatorSection> : null}

      {state.confirmedToolNames !== undefined ? <CreatorSection title="5–6. Bundle 与 Diagnostics">
        <p className="creator-bundle-hint"><span>Bundle 是根据已确认的 Spec 和工具配置生成的 Skill 文件包，包含注册和运行所需内容。</span><span>Diagnostics 是生成后的校验结果，会检查文件结构、字段、工具引用和规则；0 条表示未发现问题。</span></p>
        {pending === "generate" ? <small>Bundle 生成请求已发送；当前后端契约不提供可确认的取消结果。</small> : null}
        {generationMs !== undefined ? <small>最近一次生成耗时：{generationMs} ms</small> : null}
        {state.bundle ? <><p>{Object.keys(state.bundle.files).length} 个文件，{state.bundle.diagnostics.length} 条 diagnostics。</p><Diagnostics diagnostics={state.bundle.diagnostics} /></> : null}
      </CreatorSection> : null}

      {state.bundle && !errors.length ? <CreatorSection title="7. Smoke Case 与 Evidence">
        <p className="creator-smoke-hint">Smoke Case 从已确认的 Spec 示例和成功标准派生，可在执行前编辑。</p>
        <div className="creator-action-bar creator-action-bar-compact"><button className="secondary-button creator-action-button" disabled={Boolean(pending)} type="button" onClick={suggestSmoke}>{pending === "suggest" ? "正在建议…" : "从 Spec 建议 Smoke Cases"}</button></div>
        {state.smokeCases?.map((item, index) => <div className="creator-smoke-case" key={item.id}>
          <strong>{item.id}</strong>
          <label>输入<textarea value={item.input} onChange={(event) => updateSmokeCase(index, "input", event.target.value)} /></label>
          <label>预期<textarea value={item.expected} onChange={(event) => updateSmokeCase(index, "expected", event.target.value)} /></label>
        </div>)}
        {state.smokeCases?.length ? <div className="creator-action-bar"><button className="primary-button creator-action-button" disabled={Boolean(pending)} type="button" onClick={runSmoke}>{pending === "smoke" ? "正在执行…" : "执行 Smoke"}</button></div> : null}
        {state.smokeResult ? <div aria-label="Smoke Evidence" className="creator-smoke-evidence">
          <div className="creator-smoke-gate"><span>质量门</span><strong>{state.smokeResult.qualityGate === "soft" ? "软门禁" : state.smokeResult.qualityGate}</strong></div>
          <div className="creator-smoke-evidence-list">{state.smokeResult.evidence.map((item) => <article className="creator-smoke-evidence-item" key={item.case.id}>
            <div className="creator-smoke-evidence-heading"><strong>{item.case.id}</strong><span className={`creator-smoke-status is-${item.status}`}>{smokeStatusLabel(item.status)}</span><small>{item.durationMs} ms</small></div>
            <p>{item.output ?? item.errorMessage ?? "后端未提供摘要"}</p>
            {item.errorType ? <small>{smokeErrorTypeLabel(item.errorType)}</small> : null}
          </article>)}</div>
        </div> : null}
      </CreatorSection> : null}

      {state.bundle && !errors.length ? <CreatorSection title="8. 保存草稿与提交审核">
        <p>{state.draftSaved && state.draft ? `草稿 ${state.draft.id} 已保存（r${state.draft.revision}）。` : "当前 Creator 结果尚未保存。"}</p>
        {!state.smokeResult ? <p className="skill-draft-notice">Smoke 尚未运行；这是 Soft Gate，不阻止保存，也不会阻止之后从作者工作台提交审核。</p> : null}
        <div className="skill-draft-actions creator-action-bar">
          {state.draft ? <Link className="secondary-button creator-action-button" href={`/skills/drafts/${encodeURIComponent(state.draft.id)}?mode=1`}>打开草稿</Link> : null}
          {state.draftSaved && state.draft?.status === "editing" ? <Link className="secondary-button creator-action-button" href="/skills/mine?mode=1">前往作者工作台提交审核</Link> : null}
          <button className="primary-button creator-action-button" disabled={Boolean(pending) || hasErrors(state)} type="button" onClick={saveDraft}>{pending === "save" ? "正在保存…" : "保存草稿"}</button>
        </div>
      </CreatorSection> : null}

      {error ? missingCapabilityError ? (
        <CreatorCapabilityBlocker capabilities={missingCapabilities} inconsistent={capabilityResolutionInconsistent} onEdit={editRequirementDescription} requestId={error.requestId} title={capabilityResolutionInconsistent ? "服务端能力解析不一致" : "工具能力不匹配"} />
      ) : <SkillMarketErrorState error={error} onRecover={recoverFromError} /> : null}
    </section>
  );
}

function CreatorSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="creator-section"><h2>{title}</h2>{children}</section>;
}

function RequirementSummary({ confirmed, requirement }: { confirmed: boolean; requirement: RequirementSpecV1 }) {
  return <div className="creator-spec-grid">
    <section className="creator-spec-card creator-spec-core">
      <div className="creator-spec-card-heading"><h3>核心定义</h3><span className={confirmed ? "creator-status-badge is-confirmed" : "creator-status-badge"}>{confirmed ? "已确认" : "待你确认"}</span></div>
      <dl className="creator-requirement"><SpecRow label="目标" value={requirement.goal} /><SpecRow label="输入" value={requirement.input.description} /><SpecRow label="输出" value={requirement.output.description} /></dl>
    </section>
    <section className="creator-spec-card">
      <h3>触发边界</h3>
      <SpecList label="何时使用" items={[requirement.trigger.whenToUse]} />
      <SpecList label="正向示例" items={requirement.trigger.positiveExamples} />
      <SpecList label="反向示例" items={requirement.trigger.negativeExamples} />
    </section>
    <section className="creator-spec-card">
      <h3>能力与验收</h3>
      <SpecList empty="无需额外能力" label="必需能力" items={requirement.tools.requiredCapabilities} />
      <SpecList empty="无" label="约束" items={requirement.constraints} />
      <SpecList empty="待补充" label="成功标准" items={requirement.successCriteria} />
    </section>
  </div>;
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function SpecList({ empty = "无", items, label }: { empty?: string; items: string[]; label: string }) {
  return <div className="creator-spec-list"><strong>{label}</strong>{items.length ? <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul> : <span>{empty}</span>}</div>;
}

function ToolRecommendationSummary({ resolution }: { resolution: ToolResolutionResponse }) {
  const hasRecommendations = resolution.recommendations.length > 0;
  const hasMissingCapabilities = resolution.missingCapabilities.length > 0;
  return <div className="creator-recommendations">
    <strong>{hasRecommendations ? "服务端推荐" : "推荐结果"}</strong>
    {hasRecommendations ? resolution.recommendations.map((item) => <p key={item.name}><b>{item.name}</b>：{item.reason}</p>) : hasMissingCapabilities ? <p>当前没有已注册工具能够满足 Spec。</p> : <p>当前 Spec 不需要额外工具，可以保持无工具配置。</p>}
    <Diagnostics diagnostics={resolution.diagnostics} />
  </div>;
}

function CreatorCapabilityBlocker({ capabilities, inconsistent, onEdit, requestId, title }: { capabilities: string[]; inconsistent: boolean; onEdit: () => void; requestId?: string; title: string }) {
  return <section className="creator-capability-blocker" role="alert">
    <h2>{title}</h2>
    {inconsistent ? <>
      <p>当前 Spec 已明确“无需额外能力”，但 Tool Resolution 仍报告能力缺口。这是服务端解析结果冲突，不是需求文案问题。</p>
      <p>请重新获取服务端推荐；如果仍然出现，可使用排障 ID 检查服务端。</p>
    </> : <>
      <p>{capabilities.length ? <>没有已注册工具能够满足：<strong>{capabilities.join("、")}</strong>。</> : "后端确认时发现仍有未满足的工具能力。"}</p>
      <p>请返回检查 Spec 的必需能力，或注册并选择兼容工具。</p>
    </>}
    {requestId ? <small>排障 ID：{requestId}</small> : null}
    <div className="creator-action-bar creator-action-bar-compact"><button className="secondary-button creator-action-button" type="button" onClick={onEdit}>返回修改需求</button></div>
  </section>;
}

function isMissingCapabilityError(error: SkillMarketError): boolean {
  return error.diagnostics?.some((item) => item.field === "tools.missingCapabilities" || item.code.toLocaleLowerCase().includes("missingcapabilit")) ?? false;
}

type CreatorToolItem = CreatorToolListResponse["items"][number];

function ToolCard({ checked, item, onToggle, recommendation }: { checked: boolean; item: CreatorToolItem; onToggle: () => void; recommendation?: string }) {
  const { diagnostics, manifest } = item;
  return <article className={checked ? "creator-tool-card is-selected" : "creator-tool-card"}>
    <div className="creator-tool-card-heading">
      <label><input checked={checked} type="checkbox" onChange={onToggle} /><span><h3>{manifest.displayName ?? manifest.name}</h3><code>{manifest.name}{manifest.version ? ` · v${manifest.version}` : ""}</code></span></label>
      <div className="creator-tool-badges"><span className={`creator-tool-badge risk-${manifest.riskLevel}`}>{riskLabel(manifest.riskLevel)}</span><span className="creator-tool-badge">{availabilityLabel(manifest.availability)}</span>{recommendation ? <span className="creator-tool-badge is-recommended">服务端推荐</span> : null}</div>
    </div>
    <p className="creator-tool-description">{toolDescriptionSummary(manifest.description)}</p>
    {recommendation ? <p className="creator-tool-reason">推荐理由：{recommendation}</p> : null}
    <dl className="creator-tool-details">
      <ToolDetail label="权限" value={manifest.requiredPermissions.join("、") || "无需权限"} />
      <ToolDetail label="访问级别" value={accessLabel(manifest.access)} />
      <ToolDetail label="副作用" value={manifest.sideEffects.length ? manifest.sideEffects.map(sideEffectLabel).join("、") : "无已知副作用"} />
      <ToolDetail label="适用场景" value={manifest.supportedScenarios.join("、") || "未标注"} />
    </dl>
    <details className="creator-tool-schema"><summary>输入格式（JSON Schema）</summary><div className="creator-tool-schema-content"><strong>输入</strong><pre>{JSON.stringify(manifest.inputSchema, null, 2)}</pre>{manifest.outputSchema ? <><strong>输出</strong><pre>{JSON.stringify(manifest.outputSchema, null, 2)}</pre></> : null}</div></details>
    {diagnostics.length ? <details className="creator-tool-diagnostics"><summary>{diagnostics.length} 条校验信息</summary><ul>{diagnostics.map((item, index) => <li key={`${item.code}-${index}`}><strong>{item.severity === "error" ? "错误" : "警告"}</strong>：{item.message} <small>({item.code})</small></li>)}</ul></details> : <p className="creator-tool-valid">校验通过</p>}
  </article>;
}

function toolDescriptionSummary(description: string): string {
  const summary = description.split(/\s+Input:\s*/i, 1)[0]?.trim() || description.trim();
  return summary.endsWith(".") ? summary : `${summary}.`;
}

function ToolDetail({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function riskLabel(risk: CreatorToolItem["manifest"]["riskLevel"]): string {
  return { high: "高风险", low: "低风险", medium: "中风险", "input-dependent": "依输入判断" }[risk];
}

function availabilityLabel(availability: CreatorToolItem["manifest"]["availability"]): string {
  return { internal: "内部工具", public: "公开工具", restricted: "受限工具" }[availability];
}

function accessLabel(access: CreatorToolItem["manifest"]["access"]): string {
  const labels: string[] = [];
  if (access.read === true) labels.push("只读");
  else if (access.read === "input-dependent") labels.push("读取依输入判断");
  if (access.write === true) labels.push("可写");
  else if (access.write === "input-dependent") labels.push("写入依输入判断");
  if (access.destructive === true) labels.push("可执行破坏性操作");
  else if (access.destructive === "input-dependent") labels.push("破坏性依输入判断");
  return labels.join("、") || "无数据访问";
}

function sideEffectLabel(effect: CreatorToolItem["manifest"]["sideEffects"][number]): string {
  return { database: "数据库", "external-system": "外部系统", filesystem: "文件系统", network: "网络", unknown: "未分类", "user-notification": "用户通知" }[effect];
}

function smokeStatusLabel(status: "error" | "failed" | "passed"): string {
  return { error: "错误", failed: "未通过", passed: "通过" }[status];
}

function smokeErrorTypeLabel(errorType: "model_error" | "runtime_error" | "task_failure"): string {
  return { model_error: "模型错误", runtime_error: "运行错误", task_failure: "未满足预期" }[errorType];
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
