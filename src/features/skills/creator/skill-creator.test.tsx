import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import type { RequirementSpecV1 } from "../contracts/generated";
import { SkillCreator } from "./skill-creator";

let mockMode = "daily";
const replace = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/creator",
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}`),
}));

describe("SkillCreator", () => {
  beforeEach(() => {
    mockMode = "daily";
    replace.mockClear();
    sessionStorage.clear();
  });

  it("keeps the legacy Creator navigation: return to plaza and bind the URL after first save", async () => {
    const mutate = vi.fn(async (input: { operation: string }) => {
      switch (input.operation) {
        case "analyzeRequirement":
          return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
        case "confirmRequirement":
          return { ok: true, value: { requirement } };
        case "recommendToolResolution":
          return { ok: true, value: { candidates: [toolManifest], diagnostics: [], missingCapabilities: [], recommendations: [] } };
        case "confirmToolResolution":
          return { ok: true, value: { requirement } };
        case "generateSkillBundle":
          return { ok: true, value: { diagnostics: [], files: { "SKILL.md": "# Demo" } } };
        case "createDraft":
          return { ok: true, value: { diagnostics: [], draft: { id: "draft-1", revision: 1, status: "editing" } } };
        default:
          throw new Error(`Unexpected mutation ${input.operation}`);
      }
    });
    const query = vi.fn(async () => ({ items: [{ diagnostics: [], manifest: toolManifest }] }));
    render(<ModeProvider><SkillCreator client={{ mutate, query } as unknown as SkillMarketClient} /></ModeProvider>);

    expect(screen.getByRole("link", { name: /返回 Skill 广场/ })).toHaveAttribute("href", "/skills?mode=1");
    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    await screen.findByRole("button", { name: "确认 Spec 并推荐工具" });
    fireEvent.click(screen.getByRole("button", { name: "确认 Spec 并推荐工具" }));
    await screen.findByRole("button", { name: "确认工具并生成 Bundle" });
    fireEvent.click(screen.getByRole("button", { name: "确认工具并生成 Bundle" }));
    await screen.findByRole("button", { name: "保存草稿" });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/skills/creator?mode=1&draftId=draft-1"));
  });

  it("keeps the saved state when the URL binds the draft that was just saved", async () => {
    const mutate = vi.fn(async (input: { operation: string }) => {
      switch (input.operation) {
        case "analyzeRequirement":
          return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
        case "confirmRequirement":
          return { ok: true, value: { requirement } };
        case "recommendToolResolution":
          return { ok: true, value: { candidates: [toolManifest], diagnostics: [], missingCapabilities: [], recommendations: [] } };
        case "confirmToolResolution":
          return { ok: true, value: { requirement } };
        case "generateSkillBundle":
          return { ok: true, value: { diagnostics: [], files: { "SKILL.md": "# Demo" } } };
        case "createDraft":
          return { ok: true, value: { diagnostics: [], draft: { id: "draft-1", revision: 1, status: "editing" } } };
        default:
          throw new Error(`Unexpected mutation ${input.operation}`);
      }
    });
    const getDraft = vi.fn(async () => {
      throw new Error("getDraft must not reload the draft that was just saved");
    });
    const query = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "getDraft") return getDraft();
      return { items: [{ diagnostics: [], manifest: toolManifest }] };
    });
    const client = { mutate, query } as unknown as SkillMarketClient;
    const view = render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    await screen.findByRole("button", { name: "确认 Spec 并推荐工具" });
    fireEvent.click(screen.getByRole("button", { name: "确认 Spec 并推荐工具" }));
    await screen.findByRole("button", { name: "确认工具并生成 Bundle" });
    fireEvent.click(screen.getByRole("button", { name: "确认工具并生成 Bundle" }));
    await screen.findByRole("button", { name: "保存草稿" });
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/skills/creator?mode=1&draftId=draft-1"));
    expect(screen.getByRole("link", { name: "前往作者工作台提交审核" })).toBeInTheDocument();

    view.rerender(<ModeProvider><SkillCreator client={client} draftId="draft-1" /></ModeProvider>);

    expect(getDraft).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "前往作者工作台提交审核" })).toBeInTheDocument();
    expect(screen.getByText(/草稿 draft-1 已保存/)).toBeInTheDocument();
  });

  it("prevents duplicate requirement analysis while the mutation is pending", async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutate = vi.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const client = { mutate, query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    const analyze = screen.getByRole("button", { name: "分析需求" });
    fireEvent.click(analyze);
    fireEvent.click(analyze);
    expect(mutate).toHaveBeenCalledTimes(1);
    resolveMutation({ ok: false, error: new SkillMarketError({
      area: "creator", code: "SKILL_MARKET_UPSTREAM_UNAVAILABLE", presentation: "unavailable",
      recovery: "retry", retryable: true, status: 502, userMessage: "unavailable",
    }) });
    await waitFor(() => expect(screen.getByRole("button", { name: "分析需求" })).toBeEnabled());
  });

  it("does not create a client request in work mode", async () => {
    mockMode = "work";
    const client = { mutate: vi.fn(), query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "工作场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => {
      expect(client.query).not.toHaveBeenCalled();
      expect(client.mutate).not.toHaveBeenCalled();
    });
  });

  it("groups the internal workflow into four user-facing stages", () => {
    const client = { mutate: vi.fn(), query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    expect(screen.getByRole("navigation", { name: "Creator 流程" })).toHaveTextContent(
      "1. 需求定义2. 工具与生成3. 验证4. 保存与提交",
    );
  });

  it("presents requirement actions as clear buttons and lets users return to edit when no clarification is needed", async () => {
    const mutate = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "analyzeRequirement") {
        return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
      }
      throw new Error(`Unexpected mutation ${input.operation}`);
    });
    const client = { mutate, query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    const description = screen.getByLabelText("需求描述");
    fireEvent.change(description, { target: { value: "Build a useful demo skill" } });

    const analyze = screen.getByRole("button", { name: "分析需求" });
    expect(analyze).toHaveClass("primary-button", "creator-action-button");
    fireEvent.click(analyze);

    const confirm = await screen.findByRole("button", { name: "确认 Spec 并推荐工具" });
    expect(confirm).toHaveClass("primary-button", "creator-action-button");
    expect(screen.getByText(/Spec 是生成 Skill 前的结构化需求合同/)).toBeVisible();
    expect(screen.getByRole("heading", { name: "触发边界" })).toBeVisible();
    expect(screen.getByText("显式选择且未要求详细内容时使用")).toBeVisible();
    expect(screen.getByText("解释、建议和步骤类问题")).toBeVisible();
    expect(screen.getByText("长文、正式报告或高风险问题")).toBeVisible();
    expect(screen.getByText("无需额外能力")).toBeVisible();
    expect(screen.getByText("待你确认")).toBeVisible();

    const edit = screen.getByRole("button", { name: "修改需求描述" });
    expect(edit).toHaveClass("secondary-button", "creator-action-button");
    fireEvent.click(edit);
    expect(description).toHaveFocus();
  });

  it("shows the Spec revision action when the backend asks clarification questions", async () => {
    const mutate = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "analyzeRequirement") {
        return {
          ok: true,
          value: { questions: ["默认输出上限是多少？"], requirement, summary: "Needs clarification" },
        };
      }
      throw new Error(`Unexpected mutation ${input.operation}`);
    });
    const client = { mutate, query: vi.fn() } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));

    expect(await screen.findByRole("button", { name: "提交回答并修订 Spec" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("默认输出上限是多少？"), { target: { value: "80 个字" } });
    expect(screen.getByRole("button", { name: "提交回答并修订 Spec" })).toBeEnabled();
  });

  it("blocks Bundle generation and sends the user back to the requirement when capabilities are missing", async () => {
    const operations: string[] = [];
    const mutate = vi.fn(async (input: { operation: string }) => {
      operations.push(input.operation);
      if (input.operation === "analyzeRequirement") return { ok: true, value: { questions: [], requirement: blockedRequirement, summary: "Ready" } };
      if (input.operation === "confirmRequirement") return { ok: true, value: { requirement: blockedRequirement } };
      if (input.operation === "recommendToolResolution") return { ok: true, value: { candidates: [], diagnostics: [], missingCapabilities: ["web-search"], recommendations: [] } };
      throw new Error(`Unexpected mutation ${input.operation}`);
    });
    const client = { mutate, query: vi.fn(async () => ({ items: [] })) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    const description = screen.getByLabelText("需求描述");
    fireEvent.change(description, { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认 Spec 并推荐工具" }));

    expect(await screen.findByRole("heading", { name: "暂时无法生成 Bundle" })).toBeVisible();
    expect(screen.getByText("web-search", { selector: ".creator-capability-blocker strong" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认工具并生成 Bundle" })).toBeDisabled();
    expect(operations).not.toContain("confirmToolResolution");
    fireEvent.click(screen.getByRole("button", { name: "返回修改需求" }));
    expect(description).toHaveFocus();
  });

  it("localizes a late missing-capability response instead of exposing the raw backend diagnostic", async () => {
    const rawMessage = "Required capability is not satisfied: No compatible registered Tool satisfies the confirmed requirement.";
    const mutate = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "analyzeRequirement") return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
      if (input.operation === "confirmRequirement") return { ok: true, value: { requirement } };
      if (input.operation === "recommendToolResolution") return { ok: true, value: { candidates: [], diagnostics: [], missingCapabilities: [], recommendations: [] } };
      if (input.operation === "confirmToolResolution") return { ok: false, error: new SkillMarketError({
        area: "creator", code: "skill.validation_failed",
        diagnostics: [{ code: "tools.missingCapabilities", field: "tools.missingCapabilities", message: rawMessage, severity: "error" }],
        presentation: "validation", recovery: "edit", retryable: false, status: 422, userMessage: "请修正标记的问题后重试。",
      }) };
      throw new Error(`Unexpected mutation ${input.operation}`);
    });
    const client = { mutate, query: vi.fn(async () => ({ items: [] })) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    const description = screen.getByLabelText("需求描述");
    fireEvent.change(description, { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认 Spec 并推荐工具" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认工具并生成 Bundle" }));

    expect(await screen.findByRole("heading", { name: "服务端能力解析不一致" })).toBeVisible();
    expect(screen.getByText(/当前 Spec 已明确“无需额外能力”/)).toBeVisible();
    expect(screen.queryByText(rawMessage)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "返回修改需求" }));
    expect(description).toHaveFocus();
  });

  it("auto-recommends tools, confirms and generates in one action, then saves before Smoke", async () => {
    const operations: string[] = [];
    const mutate = vi.fn(async (input: { operation: string }) => {
      operations.push(input.operation);
      switch (input.operation) {
        case "analyzeRequirement":
          return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
        case "confirmRequirement":
          return { ok: true, value: { requirement } };
        case "recommendToolResolution":
          return { ok: true, value: {
            candidates: [toolManifest], diagnostics: [], missingCapabilities: [],
            recommendations: [{ name: "search", reason: "Matches the requirement" }],
          } };
        case "confirmToolResolution":
          return { ok: true, value: { requirement } };
        case "generateSkillBundle":
          return { ok: true, value: { diagnostics: [], files: { "SKILL.md": "# Demo" } } };
        case "createDraft":
          return { ok: true, value: { diagnostics: [], draft: { id: "draft-1", revision: 1, status: "editing" } } };
        default:
          throw new Error(`Unexpected mutation ${input.operation}`);
      }
    });
    const query = vi.fn(async () => ({ items: [{ diagnostics: [{ code: "tool.version_missing", message: "Tool version is not registered.", severity: "warning" }], manifest: toolManifest }] }));
    const client = { mutate, query } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    await screen.findByRole("button", { name: "确认 Spec 并推荐工具" });

    fireEvent.click(screen.getByRole("button", { name: "确认 Spec 并推荐工具" }));
    await waitFor(() => expect(operations.slice(-2)).toEqual(["confirmRequirement", "recommendToolResolution"]));
    expect(screen.getByText("已确认")).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Search" })).toBeVisible();
    expect(screen.getByText("低风险", { selector: ".creator-tool-badge" })).toBeVisible();
    expect(screen.getByText("公开工具")).toBeVisible();
    expect(screen.getByText("无需权限")).toBeVisible();
    expect(screen.getByText("只读")).toBeVisible();
    expect(screen.getByText("daily", { selector: ".creator-tool-details dd" })).toBeVisible();
    expect(screen.getByText("Search indexed information.")).toBeVisible();
    expect(screen.queryByText(/Input:\s*\{/)).not.toBeInTheDocument();
    const inputSchemaSummary = screen.getByText("输入格式（JSON Schema）");
    expect(inputSchemaSummary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/"query":/)).toBeInTheDocument();
    const diagnosticSummary = screen.getByText("1 条校验信息");
    expect(diagnosticSummary.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("button", { name: "重新获取服务端推荐" })).toHaveClass("secondary-button");
    expect(screen.getByRole("button", { name: "确认工具并生成 Bundle" })).toHaveClass("primary-button");

    fireEvent.click(screen.getByRole("button", { name: "确认工具并生成 Bundle" }));
    await screen.findByText("1 个文件，0 条 diagnostics。");
    expect(screen.getByText(/Bundle 是根据已确认的 Spec 和工具配置生成的 Skill 文件包/)).toBeVisible();
    expect(screen.getByText(/Diagnostics 是生成后的校验结果/)).toBeVisible();
    expect(operations.slice(-2)).toEqual(["confirmToolResolution", "generateSkillBundle"]);
    expect(screen.getByText("Smoke Case 从已确认的 Spec 示例和成功标准派生，可在执行前编辑。")).toBeVisible();
    expect(screen.getByRole("button", { name: "从 Spec 建议 Smoke Cases" })).toHaveClass("secondary-button");

    expect(screen.getByText("Smoke 尚未运行；这是 Soft Gate，不阻止保存，也不会阻止之后从作者工作台提交审核。")).toBeVisible();
    expect(screen.getByRole("button", { name: "保存草稿" })).toHaveClass("primary-button");
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await screen.findByText(/草稿 draft-1 已保存/);
    expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往作者工作台提交审核" })).toHaveAttribute(
      "href",
      "/skills/mine?mode=1",
    );
    expect(operations).not.toContain("runSmokeCases");
  });

  it("renders Smoke evidence with compact localized status hierarchy", async () => {
    const smokeCase = { expected: "回答保持简短", id: "smoke-1", input: "解释数据库索引" };
    const mutate = vi.fn(async (input: { operation: string }) => {
      if (input.operation === "analyzeRequirement") return { ok: true, value: { questions: [], requirement, summary: "Ready" } };
      if (input.operation === "confirmRequirement") return { ok: true, value: { requirement } };
      if (input.operation === "recommendToolResolution") return { ok: true, value: { candidates: [], diagnostics: [], missingCapabilities: [], recommendations: [] } };
      if (input.operation === "confirmToolResolution") return { ok: true, value: { requirement } };
      if (input.operation === "generateSkillBundle") return { ok: true, value: { diagnostics: [], files: { "SKILL.md": "# Demo" } } };
      if (input.operation === "suggestSmokeCases") return { ok: true, value: { cases: [smokeCase] } };
      if (input.operation === "runSmokeCases") return { ok: true, value: { evidence: [{ case: smokeCase, durationMs: 42, output: "索引减少全表扫描。", status: "passed" }], qualityGate: "soft" } };
      throw new Error(`Unexpected mutation ${input.operation}`);
    });
    const client = { mutate, query: vi.fn(async () => ({ items: [] })) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认 Spec 并推荐工具" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认工具并生成 Bundle" }));
    fireEvent.click(await screen.findByRole("button", { name: "从 Spec 建议 Smoke Cases" }));
    fireEvent.click(await screen.findByRole("button", { name: "执行 Smoke" }));

    const evidence = await screen.findByLabelText("Smoke Evidence");
    expect(evidence).toHaveClass("creator-smoke-evidence");
    expect(evidence).toHaveTextContent("质量门软门禁");
    expect(evidence).toHaveTextContent("smoke-1通过42 ms");
    expect(evidence).toHaveTextContent("索引减少全表扫描。");
  });
});

const requirement = {
  apiVersion: "skill-requirements.datasource/v1",
  constraints: ["不改变事实、数字或必要警告"], criticalAmbiguities: [], examples: [], goal: "缩短输出而不是修改事实",
  input: { description: "A user request" }, output: { description: "A useful answer" },
  status: "confirmed", successCriteria: ["回答显著更短且保留核心信息"],
  tools: { missingCapabilities: [], requiredCapabilities: [], selectedToolNames: ["search"] },
  trigger: {
    negativeExamples: ["长文、正式报告或高风险问题"],
    positiveExamples: ["解释、建议和步骤类问题"],
    whenToUse: "显式选择且未要求详细内容时使用",
  },
} satisfies RequirementSpecV1;

const blockedRequirement = {
  ...requirement,
  tools: { missingCapabilities: ["web-search"], requiredCapabilities: ["web-search"], selectedToolNames: [] },
} satisfies RequirementSpecV1;

const toolManifest = {
  access: { destructive: false, read: true, write: false },
  apiVersion: "tools.datasource/v1",
  availability: "public",
  description: "Search indexed information. Input: {\"query\":\"keyword\",\"limit\":10}. Use concise queries.",
  displayName: "Search",
  inputSchema: { properties: { limit: { type: "integer" }, query: { type: "string" } }, required: ["query"], type: "object" },
  name: "search",
  requiredPermissions: [],
  riskLevel: "low",
  sideEffects: [],
  supportedScenarios: ["daily"],
};
