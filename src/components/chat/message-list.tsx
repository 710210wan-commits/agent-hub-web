import type { ChatState } from "@/features/chat/reducer/chat-state";

import { ActivityLine } from "./activity-line";
import { MessageContent } from "./message-content";

export function MessageList({ state }: { state: ChatState }) {
  return (
    <div className="message-list">
      {state.messages.map((message) => (
        <article className={`message message-${message.role}`} key={message.id}>
          {message.role === "assistant" ? (
            <div className="assistant-header">
              <span className="assistant-mark">AI</span>
              <strong>智能体平台</strong>
            </div>
          ) : null}
          {message.content ? <MessageContent content={message.content} /> : null}
          {message.role === "assistant" && message.id === state.run.assistantMessageId ? (
            <ActivityLine run={state.run} />
          ) : null}
        </article>
      ))}
    </div>
  );
}
