"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, RotateCcw } from "lucide-react";
import type { ChatMessage } from "@/features/chat/contracts/chat";
import type { ChatRunView } from "@/features/chat/reducer/chat-state";
import type { DailySessionViewMessage } from "@/features/chat/session/daily-session-adapter";

import { ActivityLine } from "./activity-line";
import { copyText, MessageContent } from "./message-content";

type PresentableMessage = ChatMessage &
  Partial<Pick<DailySessionViewMessage, "streaming" | "partialStatus">>;

export function MessageList({
  messages,
  run,
  onOpenScreeningResult,
  followOutput = false,
  onRegenerate,
}: {
  messages: PresentableMessage[];
  run?: ChatRunView;
  onOpenScreeningResult?(batchId: string): void;
  followOutput?: boolean;
  onRegenerate?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const followingRef = useRef(true);
  const [showReturnToBottom, setShowReturnToBottom] = useState(false);
  const outputSignature = useMemo(
    () => messages.map(message => `${message.id}:${message.content.length}`).join("|"),
    [messages],
  );
  const latestAssistantId = useMemo(
    () => messages.findLast(message => message.role === "assistant")?.id,
    [messages],
  );

  useEffect(() => {
    if (!followOutput) return;
    const scroller = rootRef.current?.closest<HTMLElement>(".app-content");
    if (!scroller) return;
    const handleScroll = () => {
      const atBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <= 80;
      followingRef.current = atBottom;
      setShowReturnToBottom(!atBottom);
    };
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [followOutput]);

  useEffect(() => {
    if (!followOutput || !followingRef.current) return;
    const scroller = rootRef.current?.closest<HTMLElement>(".app-content");
    if (!scroller) return;
    const frame = requestAnimationFrame(() => {
      if (typeof scroller.scrollTo === "function") {
        scroller.scrollTo({ top: scroller.scrollHeight });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [followOutput, outputSignature]);

  const returnToBottom = () => {
    const scroller = rootRef.current?.closest<HTMLElement>(".app-content");
    if (!scroller) return;
    followingRef.current = true;
    setShowReturnToBottom(false);
    if (typeof scroller.scrollTo === "function") {
      scroller.scrollTo({ behavior: "smooth", top: scroller.scrollHeight });
    }
  };

  return (
    <div aria-label="会话消息" className="message-list" ref={rootRef}>
      {messages.map((message) => (
        <article
          className={`message message-${message.role}`}
          data-partial-status={message.partialStatus}
          key={message.id}
        >
          {message.role === "assistant" ? (
            <div className="assistant-header">
              <span className="assistant-mark">AI</span>
              <strong>智能体平台</strong>
            </div>
          ) : null}
          {message.role === "assistant" && message.id === run?.assistantMessageId ? (
            <ActivityLine run={run} />
          ) : null}
          {message.content ? (
            <MessageContent content={message.content} streaming={message.streaming} />
          ) : null}
          {message.attachments?.length || message.jobDescriptionSource === "text" ? (
            <div aria-label={message.jobDescriptionSource === "text" ? "筛选输入" : "已上传文件"} className="message-capabilities">
              {message.jobDescriptionSource === "text" ? <span className="capability-history-chip">岗位描述 · 粘贴文本</span> : null}
              {message.attachments?.map((attachment) => (
                <span className="capability-history-chip" key={attachment.fileId}>
                  {attachment.role === "job_description" ? "职位描述" : "简历"} · {attachment.name}
                </span>
              ))}
            </div>
          ) : null}
          {message.artifactRefs?.map((artifact) => (
            <button
              className="secondary-button"
              key={`${artifact.kind}:${artifact.batchId}`}
              onClick={() => onOpenScreeningResult?.(artifact.batchId)}
              type="button"
            >
              查看筛选结果
            </button>
          ))}
          {message.role === "user" && message.selection ? (
            <div aria-label="本轮能力" className="message-capabilities">
              {([
                ["知识库", message.selection.knowledgeBaseIds],
                ["Skill", message.selection.skillIds],
                ["MCP", message.selection.mcpServerIds],
              ] as const).flatMap(([label, ids]) => ids.map(id => (
                <span className="capability-history-chip" key={`${label}:${id}`}>{label} · {id}</span>
              )))}
              {Object.values(message.selection).every(ids => ids.length === 0) ? <span>未选择扩展能力</span> : null}
            </div>
          ) : null}
          {message.role === "assistant" && message.partialStatus === "interrupted" ? (
            <p className="message-partial-status">生成已停止，已保留以上正文</p>
          ) : message.role === "assistant" && message.partialStatus === "failed" ? (
            <p className="message-partial-status">生成失败，已保留以上正文</p>
          ) : message.role === "assistant" && message.partialStatus === "disconnected" ? (
            <p className="message-partial-status">连接已中断，以上正文已保留</p>
          ) : null}
          {message.role === "assistant" && message.content ? (
            <div className="message-actions">
              <button
                aria-label="复制回答"
                onClick={() => void copyText(message.content)}
                title="复制回答"
                type="button"
              >
                <Copy aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
              {onRegenerate && !message.streaming && message.id === latestAssistantId ? (
                <button aria-label="重新生成" onClick={onRegenerate} title="重新生成" type="button">
                  <RotateCcw aria-hidden="true" size={16} strokeWidth={1.8} />
                </button>
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
      {showReturnToBottom ? (
        <button className="return-to-bottom" onClick={returnToBottom} type="button">
          回到底部
        </button>
      ) : null}
    </div>
  );
}
