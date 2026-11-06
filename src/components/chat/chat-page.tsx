"use client";

import { useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import { InlineError } from "@/components/states/inline-error";
import type { ChatTransport } from "@/features/chat/contracts/transport";
import { useChatController } from "@/features/chat/use-chat-controller";
import { useAppMode } from "@/providers/mode-provider";

import { ChatEmptyState } from "./chat-empty-state";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { RunActions } from "./run-actions";

export function ChatPage({
  transport,
  initialSessionId,
  onSessionResolved,
  routeKey,
}: {
  transport: ChatTransport;
  initialSessionId?: string;
  onSessionResolved?: (sessionId: string) => void;
  routeKey?: string;
}) {
  const { mode } = useAppMode();
  const controller = useChatController(transport, mode, {
    initialSessionId,
    onSessionResolved,
    routeKey,
  });
  const [inputState, setInputState] = useState({ routeKey, value: "" });
  const input = inputState.routeKey === routeKey ? inputState.value : "";
  const setInput = (value: string) => setInputState({ routeKey, value });

  const send = () => {
    const content = input.trim();
    if (!content) return;
    if (controller.submit(content)) setInput("");
  };

  return (
    <AppShell title="新对话">
      <div className="chat-page">
        <div className="chat-scroll-region">
          {controller.state.sessionStatus === "loading" ? (
            <section aria-live="polite" className="state-card empty-state">
              <p>正在加载会话…</p>
            </section>
          ) : controller.state.sessionError ? (
            <section className="state-card empty-state">
              <InlineError message={controller.state.sessionError} />
            </section>
          ) : controller.state.messages.length === 0 ? (
            <ChatEmptyState mode={mode} onSelectPrompt={setInput} />
          ) : (
            <MessageList state={controller.state} />
          )}
          <RunActions
            kind={transport.kind}
            onContinue={controller.continueRun}
            onRegenerate={controller.regenerate}
            run={controller.state.run}
          />
        </div>
        {controller.state.sessionStatus === "idle" ||
        controller.state.sessionStatus === "ready" ? (
          <Composer
            input={input}
            mode={mode}
            onChange={setInput}
            onSelectionChange={controller.changeSelection}
            onSend={send}
            onStop={controller.stop}
            selection={controller.state.draftSelection}
            status={controller.state.run.status}
          />
        ) : null}
      </div>
    </AppShell>
  );
}
