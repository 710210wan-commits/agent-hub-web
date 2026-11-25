import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { HrComposerActions } from "./hr-composer-actions";
import type { HrConversationState } from "@/features/assistants/contracts/generated";
import type { AssistantClient } from "@/features/assistants/api/assistant-client";
import type { HrScreeningClient } from "../api/hr-screening-client";

const conversationId = "50000000-0000-4000-8000-000000000005";
const versionId = "60000000-0000-4000-8000-000000000006";
const timestamp = "2026-11-25T00:00:00.000Z";
const state: HrConversationState = {
  assistantId: "resume-screening", assistantVersion: 1, conversationId,
  retentionUntil: timestamp, activeCriteria: null, activeBatch: null, latestCompletedBatch: null,
  activeJobDescription: { jobDescriptionVersionId: versionId, version: 1, parseStatus: "parsed", createdAt: timestamp },
  candidates: [],
};

it("uploads from the composer and retries a lost attach receipt without re-uploading", async () => {
  const attachResumes = vi.fn().mockRejectedValueOnce(new Error("Network failure")).mockResolvedValue(state);
  const createUploadDraft = vi.fn().mockResolvedValue({ draft: { draftId: "draft-id" } });
  const uploadDraftFile = vi.fn().mockResolvedValue({});
  const onScreen = vi.fn().mockResolvedValue(undefined);
  render(<HrComposerActions
    client={{ attachResumes } as unknown as HrScreeningClient}
    uploadClient={{ createUploadDraft, uploadDraftFile } as unknown as AssistantClient}
    state={state} busy={false} sendButton={null} conversationId={conversationId} refresh={vi.fn()} onScreen={onScreen}
  />);
  fireEvent.change(screen.getByLabelText("添加简历"), {
    target: { files: [new File(["synthetic"], "候选人.pdf", { type: "application/pdf" })] },
  });
  expect(screen.getByText("候选人.pdf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "筛选新简历" }));
  await screen.findByRole("alert");
  expect(onScreen).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "筛选新简历" }));
  await waitFor(() => expect(onScreen).toHaveBeenCalledWith({ scope: "incremental", jobDescriptionVersionId: versionId }));
  expect(uploadDraftFile).toHaveBeenCalledTimes(1);
  expect(createUploadDraft).toHaveBeenCalledTimes(1);
  expect(attachResumes.mock.calls[0].slice(0, 3)).toEqual(attachResumes.mock.calls[1].slice(0, 3));
});
it("saves a new JD from the composer without silently starting a rescreen", async () => {
  const replaceJobDescription = vi.fn().mockResolvedValue(state);
  const onScreen = vi.fn();
  render(<HrComposerActions client={{ replaceJobDescription } as unknown as HrScreeningClient}
    state={state} busy={false} sendButton={null} conversationId={conversationId} refresh={vi.fn()} onScreen={onScreen} />);
  fireEvent.click(screen.getByRole("button", { name: "更改 JD" }));
  fireEvent.change(screen.getByRole("textbox", { name: "新岗位描述" }), { target: { value: "合成 JD" } });
  fireEvent.click(screen.getByRole("button", { name: "保存岗位描述" }));
  await waitFor(() => expect(replaceJobDescription).toHaveBeenCalledWith(conversationId,
    expect.objectContaining({ kind: "text", text: "合成 JD" }), expect.any(AbortSignal)));
  expect(onScreen).not.toHaveBeenCalled();
});

it("uses the same file and draft when retrying replacement of a JD", async () => {
  const replaceJobDescription = vi.fn().mockRejectedValueOnce(new Error("Lost response")).mockResolvedValue(state);
  const createUploadDraft = vi.fn().mockResolvedValue({ draft: { draftId: "jd-draft" } });
  const uploadDraftFile = vi.fn().mockResolvedValue({});
  render(<HrComposerActions client={{ replaceJobDescription } as unknown as HrScreeningClient}
    uploadClient={{ createUploadDraft, uploadDraftFile } as unknown as AssistantClient}
    state={state} busy={false} sendButton={null} conversationId={conversationId} refresh={vi.fn()} onScreen={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: "更改 JD" }));
  const file = new File(["synthetic JD"], "jd.pdf", { type: "application/pdf" });
  const input = screen.getByLabelText("上传新岗位描述");
  fireEvent.change(input, { target: { files: [file] } });
  expect(screen.getByText("jd.pdf")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "保存岗位描述" }));
  await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "保存岗位描述" }));
  await waitFor(() => expect(replaceJobDescription).toHaveBeenCalledTimes(2));
  expect(replaceJobDescription.mock.calls[0][1]).toEqual(replaceJobDescription.mock.calls[1][1]);
  expect(replaceJobDescription.mock.calls[0][1]).toMatchObject({ kind: "file", draftId: "jd-draft" });
  expect(uploadDraftFile).toHaveBeenCalledTimes(1);
});

it("keeps the screening button in place while the roster or JD is empty", () => {
  const client = {} as HrScreeningClient;
  const onScreen = vi.fn();
  render(<HrComposerActions client={client} state={{ ...state, activeJobDescription: null }}
    busy={false} sendButton={null} conversationId={conversationId} refresh={vi.fn()} onScreen={onScreen} />);
  expect(screen.getByText("活跃简历 0 份")).toBeVisible();
  expect(screen.getByText("JD 0 份")).toBeVisible();
  const screenNew = screen.getByRole("button", { name: "筛选新简历" });
  expect(screenNew).toBeVisible();
  expect(screenNew).toBeDisabled();
});
