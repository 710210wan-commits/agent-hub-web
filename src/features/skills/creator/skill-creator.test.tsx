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

    expect(screen.getByRole("link", { name: /返回 Skill 广场/ })).toHaveAttribute("href", "/skills?mode=daily");
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/skills/creator?mode=daily&draftId=draft-1"));
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

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/skills/creator?mode=daily&draftId=draft-1"));
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
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
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
    const query = vi.fn(async () => ({ items: [{ diagnostics: [], manifest: toolManifest }] }));
    const client = { mutate, query } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillCreator client={client} /></ModeProvider>);

    fireEvent.change(screen.getByLabelText("名称"), { target: { value: "demo-skill" } });
    fireEvent.change(screen.getByLabelText("标题"), { target: { value: "Demo" } });
    fireEvent.change(screen.getByLabelText("需求描述"), { target: { value: "Build a useful demo skill" } });
    fireEvent.click(screen.getByRole("button", { name: "分析需求" }));
    await screen.findByRole("button", { name: "确认 Spec 并推荐工具" });

    fireEvent.click(screen.getByRole("button", { name: "确认 Spec 并推荐工具" }));
    await screen.findByText("search：Matches the requirement");
    expect(operations.slice(-2)).toEqual(["confirmRequirement", "recommendToolResolution"]);

    fireEvent.click(screen.getByRole("button", { name: "确认工具并生成 Bundle" }));
    await screen.findByText("1 个文件，0 条 diagnostics。");
    expect(operations.slice(-2)).toEqual(["confirmToolResolution", "generateSkillBundle"]);

    expect(screen.getByText("Smoke 尚未运行；这是 Soft Gate，不阻止保存，也不会阻止之后从作者工作台提交审核。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));
    await screen.findByText(/草稿 draft-1 已保存/);
    expect(screen.queryByRole("button", { name: "提交审核" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "前往作者工作台提交审核" })).toHaveAttribute(
      "href",
      "/skills/mine?mode=daily",
    );
    expect(operations).not.toContain("runSmokeCases");
  });
});

const requirement = {
  apiVersion: "skill-requirements.datasource/v1",
  constraints: [], criticalAmbiguities: [], examples: [], goal: "Create a demo skill",
  input: { description: "A user request" }, output: { description: "A useful answer" },
  status: "confirmed", successCriteria: ["Works"],
  tools: { missingCapabilities: [], requiredCapabilities: [], selectedToolNames: ["search"] },
  trigger: { negativeExamples: ["no"], positiveExamples: ["yes"], whenToUse: "For demos" },
} satisfies RequirementSpecV1;

const toolManifest = {
  access: { destructive: false, read: true, write: false },
  apiVersion: "tools.datasource/v1",
  availability: "public",
  description: "Search indexed information",
  displayName: "Search",
  inputSchema: {},
  name: "search",
  requiredPermissions: [],
  riskLevel: "low",
  sideEffects: [],
  supportedScenarios: ["daily"],
};
