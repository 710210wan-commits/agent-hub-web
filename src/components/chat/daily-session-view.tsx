"use client";

import { useMemo, useState } from "react";
import { defaultDailyCapabilityClient, useDailyCapabilities, type DailyCapabilityClient } from "@/features/chat/capabilities/use-daily-capabilities";
import {
  createHrScreeningClient,
  type HrScreeningClient,
} from "@/features/hr-screening/api/hr-screening-client";
import { HrScreeningView } from "@/features/hr-screening/components/hr-screening-view";

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
  capabilityClient = defaultDailyCapabilityClient,
  hrClient,
}: {
  client: DailySessionClient;
  conversationId?: string;
  onConversationResolved?(conversationId: string): void;
  capabilityClient?: DailyCapabilityClient;
  hrClient?: HrScreeningClient;
}) {
  const auth = useDailySessionAuthBridge();
  if (!auth.enabled) return <DailySessionAuthNotice />;

  return (
    <AuthenticatedDailySessionView
      key={`${auth.identityGeneration}:${conversationId ?? "new"}`}
      capabilityClient={capabilityClient}
      client={client}
      conversationId={conversationId}
      identityGeneration={auth.identityGeneration}
      hrClient={hrClient}
      onAuthRequired={auth.onAuthRequired}
      onConversationResolved={onConversationResolved}
    />
  );
}

function AuthenticatedDailySessionView({
  capabilityClient,
  client,
  conversationId,
  identityGeneration,
  hrClient: hrClientOverride,
  onAuthRequired,
  onConversationResolved,
}: {
  capabilityClient: DailyCapabilityClient;
  client: DailySessionClient;
  conversationId?: string;
  identityGeneration: number;
  hrClient?: HrScreeningClient;
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
  const capabilities = useDailyCapabilities(capabilityClient, identityGeneration, onAuthRequired);
  const hrClient = useMemo(() => hrClientOverride ?? createHrScreeningClient(), [hrClientOverride]);
  const isHrConversation = controller.state.conversation?.assistantId === "resume-screening";
  const [resultSelection, setResultSelection] = useState<{ batchId?: string; candidateId?: string }>(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    return {
      batchId: params.get("batch") ?? undefined,
      candidateId: params.get("candidate") ?? undefined,
    };
  });
  const selectScreeningResult = (selection: { batchId?: string; candidateId?: string }) => {
    setResultSelection(selection);
    const url = new URL(window.location.href);
    if (selection.batchId) url.searchParams.set("batch", selection.batchId);
    else url.searchParams.delete("batch");
    if (selection.candidateId) url.searchParams.set("candidate", selection.candidateId);
    else url.searchParams.delete("candidate");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  };
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
    void controller.submit(content, selection);
  };
  const run = presentRun(controller.state);
  const showEmpty = controller.messages.length === 0 && !controller.state.conversation;

  return (
    <section aria-label="决策持久会话" className="daily-session-view">
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

      {isHrConversation ? (
        <HrScreeningView
          key={controller.state.conversation!.conversationId}
          client={hrClient}
          conversationId={controller.state.conversation!.conversationId}
          onAuthRequired={onAuthRequired}
          onCanonicalAction={async text => { await controller.submit(text, createEmptySelection()); }}
          onSelectionChange={selectScreeningResult}
          progress={controller.state.toolProgress}
          refreshToken={controller.state.hrRefreshToken}
          selectedBatchId={resultSelection.batchId}
          selectedCandidateId={resultSelection.candidateId}
        />
      ) : null}

      {showEmpty ? (
        <ChatEmptyState mode="daily" onSelectPrompt={setInput} />
      ) : controller.messages.length === 0 ? (
        <section className="state-card empty-state">
          <strong>这个持久会话暂时没有消息</strong>
          <p>可以直接发送第一条消息</p>
        </section>
      ) : (
        <MessageList
          messages={controller.messages}
          onOpenScreeningResult={isHrConversation ? batchId => selectScreeningResult({ batchId }) : undefined}
        />
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
        capabilityMode={isHrConversation ? "locked" : "selectable"}
        capabilityCatalog={capabilities.catalog}
        capabilityNotice={capabilities.notice}
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
