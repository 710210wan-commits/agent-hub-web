import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/providers/auth-provider";

import { AssistantClientError, type AssistantClient } from "../api/assistant-client";
import { ResumeScreeningSetupForm } from "./setup-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const assistant = {
  id: "resume-screening",
  version: 1,
  name: "简历筛选助手",
  summary: "根据岗位标准辅助筛选电子简历",
  icon: "file-search",
  tags: ["HR"],
  status: "published" as const,
  runtime: "dsi-native" as const,
  requiredSkills: ["resume-screening"],
  allowedOptionalCapabilities: [],
  setupProfile: "resume-screening-v1",
  resultRenderer: "resume-screening-v1",
  modelPolicy: "hr-screening-default",
  retentionDays: 30,
};
const ids = [
  "10000000-0000-4000-8000-000000000001",
  "20000000-0000-4000-8000-000000000002",
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
];

function file(name: string, type: string, size = 5): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeClient(overrides: Partial<AssistantClient> = {}): AssistantClient {
  return {
    listAssistants: vi.fn(),
    getAssistant: vi.fn(),
    createUploadDraft: vi.fn().mockResolvedValue({
      reused: false,
      draft: { draftId: ids[0], assistantId: assistant.id, status: "open", expiresAt: "2026-11-24T00:00:00.000Z" },
    }),
    uploadDraftFile: vi.fn().mockImplementation(async (_draftId, role, item: File) => ({
      fileId: crypto.randomUUID(), role, name: item.name, contentType: item.type, sizeBytes: item.size,
    })),
    removeDraftFile: vi.fn().mockResolvedValue(undefined),
    createAssistantConversation: vi.fn().mockResolvedValue({
      conversationId: ids[1],
      reused: false,
    }),
    ...overrides,
  };
}

const authClient = {
  getAuthStatus: vi.fn().mockResolvedValue({ enabled: true, user: { id: "u1", displayName: "管理员" } }),
  login: vi.fn(),
  loginDemo: vi.fn(),
  logout: vi.fn(),
};

function AuthenticatedForm({ children }: { children: ReactNode }) {
  return useAuth().status === "authenticated" ? children : null;
}

function renderForm(client: AssistantClient, onCreated = vi.fn(), onCancel = vi.fn()) {
  let index = 0;
  return {
    onCreated,
    onCancel,
    ...render(
      <AuthProvider client={authClient}>
        <AuthenticatedForm>
          <ResumeScreeningSetupForm
            assistant={assistant}
            client={client}
            createRequestId={() => ids[index++] ?? crypto.randomUUID()}
            onCancel={onCancel}
            onCreated={onCreated}
          />
        </AuthenticatedForm>
      </AuthProvider>,
    ),
  };
}

async function selectValidFiles() {
  await waitFor(() => expect(screen.getByLabelText("上传岗位描述")).toBeEnabled());
  fireEvent.change(screen.getByLabelText("上传岗位描述"), {
    target: { files: [file("jd.pdf", "application/pdf")] },
  });
  fireEvent.change(screen.getByLabelText("上传候选人简历"), {
    target: { files: [file("a.pdf", "application/pdf"), file("b.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")] },
  });
  await screen.findByText("已就绪 3/3");
}

