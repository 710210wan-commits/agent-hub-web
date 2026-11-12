import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ModeProvider } from "@/providers/mode-provider";

import type { SkillMarketClient } from "../api/client";
import { SkillMarketError } from "../contracts/error";
import { SkillDraftEditor } from "./skill-draft-editor";

vi.mock("next/navigation", () => ({
  usePathname: () => "/skills/drafts/draft-1",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=daily"),
}));

const draft = {
  authorId: "author-1",
  editable: true,
  fileCount: 1,
  files: { "SKILL.md": "# Demo" },
  id: "draft-1",
  metadata: { title: "Demo" },
  name: "demo-skill",
  revision: 4,
  status: "editing" as const,
};

describe("SkillDraftEditor", () => {
  it("saves with the loaded revision and keeps local edits after a conflict", async () => {
    const mutate = vi.fn().mockResolvedValue({
      error: new SkillMarketError({
        area: "draft", code: "skill.lifecycle_conflict", presentation: "conflict",
        recovery: "refresh", retryable: false, status: 409, userMessage: "conflict",
      }),
      ok: false,
    });
    const client = { mutate, query: vi.fn().mockResolvedValue(draft) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillDraftEditor client={client} id="draft-1" /></ModeProvider>);

    const metadata = await screen.findByLabelText("元数据 JSON");
    fireEvent.change(metadata, { target: { value: '{"title":"Local"}' } });
    fireEvent.click(screen.getByRole("button", { name: "保存修改" }));

    await screen.findByRole("alert");
    expect(metadata).toHaveValue('{"title":"Local"}');
    expect(mutate).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.objectContaining({ expectedRevision: 4, metadata: { title: "Local" } }),
      operation: "updateDraft",
    }), expect.anything());
  });

  it("allows only one submit mutation while the request is pending", async () => {
    let resolveMutation!: (value: unknown) => void;
    const mutate = vi.fn(() => new Promise((resolve) => { resolveMutation = resolve; }));
    const client = { mutate, query: vi.fn().mockResolvedValue(draft) } as unknown as SkillMarketClient;
    render(<ModeProvider><SkillDraftEditor client={client} id="draft-1" /></ModeProvider>);
    await screen.findByText("demo-skill");

    const submit = screen.getByRole("button", { name: "提交审核" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mutate).toHaveBeenCalledTimes(1);
    resolveMutation({ ok: true, value: { id: "submission-1", revision: 4, status: "pending_review" } });
    await waitFor(() => expect(screen.getByText(/submission-1/)).toBeInTheDocument());
  });
});
