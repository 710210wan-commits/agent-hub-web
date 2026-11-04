import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ChatStreamEvent } from "@/features/chat/contracts/events";
import type { ChatTransport } from "@/features/chat/contracts/transport";
import { AuthProvider } from "@/providers/auth-provider";
import { ModeProvider } from "@/providers/mode-provider";

import { ChatPage } from "./chat-page";
import { MessageContent } from "./message-content";

vi.mock("next/navigation", () => ({
  usePathname: () => "/chat",
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams("mode=daily"),
}));

function makeTransport(
  kind: "mock" | "projects-new",
  events: ChatStreamEvent[],
): ChatTransport & { createRun: ReturnType<typeof vi.fn> } {
  const createRun = vi.fn(async () => ({ runId: `${kind}-run` }));
  return {
    kind,
    capabilities: {
      selections: kind === "mock",
      answerDeltas: kind === "mock",
      resume: kind === "mock",
    },
    createRun,
    streamRun: async function* () {
      for (const event of events) yield event;
    },
    abortRun: vi.fn(async () => undefined),
  };
}

function renderChat(transport: ChatTransport) {
  return render(
    <AuthProvider>
      <ModeProvider>
        <ChatPage transport={transport} />
      </ModeProvider>
    </AuthProvider>,
  );
}

function submit(text = "分析本周风险") {
  fireEvent.change(screen.getByRole("textbox", { name: "消息" }), {
    target: { value: text },
  });
  fireEvent.click(screen.getByRole("button", { name: "发送" }));
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("ChatPage", () => {
  it("renders a minimal daily empty state with three prompts", () => {
    renderChat(makeTransport("mock", []));

    expect(screen.getByRole("heading", { name: "今天想聊些什么？" })).toBeInTheDocument();
    expect(screen.getAllByTestId("example-prompt")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "附件（待接入）" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^知识库/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Skill/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^MCP/ })).toBeInTheDocument();
    expect(screen.queryByText(/能力介绍/)).not.toBeInTheDocument();
  });

  it("blocks real submission when a capability is selected", async () => {
    const transport = makeTransport("projects-new", []);
    renderChat(transport);

    fireEvent.click(screen.getByRole("button", { name: /^知识库/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "项目资料库" }));
    submit();

    expect(await screen.findByText("当前后端尚未接入所选能力")).toBeInTheDocument();
    expect(transport.createRun).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", { name: "消息" })).toHaveValue("分析本周风险");
  });

  it("does not submit while a Chinese IME composition is being confirmed", () => {
    const transport = makeTransport("mock", []);
    renderChat(transport);
    const input = screen.getByRole("textbox", { name: "消息" });
    fireEvent.change(input, { target: { value: "中文输入" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 229, isComposing: true });

    expect(transport.createRun).not.toHaveBeenCalled();
    expect(input).toHaveValue("中文输入");
  });

  it("streams final Markdown and collapses completed activity steps", async () => {
    const transport = makeTransport("mock", [
      { type: "run.connected", runId: "mock-run" },
      {
        type: "activity.update",
        label: "正在读取项目资料",
        completedStepCount: 3,
      },
      { type: "answer.delta", delta: "**主要风险**" },
      { type: "answer.done" },
    ]);
    renderChat(transport);
    submit();

    expect(await screen.findByText("主要风险")).toBeInTheDocument();
    expect(screen.getByText("已完成 3 个步骤")).toBeInTheDocument();
    expect(screen.queryByText("正在读取项目资料")).not.toBeInTheDocument();
  });

  it("replaces activity text instead of stacking internal steps", async () => {
    renderChat(
      makeTransport("mock", [
        { type: "activity.update", label: "正在读取知识库" },
        { type: "activity.update", label: "正在调用天气查询" },
      ]),
    );
    submit();

    expect(await screen.findByText("正在调用天气查询")).toBeInTheDocument();
    expect(screen.queryByText("正在读取知识库")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("activity-line")).toHaveLength(1);
  });

  it("shows one current activity before replacing it with the final answer", async () => {
    const releaseToolActivity = deferred();
    const releaseFinalAnswer = deferred();
    const transport: ChatTransport = {
      kind: "projects-new",
      capabilities: { selections: false, answerDeltas: false, resume: false },
      createRun: vi.fn(async () => ({ runId: "task-controlled" })),
      streamRun: async function* () {
        yield { type: "activity.update", label: "正在处理请求" } as const;
        await releaseToolActivity.promise;
        yield { type: "activity.update", label: "正在调用风险分析" } as const;
        await releaseFinalAnswer.promise;
        yield { type: "answer.done", content: "**最终结论**：风险可控" } as const;
      },
      abortRun: vi.fn(async () => undefined),
    };

    renderChat(transport);
    submit();

    expect(await screen.findByText("正在处理请求")).toBeInTheDocument();
    expect(screen.getAllByTestId("activity-line")).toHaveLength(1);

    releaseToolActivity.resolve();
    expect(await screen.findByText("正在调用风险分析")).toBeInTheDocument();
    expect(screen.queryByText("正在处理请求")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("activity-line")).toHaveLength(1);

    releaseFinalAnswer.resolve();
    expect(await screen.findByText(/最终结论/)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByTestId("activity-line")).not.toBeInTheDocument();
    });
  });

  it("shows continue only for a stopped mock run", async () => {
    renderChat(
      makeTransport("mock", [
        { type: "answer.delta", delta: "部分正文" },
        { type: "run.stopped", reason: "生成已停止" },
      ]),
    );
    submit();

    expect(await screen.findByText("部分正文")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "继续生成" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
  });

  it("hides continue for a stopped real run", async () => {
    renderChat(
      makeTransport("projects-new", [
        { type: "answer.done", content: "最终正文" },
        { type: "run.stopped", reason: "生成已停止" },
      ]),
    );
    submit();

    expect(await screen.findByText("生成已停止")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "继续生成" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
  });

  it("shows the truthful disconnected warning", async () => {
    renderChat(
      makeTransport("mock", [
        { type: "answer.delta", delta: "已保留正文" },
        {
          type: "run.disconnected",
          warning: "连接已断开，服务端任务可能仍在运行",
        },
      ]),
    );
    submit();

    expect(
      await screen.findByText("连接已断开，服务端任务可能仍在运行"),
    ).toBeInTheDocument();
    expect(screen.getByText("已保留正文")).toBeInTheDocument();
  });

  it("retains selected capabilities as the next-turn default", async () => {
    const transport = makeTransport("mock", [{ type: "answer.done", content: "完成" }]);
    renderChat(transport);
    fireEvent.click(screen.getByRole("button", { name: /^知识库/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: "项目资料库" }));
    submit();

    await waitFor(() => expect(transport.createRun).toHaveBeenCalledOnce());
    expect(transport.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({ knowledgeBaseIds: ["project"] }),
      }),
      expect.any(AbortSignal),
    );
    expect(screen.getByRole("button", { name: "知识库 · 1" })).toBeInTheDocument();
  });
});

describe("MessageContent", () => {
  it("renders partial Markdown without throwing", () => {
    render(<MessageContent content="**尚未闭合" />);
    expect(screen.getByText("**尚未闭合")).toBeInTheDocument();
  });
});
