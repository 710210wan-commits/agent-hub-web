"use client";

import { useState } from "react";

import { AppShell } from "@/components/shell/app-shell";
import type { ChatTransport } from "@/features/chat/contracts/transport";
import { useChatController } from "@/features/chat/use-chat-controller";
import { useAppMode } from "@/providers/mode-provider";

import { ChatEmptyState } from "./chat-empty-state";
import { Composer } from "./composer";
import { MessageList } from "./message-list";
import { RunActions } from "./run-actions";

export function ChatPage({ transport }: { transport: ChatTransport }) {
  const { mode } = useAppMode();
  const controller = useChatController(transport, mode);
  const [input, setInput] = useState("");

  const send = () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    void controller.submit(content);
  };

  return (
    <AppShell title="新对话">
      <div className="chat-page">
        <div className="chat-scroll-region">
          {controller.state.messages.length === 0 ? (
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
        <Composer
          input={input}
          onChange={setInput}
          onSelectionChange={controller.changeSelection}
          onSend={send}
          onStop={controller.stop}
          selection={controller.state.draftSelection}
          status={controller.state.run.status}
        />
      </div>
    </AppShell>
  );
}
