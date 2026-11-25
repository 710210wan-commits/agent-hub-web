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
    state={state} busy={false} conversationId={conversationId} refresh={vi.fn()} onScreen={onScreen}
  />);
  fireEvent.click(screen.getByRole("button", { name: "简历筛选操作" }));
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
    state={state} busy={false} conversationId={conversationId} refresh={vi.fn()} onScreen={onScreen} />);
  fireEvent.click(screen.getByRole("button", { name: "简历筛选操作" }));
  fireEvent.click(screen.getByRole("button", { name: "更改 JD" }));
  fireEvent.change(screen.getByRole("textbox", { name: "新岗位描述" }), { target: { value: "合成 JD" } });
  fireEvent.click(screen.getByRole("button", { name: "保存岗位描述" }));
  await waitFor(() => expect(replaceJobDescription).toHaveBeenCalledWith(conversationId,
    expect.objectContaining({ kind: "text", text: "合成 JD" }), expect.any(AbortSignal)));
  expect(onScreen).not.toHaveBeenCalled();
});
