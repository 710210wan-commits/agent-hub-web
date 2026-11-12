"use client";

import { useState } from "react";

import { ErrorState } from "@/components/states/error-state";
import { InlineError } from "@/components/states/inline-error";
import { LoadingState } from "@/components/states/loading-state";
import {
  createEmptySelection,
  type ChatRunState,
  type ChatRunView,
} from "@/features/chat/reducer/chat-state";
import { useDailyConversation } from "@/features/chat/session/use-daily-conversation";
import { useDailySessionAuthBridge } from "@/features/chat/session/use-daily-session-auth-bridge";
import type { DailySessionClient } from "@/features/chat/transports/daily-session-client";

import { ActivityLine } from "./activity-line";
import { ChatEmptyState } from "./chat-empty-state";
import { Composer } from "./composer";
import { DailySessionAuthNotice } from "./daily-session-auth-notice";
import { MessageList } from "./message-list";

export function DailySessionView({
  client,
  conversationId,
  onConversationResolved,
}: {
  client: DailySessionClient;
  conversationId?: string;
  onConversationResolved?(conversationId: string): void;
}) {
  const auth = useDailySessionAuthBridge();
  if (!auth.enabled) return <DailySessionAuthNotice />;

  return (
    <AuthenticatedDailySessionView
      client={client}
      conversationId={conversationId}
      identityGeneration={auth.identityGeneration}
      onAuthRequired={auth.onAuthRequired}
      onConversationResolved={onConversationResolved}
    />
  );
}

function AuthenticatedDailySessionView({
  client,
  conversationId,
  identityGeneration,
  onAuthRequired,
  onConversationResolved,
}: {
  client: DailySessionClient;
  conversationId?: string;
  identityGeneration: number;
  onAuthRequired(): void;
  onConversationResolved?(conversationId: string): void;
}) {
  const controller = useDailyConversation({
    client,
    conversationId,
    identityGeneration,
    onAuthRequired,
    onConversationResolved,
  });
  const [input, setInput] = useState("");
  const [selection, setSelection] = useState(createEmptySelection);
  const hasInitialConversation = Boolean(conversationId);
  const isInitialLoading =
    hasInitialConversation &&
    !controller.state.conversation &&
    ["idle", "loading"].includes(controller.state.status);

  if (controller.state.status === "deleted") {
    return <ErrorState message="会话不存在、已删除或不属于当前用户" />;
  }
  if (isInitialLoading && !controller.state.notice) {
    return <LoadingState label="正在加载历史会话…" />;
  }
  if (isInitialLoading && controller.state.notice) {
    return (
      <div className="daily-session-view-state">
        <ErrorState message={controller.state.notice} />
        <button
          className="secondary-button"
          onClick={controller.reconnect}
          type="button"
        >
          重试加载
        </button>
      </div>
    );
  }

  const submit = () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    void controller.submit(content);
  };
  const run = presentRun(controller.state);
  const showEmpty = controller.messages.length === 0 && !controller.state.conversation;

  return (
    <section aria-label="日常持久会话" className="daily-session-view">
      {controller.state.conversation ? (
        <header className="daily-session-view-heading">
          <div>
            <span>持久会话</span>
            <h1>{controller.state.conversation.title || "未命名会话"}</h1>
          </div>
        </header>
      ) : null}

      {controller.state.nextCursor ? (
        <button
          className="secondary-button daily-session-load-earlier"
          onClick={() => void controller.loadEarlier()}
          type="button"
        >
          加载更早消息
        </button>
      ) : null}

      {showEmpty ? (
        <ChatEmptyState mode="daily" onSelectPrompt={setInput} />
      ) : controller.messages.length === 0 ? (
        <section className="state-card empty-state">
          <strong>这个持久会话暂时没有消息</strong>
          <p>可以直接发送第一条消息</p>
        </section>
      ) : (
        <MessageList messages={controller.messages} />
      )}

      {controller.state.activity ? <ActivityLine run={run} /> : null}
      {controller.state.notice ? (
        <div className="run-actions">
          <InlineError message={controller.state.notice} />
          {controller.state.status === "disconnected" ? (
            <button onClick={controller.reconnect} type="button">
              重新连接
            </button>
          ) : controller.state.pendingSend?.status === "unknown" ||
            controller.state.pendingSend?.status === "failed" ? (
            <button onClick={() => void controller.retrySubmit()} type="button">
              重试发送
            </button>
          ) : null}
        </div>
      ) : null}

      <Composer
        capabilityMode="unavailable"
        input={input}
        mode="daily"
        onChange={setInput}
        onSelectionChange={setSelection}
        onSend={submit}
        onStop={() => void controller.cancel()}
        selection={selection}
        status={composerStatus(controller.state.status)}
      />
    </section>
  );
}

function composerStatus(status: string): ChatRunState {
  if (status === "submitting") return "submitting";
  if (status === "working" || status === "cancelling") return "working";
  return "idle";
}

function presentRun(input: {
  status: string;
  activity: string | null;
  completedStepCount: number;
  notice: string | null;
  activeTurn: { turnId: string } | null;
}): ChatRunView {
  return {
    status: input.activity ? "working" : composerStatus(input.status),
    runId: input.activeTurn?.turnId ?? null,
    assistantMessageId: null,
    activity: input.activity,
    completedStepCount: input.completedStepCount,
    notice: input.notice,
  };
}
