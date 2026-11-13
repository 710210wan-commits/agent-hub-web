import { describe, expect, it } from "vitest";

import type { ChatSelectionSnapshot } from "../contracts/chat";
import type { ChatStreamEvent } from "../contracts/events";
import { chatReducer } from "./chat-reducer";
import { createInitialChatState } from "./chat-state";

const selections: ChatSelectionSnapshot = {
  knowledgeBaseIds: ["kb-project"],
  skillIds: ["risk-review"],
  mcpServerIds: ["weather"],
};

function submit() {
  return chatReducer(createInitialChatState(), {
    type: "message.submit",
    userMessage: {
      id: "user-1",
      content: "分析本周风险",
      selection: selections,
      createdAt: 1,
    },
    assistantMessageId: "assistant-1",
  });
}

function emit(state: ReturnType<typeof submit>, event: ChatStreamEvent) {
  return chatReducer(state, { type: "stream.event", event });
}

describe("chatReducer", () => {
  it("hydrates a persisted session in backend message order", () => {
    const loading = chatReducer(createInitialChatState(), {
      type: "session.load.start",
    });
    const messages = [
      { id: "m1", role: "user" as const, content: "历史问题", createdAt: 1 },
      { id: "m2", role: "assistant" as const, content: "历史回答", createdAt: 2 },
    ];
    const loaded = chatReducer(loading, {
      type: "session.load.success",
      sessionId: "thread-1",
      messages,
    });

    expect(loading.sessionStatus).toBe("loading");
    expect(loaded.sessionId).toBe("thread-1");
    expect(loaded.sessionStatus).toBe("ready");
    expect(loaded.messages).toEqual(messages);
  });

  it("tracks not-found and resolved session states without synthetic messages", () => {
    const missing = chatReducer(createInitialChatState(), {
      type: "session.load.not-found",
    });
    const resolved = chatReducer(createInitialChatState(), {
      type: "session.resolve",
      sessionId: "thread-new",
    });

    expect(missing).toMatchObject({
      sessionId: null,
      sessionStatus: "not-found",
      sessionError: "会话不存在或已删除",
      messages: [],
    });
    expect(resolved).toMatchObject({
      sessionId: "thread-new",
      sessionStatus: "ready",
      sessionError: null,
    });
  });

  it("snapshots selections when a message is submitted", () => {
    const state = submit();

    expect(state.run.status).toBe("submitting");
    expect(state.messages).toHaveLength(2);
    expect(state.messages[0]).toMatchObject({
      id: "user-1",
      role: "user",
      content: "分析本周风险",
      selection: selections,
    });
    expect(state.messages[1]).toMatchObject({
      id: "assistant-1",
      role: "assistant",
      content: "",
    });
    expect(state.messages[0].selection).not.toBe(selections);
  });

  it("keeps prior message snapshots immutable when draft selections change", () => {
    const submitted = submit();
    const changed = chatReducer(submitted, {
      type: "selection.change",
      selection: {
        knowledgeBaseIds: ["kb-other"],
        skillIds: [],
        mcpServerIds: [],
      },
    });

    expect(changed.draftSelection.knowledgeBaseIds).toEqual(["kb-other"]);
    expect(changed.messages[0].selection).toEqual(selections);
  });

  it("replaces the single visible activity line", () => {
    const connected = emit(submit(), { type: "run.connected", runId: "run-1" });
    const first = emit(connected, {
      type: "activity.update",
      label: "正在读取知识库",
      completedStepCount: 1,
    });
    const second = emit(first, {
      type: "activity.update",
      label: "正在调用工具",
      completedStepCount: 2,
    });

    expect(second.run.status).toBe("working");
    expect(second.run.activity).toBe("正在调用工具");
    expect(second.run.completedStepCount).toBe(2);
  });

  it("appends deltas in order and completes with the accumulated answer", () => {
    const first = emit(submit(), { type: "answer.delta", delta: "第一段。" });
    const second = emit(first, { type: "answer.delta", delta: "第二段。" });
    const completed = emit(second, { type: "answer.done" });

    expect(second.run.status).toBe("streaming");
    expect(second.messages.at(-1)?.content).toBe("第一段。第二段。");
    expect(completed.run.status).toBe("completed");
    expect(completed.messages.at(-1)?.content).toBe("第一段。第二段。");
  });

  it("accepts a one-shot final answer from the real transport", () => {
    const completed = emit(submit(), {
      type: "answer.done",
      content: "一次性最终正文",
    });

    expect(completed.run.status).toBe("completed");
    expect(completed.messages.at(-1)?.content).toBe("一次性最终正文");
  });

  it.each([
    [
      "run.stopped",
      { type: "run.stopped", reason: "用户已停止" } as const,
      "stopped",
      "用户已停止",
    ],
    [
      "run.disconnected",
      {
        type: "run.disconnected",
        warning: "连接已断开，服务端任务可能仍在运行",
      } as const,
      "disconnected",
      "连接已断开，服务端任务可能仍在运行",
    ],
  ])("preserves partial content on %s", (_name, event, status, warning) => {
    const partial = emit(submit(), { type: "answer.delta", delta: "已生成部分" });
    const ended = emit(partial, event);

    expect(ended.run.status).toBe(status);
    expect(ended.run.notice).toBe(warning);
    expect(ended.messages.at(-1)?.content).toBe("已生成部分");
  });

  it("resets transient run fields when regenerating", () => {
    const partial = emit(
      emit(submit(), { type: "answer.delta", delta: "旧正文" }),
      { type: "run.failed", message: "失败" },
    );
    const retried = chatReducer(partial, { type: "run.retry" });

    expect(retried.run).toMatchObject({
      status: "submitting",
      activity: null,
      notice: null,
      completedStepCount: 0,
    });
    expect(retried.messages.at(-1)?.content).toBe("");
  });
});
