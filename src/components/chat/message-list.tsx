import type { ChatMessage } from "@/features/chat/contracts/chat";
import type { ChatRunView } from "@/features/chat/reducer/chat-state";

import { ActivityLine } from "./activity-line";
import { MessageContent } from "./message-content";

export function MessageList({
  messages,
  run,
}: {
  messages: ChatMessage[];
  run?: ChatRunView;
}) {
  return (
    <div aria-label="会话消息" className="message-list">
      {messages.map((message) => (
        <article className={`message message-${message.role}`} key={message.id}>
          {message.role === "assistant" ? (
            <div className="assistant-header">
              <span className="assistant-mark">AI</span>
              <strong>智能体平台</strong>
            </div>
          ) : null}
          {message.content ? <MessageContent content={message.content} /> : null}
          {message.role === "assistant" && message.id === run?.assistantMessageId ? (
            <ActivityLine run={run} />
          ) : null}
        </article>
      ))}
    </div>
  );
}