describe("ResumeScreeningSetupForm", () => {
  beforeEach(() => authClient.getAuthStatus.mockClear());

  it("does not create a conversation on open or cancel", async () => {
    const client = makeClient();
    const { onCancel } = renderForm(client);
    await waitFor(() => expect(client.createUploadDraft).toHaveBeenCalledOnce());

    expect(client.createAssistantConversation).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "取消" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(client.createAssistantConversation).not.toHaveBeenCalled();
  });

  it("uploads one JD and up to 20 resumes, then navigates only from the authoritative response", async () => {
    const client = makeClient();
    const { onCreated } = renderForm(client);
    await selectValidFiles();

    fireEvent.click(screen.getByRole("button", { name: "开始筛选" }));
    await waitFor(() => expect(client.createAssistantConversation).toHaveBeenCalledOnce());
    expect(onCreated).toHaveBeenCalledWith(ids[1]);
  });

  it("screens from a pasted JD and locks the submitted text and files for a safe retry", async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error("unknown result"))
      .mockResolvedValue({ conversationId: ids[1], reused: true });
    const client = makeClient({ createAssistantConversation: submit });
    const { onCreated } = renderForm(client);
    await waitFor(() => expect(screen.getByLabelText("上传候选人简历")).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "粘贴文本" }));
    const jd = screen.getByRole("textbox", { name: "岗位描述文本" });
    fireEvent.change(jd, { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("上传候选人简历"), {
      target: { files: [file("a.pdf", "application/pdf")] },
    });
    await screen.findByText("已就绪 1/1");
    const start = screen.getByRole("button", { name: "开始筛选" });
    expect(start).toBeDisabled();
    fireEvent.change(jd, { target: { value: "  岗位职责\n使用 TypeScript  " } });
    fireEvent.click(start);
    await screen.findByText("结果未知，可安全重试");
    expect(jd).toBeDisabled();
    expect(screen.getByLabelText("上传候选人简历")).toBeDisabled();
    expect(screen.getByRole("button", { name: "移除 a.pdf" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试创建会话" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(ids[1]));
    expect(submit.mock.calls[0]?.[1]).toEqual({
      draftId: ids[0], clientRequestId: expect.any(String), jobDescriptionText: "岗位职责\n使用 TypeScript",
    });
    expect(submit.mock.calls[1]?.[1]).toEqual(submit.mock.calls[0]?.[1]);
    expect(client.uploadDraftFile).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized batch before upload", async () => {
    const client = makeClient();
    renderForm(client);
    await waitFor(() => expect(screen.getByLabelText("上传候选人简历")).toBeEnabled());
    const files = Array.from({ length: 21 }, (_, index) => file(`${index}.pdf`, "application/pdf"));

    fireEvent.change(screen.getByLabelText("上传候选人简历"), { target: { files } });

    expect(await screen.findByRole("alert")).toHaveTextContent("最多上传 20 份简历");
    expect(client.uploadDraftFile).not.toHaveBeenCalled();
  });

  it("supports failed-file retry and server-backed removal", async () => {
    const upload = vi.fn()
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValue({ fileId: ids[2], role: "resume", name: "retry.pdf", contentType: "application/pdf", sizeBytes: 5 });
    const client = makeClient({ uploadDraftFile: upload });
    renderForm(client);
    await waitFor(() => expect(screen.getByLabelText("上传候选人简历")).toBeEnabled());

    fireEvent.change(screen.getByLabelText("上传候选人简历"), {
      target: { files: [file("retry.pdf", "application/pdf")] },
    });
    fireEvent.click(await screen.findByRole("button", { name: "重试 retry.pdf" }));
    await screen.findByText("已就绪 1/1");
    fireEvent.click(screen.getByRole("button", { name: "移除 retry.pdf" }));

    await waitFor(() => expect(client.removeDraftFile).toHaveBeenCalledWith(ids[0], ids[2], expect.anything()));
    expect(screen.queryByText("retry.pdf")).not.toBeInTheDocument();
  });

  it("reuses the submit request id after an unknown result", async () => {
    const submit = vi.fn()
      .mockRejectedValueOnce(new Error("unknown result"))
      .mockResolvedValue({ conversationId: ids[1], reused: true });
    const client = makeClient({ createAssistantConversation: submit });
    renderForm(client);
    await selectValidFiles();

    fireEvent.click(screen.getByRole("button", { name: "开始筛选" }));
    await screen.findByText("结果未知，可安全重试");
    fireEvent.click(screen.getByRole("button", { name: "重试创建会话" }));

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[1]?.[1]).toEqual(submit.mock.calls[0]?.[1]);
  });

  it("keeps 403 local instead of invalidating the global identity", async () => {
    const client = makeClient({
      createUploadDraft: vi.fn().mockRejectedValue(new AssistantClientError(403, "ORIGIN_REJECTED", "权限不足")),
    });
    renderForm(client);

    expect(await screen.findByRole("alert")).toHaveTextContent("权限不足");
    expect(screen.getByRole("button", { name: "重试准备上传" })).toBeInTheDocument();
  });
});
