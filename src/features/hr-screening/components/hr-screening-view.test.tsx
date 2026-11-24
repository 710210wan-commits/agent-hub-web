import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { AssistantClient } from "@/features/assistants/api/assistant-client";
import type { HrScreeningClient } from "../api/hr-screening-client";
import type { HrScreeningBatch, HrScreeningBatchItem } from "@/features/assistants/contracts/generated";
import { HrScreeningView } from "./hr-screening-view";

const conversationId = "10000000-0000-4000-8000-000000000001";
const batchId = "20000000-0000-4000-8000-000000000002";
const candidateId = "30000000-0000-4000-8000-000000000003";
const criterionId = "40000000-0000-4000-8000-000000000004";
const itemId = "50000000-0000-4000-8000-000000000005";
const jdId = "60000000-0000-4000-8000-000000000006";
const criteriaId = "70000000-0000-4000-8000-000000000007";

function state(overrides: Record<string, unknown> = {}) {
  return {
    conversationId,
    assistantId: "resume-screening" as const,
    assistantVersion: 1,
    retentionUntil: "2026-12-19T00:00:00.000Z",
    activeJobDescription: {
      jobDescriptionVersionId: jdId,
      version: 1,
      parseStatus: "parsed" as const,
      createdAt: "2026-11-19T00:00:00.000Z",
    },
    activeCriteria: {
      criteriaVersionId: criteriaId,
      conversationId,
      jobDescriptionVersionId: jdId,
      version: 1,
      status: "draft" as const,
      criteria: [{
        criterionId,
        kind: "required" as const,
        title: "TypeScript",
        instruction: "熟练使用 TypeScript",
        evidenceExpectation: "项目经历",
      }],
      createdAt: "2026-11-19T00:00:00.000Z",
      confirmedAt: null,
    },
    activeBatch: null,
    latestCompletedBatch: null,
    candidates: [{
      candidateId,
      displayName: "候选人甲",
      status: "active" as const,
      parseStatus: "parsed" as const,
      errorCode: null,
      createdAt: "2026-11-19T00:00:00.000Z",
      retiredAt: null,
    }],
    ...overrides,
  };
}

function batch(status: HrScreeningBatch["status"]): HrScreeningBatch {
  const completed = status === "completed";
  return {
    batchId,
    conversationId,
    assistantVersion: 1,
    jobDescriptionVersionId: jdId,
    criteriaVersionId: criteriaId,
    assessmentFingerprint: "a".repeat(64),
    status,
    totalCount: 1,
    completedCount: completed ? 1 : 0,
    failedCount: status === "partial" || status === "failed" ? 1 : 0,
    createdAt: "2026-11-19T00:00:00.000Z",
    startedAt: "2026-11-19T00:00:00.000Z",
    finishedAt: completed ? "2026-11-19T01:00:00.000Z" : null,
  };
}

function item(status: HrScreeningBatchItem["status"]): HrScreeningBatchItem {
  const completed = status === "completed";
  return {
    itemId,
    batchId,
    candidateId,
    status,
    attemptCount: completed || status === "failed" ? 1 : 0,
    advisoryTier: completed ? "recommended" : null,
    assessments: completed ? [{
      criterionId,
      decision: "meets",
      evidence: [{ blockId: "page-1:block-1", quote: "合成项目证据" }],
      missingInformation: [],
      followUpQuestions: ["请说明项目职责"],
    }] : [],
    errorCode: status === "failed" ? "PRIVATE_UPSTREAM_DETAIL" : null,
    startedAt: completed ? "2026-11-19T00:00:00.000Z" : null,
    finishedAt: completed || status === "failed" ? "2026-11-19T01:00:00.000Z" : null,
  };
}

