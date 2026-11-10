import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { saveArtifact } from "./artifact-download";
import { SkillPublicationDetail } from "./skill-publication-detail";
import { SkillPublicationList } from "./skill-publication-list";

vi.mock("./artifact-download", () => ({
  saveArtifact: vi.fn(),
  sha256Blob: vi.fn(),
  verifyArtifactDownload: vi.fn(async (download) => download),
}));

let mockMode = "daily";
const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/manage/pub-1",
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(`mode=${mockMode}&scopeType=agent&scopeId=work`),
}));

const publication = {
  artifactKey: "demo-r1.zip", contentHash: "a".repeat(64), id: "pub-1",
  revision: 1, skillName: "demo-skill", status: "published" as const, submissionId: "sub-1",
};
const withdrawnPublication = {
  ...publication, id: "pub-2", skillName: "old-skill", status: "withdrawn" as const,
};
const catalog = {
  generatedAt: "2026-11-07T08:00:00.000Z", total: 1,
  items: [{ categoryLabel: "其他", categorySource: "inferred", conflict: null,
    description: "Demo", id: "demo-skill", installState: "installable", loadedScenarios: [],
    name: "demo-skill", publicationId: "pub-1", revision: 1, scopes: [], source: "market",
    title: "Demo", tools: [] }],
};

function queryResult(input: { operation: string }) {
  return Promise.resolve(input.operation === "listPublications" ? [publication] : catalog);
}

