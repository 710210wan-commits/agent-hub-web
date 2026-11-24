import { fireEvent, render, screen } from "@testing-library/react";
import { Profiler } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRunView } from "@/features/chat/reducer/chat-state";
import type { DailySessionViewMessage } from "@/features/chat/session/daily-session-adapter";

import { ActivityLine } from "./activity-line";
import { MessageList } from "./message-list";

const streamingMessage: DailySessionViewMessage = {
  id: "assistant-stream",
  role: "assistant",
  content: "正在增长的正文",
  createdAt: 0,
  ordinal: "streaming",
  streaming: true,
  partialStatus: "streaming",
};

describe("MessageList streaming presentation", () => {
  const writeText = vi.fn(async () => undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
  });

  it("shows an accessible streaming cursor and explicit interrupted partial state", () => {
    const { rerender } = render(<MessageList messages={[streamingMessage]} />);

    expect(screen.getByTestId("streaming-cursor")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("正在生成");

    rerender(
      <MessageList
        messages={[{
          ...streamingMessage,
          streaming: false,
          partialStatus: "interrupted",
        }]}
      />,
    );
    expect(screen.queryByTestId("streaming-cursor")).not.toBeInTheDocument();
    expect(screen.getByText("生成已停止，已保留以上正文")).toBeInTheDocument();
  });

  it("copies the complete answer and fenced code independently", () => {
    render(
      <MessageList
        messages={[{
          ...streamingMessage,
          content: "说明\n\n```ts\nconst answer = 42;\n```",
          streaming: false,
          partialStatus: "completed",
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "复制回答" }));
    expect(writeText).toHaveBeenCalledWith("说明\n\n```ts\nconst answer = 42;\n```");
    fireEvent.click(screen.getByRole("button", { name: "复制代码" }));
    expect(writeText).toHaveBeenLastCalledWith("const answer = 42;\n");
  });

  it("renders a 10k answer without truncating it", () => {
    const content = "长".repeat(10_000);
    const commitDurations: number[] = [];
    render(
      <Profiler id="daily-10k" onRender={(_id, _phase, actualDuration) => {
        commitDurations.push(actualDuration);
      }}>
        <MessageList messages={[{ ...streamingMessage, content }]} />
      </Profiler>,
    );
    expect(screen.getByText(content)).toHaveTextContent(content);
    expect(commitDurations.length).toBeGreaterThan(0);
    expect(commitDurations.every(Number.isFinite)).toBe(true);
  });

  it("offers execution details only when real tool activity occurred", () => {
    const run: ChatRunView = {
      status: "streaming",
      runId: "turn-1",
      assistantMessageId: "assistant-stream",
      activity: null,
      completedStepCount: 2,
      notice: null,
      hasToolActivity: true,
      toolSteps: [
        { id: "step-1", name: "caveman", status: "completed" },
        { id: "step-2", name: "web_search", status: "failed" },
      ],
      selectedSkillNames: ["Caveman"],
    };
    render(<ActivityLine run={run} />);

    const trigger = screen.getByRole("button", { name: "已完成 2 个工具步骤" });
    expect(screen.queryByText("Caveman")).not.toBeInTheDocument();
    expect(screen.queryByText("web search")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText("Caveman")).toBeInTheDocument();
    expect(screen.getByText("caveman")).toBeInTheDocument();
    expect(screen.getByText("web search")).toBeInTheDocument();
    expect(screen.getByText("执行失败")).toBeInTheDocument();
  });

  it("uses icon-only answer actions with accessible GPT-style labels", () => {
    const onRegenerate = vi.fn();
    const { container } = render(
      <MessageList
        messages={[{ ...streamingMessage, streaming: false, partialStatus: "completed" }]}
        onRegenerate={onRegenerate}
      />,
    );

    expect(screen.getByRole("button", { name: "复制回答" })).toHaveAttribute("title", "复制回答");
    expect(screen.getByRole("button", { name: "重新生成" })).toHaveAttribute("title", "重新生成");
    expect(container.querySelector(".message-actions")?.textContent).toBe("");
  });

  it("renders Chinese punctuation without changing copied source text", () => {
    render(
      <MessageList
        messages={[{
          ...streamingMessage,
          content: "开头 YAML:name, 然后执行; 完成!\n\n`const value = 'a,b';`",
          streaming: false,
          partialStatus: "completed",
        }]}
      />,
    );

    expect(screen.getByText("开头 YAML：name， 然后执行； 完成！")).toBeInTheDocument();
    expect(screen.getByText("const value = 'a,b';")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "复制回答" }));
    expect(writeText).toHaveBeenLastCalledWith("开头 YAML:name, 然后执行; 完成!\n\n`const value = 'a,b';`");
  });

  it("lets the user return to the bottom after taking over scrolling", () => {
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    try {
      const { container, rerender } = render(
        <div className="app-content">
          <MessageList followOutput messages={[streamingMessage]} />
        </div>,
      );
      const scroller = container.querySelector(".app-content") as HTMLElement;
      const scrollTo = vi.fn();
      Object.defineProperties(scroller, {
        clientHeight: { configurable: true, value: 400 },
        scrollHeight: { configurable: true, value: 1200 },
        scrollTop: { configurable: true, writable: true, value: 100 },
        scrollTo: { configurable: true, value: scrollTo },
      });

      fireEvent.scroll(scroller);
      scrollTo.mockClear();
      rerender(
        <div className="app-content">
          <MessageList
            followOutput
            messages={[{ ...streamingMessage, content: "正在增长的正文，新增内容" }]}
          />
        </div>,
      );
      expect(scrollTo).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "回到底部" }));
      expect(scrollTo).toHaveBeenCalledWith({ behavior: "smooth", top: 1200 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