function client(overrides: Partial<HrScreeningClient> = {}): HrScreeningClient {
  return {
    getState: vi.fn().mockImplementation(async () => state()),
    attachResumes: vi.fn().mockImplementation(async () => state()),
    replaceJobDescription: vi.fn().mockImplementation(async () => state()),
    updateCandidate: vi.fn().mockImplementation(async () => state()),
    generateCriteria: vi.fn().mockImplementation(async () => state()),
    updateCriteria: vi.fn().mockImplementation(async () => state()),
    confirmCriteria: vi.fn().mockImplementation(async () => state()),
    startBatch: vi.fn(),
    getBatch: vi.fn().mockResolvedValue({ batch: batch("completed"), items: [item("completed")] }),
    cancelBatch: vi.fn().mockResolvedValue({ batch: batch("cancelled"), items: [item("cancelled")] }),
    continueBatch: vi.fn(),
    retryItem: vi.fn().mockResolvedValue({ batch: batch("running"), items: [item("running")] }),
    exportBatchCsv: vi.fn().mockResolvedValue({ fileName: "screening.csv", content: "candidateId\nsynthetic\n" }),
    ...overrides,
  };
}

function uploadClient(): AssistantClient {
  return {
    listAssistants: vi.fn(),
    getAssistant: vi.fn(),
    createUploadDraft: vi.fn().mockResolvedValue({ reused: false, draft: { draftId: "80000000-0000-4000-8000-000000000008" } }),
    uploadDraftFile: vi.fn().mockResolvedValue({ fileId: "90000000-0000-4000-8000-000000000009" }),
    removeDraftFile: vi.fn(),
    createAssistantConversation: vi.fn(),
  };
}