describe("Skill publication management", () => {
  beforeEach(() => { mockMode = "daily"; push.mockClear(); });

  it("keeps work mode disconnected from the daily publication backend", async () => {
    mockMode = "work";
    const query = vi.fn();
    render(<ModeProvider><SkillPublicationList client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);
    expect(screen.getByRole("heading", { name: "办公场景暂未接入" })).toBeInTheDocument();
    await waitFor(() => expect(query).not.toHaveBeenCalled());
  });

  it("styles the list page actions like the plaza and omits manual refresh", async () => {
    const query = vi.fn().mockResolvedValue([]);
    render(<ModeProvider><SkillPublicationList client={{ query } as unknown as SkillMarketClient} /></ModeProvider>);

    expect(await screen.findByRole("heading", { name: "发布管理" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "返回广场" })).toHaveClass("skill-page-action");
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
  });

  function listClient(overrides: Record<string, ReturnType<typeof vi.fn>> = {}): SkillMarketClient {
    return {
      query: vi.fn(async (input: { operation: string }) =>
        input.operation === "listPublications" ? [publication, withdrawnPublication] : catalog),
      mutate: vi.fn(),
      downloadPublication: vi.fn(),
      ...overrides,
    } as unknown as SkillMarketClient;
  }

  function rowOf(name: RegExp): HTMLElement {
    const heading = screen.getByRole("heading", { name });
    const row = heading.closest("article");
    if (!row) throw new Error(`row not found for ${name}`);
    return row as HTMLElement;
  }

  it("renders row actions by publication state", async () => {
    render(<ModeProvider><SkillPublicationList client={listClient()} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });

    const published = within(rowOf(/demo-skill/));
    for (const name of [/查看详情/, /下载制品/, /安装\/启用/, /停用/, /^下架$/]) {
      expect(published.getByRole("button", { name })).toBeInTheDocument();
    }

    const withdrawn = within(rowOf(/old-skill/));
    expect(withdrawn.getByRole("button", { name: /创建新修订/ })).toBeInTheDocument();
    expect(withdrawn.queryByRole("button", { name: /安装\/启用/ })).not.toBeInTheDocument();
    expect(withdrawn.queryByRole("button", { name: /停用/ })).not.toBeInTheDocument();
    expect(withdrawn.queryByRole("button", { name: /^下架$/ })).not.toBeInTheDocument();
  });

  it("expands and collapses publication details inline", async () => {
    render(<ModeProvider><SkillPublicationList client={listClient()} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });
    const row = rowOf(/demo-skill/);
    fireEvent.click(within(row).getByRole("button", { name: /查看详情/ }));

    expect(within(row).getByText("Publication ID")).toBeInTheDocument();
    expect(within(row).getByText(publication.id)).toBeInTheDocument();
    expect(within(row).getByText("SHA-256")).toBeInTheDocument();
    expect(within(row).getByText(publication.contentHash)).toBeInTheDocument();
    expect(within(row).getByText("Artifact Key")).toBeInTheDocument();
    expect(within(row).getByText(publication.artifactKey)).toBeInTheDocument();

    fireEvent.click(within(row).getByRole("button", { name: /查看详情/ }));
    expect(within(row).queryByText("Artifact Key")).not.toBeInTheDocument();
  });

  it("enables and disables the daily installation from the row", async () => {
    const mutate = vi.fn(async () => ({ ok: true, value: {
      id: "installation-1", publicationId: "pub-1", scopeId: "daily", scopeType: "scenario", status: "enabled",
    } }));
    const client = listClient({ mutate });
    render(<ModeProvider><SkillPublicationList client={client} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });
    const row = rowOf(/demo-skill/);

    fireEvent.click(within(row).getByRole("button", { name: /安装\/启用/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      body: { scopeId: "daily", scopeType: "scenario", status: "enabled" },
      operation: "setInstallationStatus",
      pathParameters: { id: "pub-1" },
    }), expect.anything()));
    expect(await screen.findByText(/已启用/)).toBeInTheDocument();

    fireEvent.click(within(rowOf(/demo-skill/)).getByRole("button", { name: /停用/ }));
    await waitFor(() => expect(mutate).toHaveBeenLastCalledWith(expect.objectContaining({
      body: { scopeId: "daily", scopeType: "scenario", status: "disabled" },
    }), expect.anything()));
  });

  it("withdraws only after confirmation and then refreshes", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const mutate = vi.fn(async () => ({ ok: true, value: { ...publication, status: "withdrawn" } }));
    const query = vi.fn(async (input: { operation: string }) =>
      input.operation === "listPublications" ? [publication, withdrawnPublication] : catalog);
    render(<ModeProvider><SkillPublicationList client={listClient({ mutate, query })} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });

    fireEvent.click(within(rowOf(/demo-skill/)).getByRole("button", { name: /^下架$/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      operation: "withdrawPublication", pathParameters: { id: "pub-1" },
    }), expect.anything()));
    await waitFor(() => expect(query.mock.calls.length).toBeGreaterThan(2));
    vi.restoreAllMocks();
  });

  it("does not withdraw when the confirmation is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const mutate = vi.fn();
    render(<ModeProvider><SkillPublicationList client={listClient({ mutate })} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });

    fireEvent.click(within(rowOf(/demo-skill/)).getByRole("button", { name: /^下架$/ }));
    expect(mutate).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("creates a new revision draft for withdrawn publications", async () => {
    const mutate = vi.fn(async () => ({ ok: true, value: { id: "draft-9", revision: 2 } }));
    render(<ModeProvider><SkillPublicationList client={listClient({ mutate })} /></ModeProvider>);
    await screen.findByRole("heading", { name: /old-skill/ });

    fireEvent.click(within(rowOf(/old-skill/)).getByRole("button", { name: /创建新修订/ }));
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      operation: "revisePublication", pathParameters: { id: "pub-2" },
    }), expect.anything()));
    expect(push).toHaveBeenCalledWith("/skills/drafts/draft-9?mode=daily&sourcePublication=pub-2&revision=2");
  });

  it("downloads the artifact with integrity verification before saving", async () => {
    const download = { blob: new Blob(["zip"]), fileName: "demo-skill-r1.zip", sha256: publication.contentHash };
    const downloadPublication = vi.fn(async () => download);
    render(<ModeProvider><SkillPublicationList client={listClient({ downloadPublication })} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });
    const row = rowOf(/demo-skill/);

    fireEvent.click(within(row).getByRole("button", { name: /下载制品/ }));
    await waitFor(() => expect(downloadPublication).toHaveBeenCalledWith({ id: "pub-1", mode: "daily" }));
    await waitFor(() => expect(vi.mocked(saveArtifact)).toHaveBeenCalledWith(download));
  });

  it("shows a persistent error with retry when a row action fails", async () => {
    const mutate = vi.fn(async () => ({ ok: false, error: new SkillMarketError({
      area: "publication", code: "skill.permission_denied", presentation: "permission",
      recovery: "back", retryable: false, status: 403, userMessage: "当前身份没有执行此操作的权限。",
    }) }));
    render(<ModeProvider><SkillPublicationList client={listClient({ mutate })} /></ModeProvider>);
    await screen.findByRole("heading", { name: /demo-skill/ });

    fireEvent.click(within(rowOf(/demo-skill/)).getByRole("button", { name: /安装\/启用/ }));
    expect(await screen.findByRole("heading", { name: "无权执行此操作" })).toBeInTheDocument();
  });

  it("does not allow URL parameters to expand the managed daily scope", async () => {
    const mutate = vi.fn().mockResolvedValue({ ok: true, value: {
      id: "installation-1", publicationId: "pub-1", scopeId: "daily", scopeType: "scenario", status: "enabled",
    } });
    const client = { mutate, query: vi.fn(queryResult) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillPublicationDetail client={client} id="pub-1" /></ModeProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "安装并启用" }));
    expect(screen.queryByRole("button", { name: "刷新" })).not.toBeInTheDocument();
    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      body: { scopeId: "daily", scopeType: "scenario", status: "enabled" },
    }), expect.anything()));
  });

  it("shows a clear permission denial with a return path", async () => {
    const permission = new SkillMarketError({
      area: "publication", code: "skill.permission_denied", presentation: "permission",
      recovery: "back", retryable: false, status: 403, userMessage: "当前身份没有执行此操作的权限。",
    });
    const client = { query: vi.fn().mockRejectedValue(permission) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillPublicationDetail client={client} id="pub-1" /></ModeProvider>);
    expect(await screen.findByRole("heading", { name: "无权执行此操作" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /返回发布管理/ })).toHaveAttribute("href", "/skills/manage?mode=daily");
  });
});