describe("HrScreeningView", () => {
  it("loads authoritative state and preserves a criteria edit when saving fails", async () => {
    const api = client();
    vi.mocked(api.updateCriteria).mockRejectedValue(new Error("private upstream detail"));
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);

    const title = await screen.findByRole("textbox", { name: "标准标题" });
    fireEvent.change(title, { target: { value: "高级 TypeScript" } });
    fireEvent.click(screen.getByRole("button", { name: "保存标准" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("保存失败，请稍后重试");
    expect(title).toHaveValue("高级 TypeScript");
    expect(screen.queryByText("private upstream detail")).not.toBeInTheDocument();
  });

  it("refreshes from HTTP after progress and confirms through REST before starting a canonical Turn", async () => {
    const api = client();
    const canonical = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <HrScreeningView
        client={api}
        conversationId={conversationId}
        onCanonicalAction={canonical}
        progress={{ batchId, phase: "running", completedCount: 3, failedCount: 1, totalCount: 20 }}
        refreshToken={0}
      />,
    );
    await screen.findByText("候选人甲");
    expect(screen.getByText("3/20")).toBeInTheDocument();
    expect(screen.getByText("失败 1")).toBeInTheDocument();
    view.rerender(
      <HrScreeningView
        client={api}
        conversationId={conversationId}
        onCanonicalAction={canonical}
        progress={{ batchId, phase: "running", completedCount: 3, failedCount: 1, totalCount: 20 }}
        refreshToken={1}
      />,
    );
    await waitFor(() => expect(api.getState).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole("button", { name: "确认并开始筛选" }));
    await waitFor(() => expect(api.confirmCriteria).toHaveBeenCalledWith(conversationId, 1, expect.any(String)));
    expect(canonical).toHaveBeenCalledWith("确认筛选标准并开始筛选");
    expect(api.startBatch).not.toHaveBeenCalled();
  });

  it("replaces JD and manages candidates through deterministic actions without starting a batch", async () => {
    const api = client();
    const uploads = uploadClient();
    render(
      <HrScreeningView
        client={api}
        uploadClient={uploads}
        conversationId={conversationId}
        onCanonicalAction={vi.fn()}
        refreshToken={0}
      />,
    );
    const jd = await screen.findByRole("textbox", { name: "岗位描述" });
    fireEvent.change(jd, { target: { value: "新的合成岗位描述" } });
    fireEvent.click(screen.getByRole("button", { name: "替换岗位描述" }));
    await waitFor(() => expect(api.replaceJobDescription).toHaveBeenCalled());
    expect(api.replaceJobDescription).toHaveBeenCalledWith(conversationId, expect.objectContaining({ kind: "text", text: "新的合成岗位描述", clientRequestId: expect.any(String) }));

    fireEvent.click(screen.getByRole("button", { name: "重命名候选人" }));
    const name = screen.getByRole("textbox", { name: "候选人显示名称" });
    fireEvent.change(name, { target: { value: "新显示名称" } });
    fireEvent.click(screen.getByRole("button", { name: "保存候选人名称" }));
    await waitFor(() => expect(api.updateCandidate).toHaveBeenCalledWith(conversationId, candidateId, expect.objectContaining({ action: "rename", displayName: "新显示名称" })));
    fireEvent.click(screen.getByRole("button", { name: "退役候选人" }));
    await waitFor(() => expect(api.updateCandidate).toHaveBeenCalledWith(conversationId, candidateId, expect.objectContaining({ action: "retire" })));

    fireEvent.change(screen.getByLabelText("添加简历"), {
      target: { files: [new File(["synthetic"], "candidate-b.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByText("candidate-b.pdf")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "上传并绑定 1 份简历" }));
    await waitFor(() => expect(api.attachResumes).toHaveBeenCalledWith(conversationId, "80000000-0000-4000-8000-000000000008", expect.any(String)));
    expect(uploads.createUploadDraft).toHaveBeenCalledWith("resume-screening", expect.any(String));
    expect(uploads.uploadDraftFile).toHaveBeenCalledWith(
      "80000000-0000-4000-8000-000000000008",
      "resume",
      expect.any(File),
    );
    expect(api.startBatch).not.toHaveBeenCalled();
  });

  it("supports reactivation and does not mutate an old batch while inputs change", async () => {
    const retired = state({
      latestCompletedBatch: batch("completed"),
      candidates: [{
        candidateId,
        displayName: "已退役候选人",
        status: "retired",
        parseStatus: "parsed",
        errorCode: null,
        createdAt: "2026-11-19T00:00:00.000Z",
        retiredAt: "2026-11-20T00:00:00.000Z",
      }],
    });
    const api = client({ getState: vi.fn().mockResolvedValue(retired) });
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "重新激活候选人" }));
    await waitFor(() => expect(api.updateCandidate).toHaveBeenCalledWith(conversationId, candidateId, expect.objectContaining({ action: "reactivate" })));
    expect(api.startBatch).not.toHaveBeenCalled();
    expect(api.continueBatch).not.toHaveBeenCalled();
  });

  it("opens the authorized result drawer, shows validated evidence and exports CSV", async () => {
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const api = client({ getState: vi.fn().mockResolvedValue(state({ latestCompletedBatch: batch("completed") })) });
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看完整结果" }));

    expect(await screen.findByText("推荐进入下一轮")).toBeInTheDocument();
    expect(screen.getByText("合成项目证据")).toBeInTheDocument();
    expect(screen.getByText("请说明项目职责")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出 CSV" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "导出 CSV" }));
    await waitFor(() => expect(api.exportBatchCsv).toHaveBeenCalledWith(batchId));
    expect(anchorClick).toHaveBeenCalled();
    anchorClick.mockRestore();
  });

  it("reads confirmed criteria as text and labels candidate parsing in Chinese", async () => {
    const api = client({
      getState: vi.fn().mockResolvedValue(state({ activeCriteria: { ...state().activeCriteria, status: "confirmed" } })),
    });
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);
    const criteria = await screen.findByRole("region", { name: "筛选标准" });
    expect(within(criteria).getByText("熟练使用 TypeScript")).toBeVisible();
    expect(within(criteria).queryByRole("textbox")).not.toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "候选人文件" })).getByText("已解析")).toBeVisible();
  });

  it("shows the saved assessment rather than current criteria on an older batch", async () => {
    const olderBatch = { ...batch("completed"), criteriaVersionId: "99999999-9999-4999-8999-999999999999" };
    const api = client({
      getState: vi.fn().mockResolvedValue(state({ latestCompletedBatch: olderBatch })),
      getBatch: vi.fn().mockResolvedValue({ batch: olderBatch, items: [item("completed")] }),
    });
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看完整结果" }));

    const drawer = await screen.findByRole("dialog", { name: "筛选结果" });
    expect(await within(drawer).findByRole("heading", { name: "历史评估项 1" })).toBeInTheDocument();
    expect(within(drawer).getByText("满足")).toBeInTheDocument();
    expect(within(drawer).getByText("合成项目证据")).toBeInTheDocument();
    expect(within(drawer).queryByRole("heading", { name: "TypeScript" })).not.toBeInTheDocument();
    expect(within(drawer).queryByText("证据不足")).not.toBeInTheDocument();
  });

  it("cancels through REST, continues through a canonical Turn and retries only the selected failed item", async () => {
    const api = client({
      getState: vi.fn().mockResolvedValue(state({ activeBatch: batch("partial") })),
      getBatch: vi.fn().mockResolvedValue({ batch: batch("running"), items: [item("failed")] }),
    });
    const canonical = vi.fn().mockResolvedValue(undefined);
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={canonical} refreshToken={0} />);
    fireEvent.click(await screen.findByRole("button", { name: "查看完整结果" }));
    fireEvent.click(await screen.findByRole("button", { name: "重试该候选人" }));
    await waitFor(() => expect(api.retryItem).toHaveBeenCalledWith(batchId, itemId, expect.any(String)));
    expect(screen.queryByText("PRIVATE_UPSTREAM_DETAIL")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "取消筛选批次" }));
    await waitFor(() => expect(api.cancelBatch).toHaveBeenCalledWith(batchId, expect.any(String)));
    fireEvent.click(screen.getByRole("button", { name: "继续未完成筛选" }));
    await waitFor(() => expect(canonical).toHaveBeenCalledWith("继续未完成的简历筛选批次"));
    expect(api.continueBatch).not.toHaveBeenCalled();
  });

  it("validates deep-link IDs before reading a batch or candidate result", async () => {
    const api = client();
    const view = render(
      <HrScreeningView
        client={api}
        conversationId={conversationId}
        onCanonicalAction={vi.fn()}
        refreshToken={0}
        selectedBatchId="not-a-uuid"
        selectedCandidateId={candidateId}
      />,
    );
    expect(await screen.findByText("筛选结果链接无效")).toBeInTheDocument();
    expect(api.getBatch).not.toHaveBeenCalled();

    view.rerender(
      <HrScreeningView
        client={api}
        conversationId={conversationId}
        onCanonicalAction={vi.fn()}
        refreshToken={0}
        selectedBatchId={batchId}
        selectedCandidateId="not-a-uuid"
      />,
    );
    expect(await screen.findByText("筛选结果链接无效")).toBeInTheDocument();
    expect(api.getBatch).not.toHaveBeenCalled();
  });

  it("uses global logout for 401 and a bounded local error for 403", async () => {
    const unauthorized = client();
    const onAuthRequired = vi.fn();
    vi.mocked(unauthorized.getState).mockRejectedValue(Object.assign(new Error("private"), { status: 401 }));
    const view = render(
      <HrScreeningView client={unauthorized} conversationId={conversationId} onCanonicalAction={vi.fn()} onAuthRequired={onAuthRequired} refreshToken={0} />,
    );
    await waitFor(() => expect(onAuthRequired).toHaveBeenCalledOnce());
    view.unmount();

    const actionClient = client();
    const actionAuth = vi.fn();
    vi.mocked(actionClient.updateCandidate).mockRejectedValue(Object.assign(new Error("private"), { status: 401 }));
    const actionView = render(
      <HrScreeningView client={actionClient} conversationId={conversationId} onCanonicalAction={vi.fn()} onAuthRequired={actionAuth} refreshToken={0} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "退役候选人" }));
    await waitFor(() => expect(actionAuth).toHaveBeenCalledOnce());
    actionView.unmount();

    const forbidden = client();
    vi.mocked(forbidden.getState).mockRejectedValue(Object.assign(new Error("private upstream detail"), { status: 403 }));
    render(<HrScreeningView client={forbidden} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("筛选资料加载失败，请稍后重试");
    expect(screen.queryByText("private upstream detail")).not.toBeInTheDocument();
  });

  it("shows an unavailable tombstone after retention expiry", async () => {
    const api = client();
    vi.mocked(api.getState).mockRejectedValue(Object.assign(new Error("gone"), { status: 404 }));
    render(<HrScreeningView client={api} conversationId={conversationId} onCanonicalAction={vi.fn()} refreshToken={0} />);

    expect(await screen.findByText("筛选资料已过期或不可用")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认并开始筛选" })).not.toBeInTheDocument();
  });
});
