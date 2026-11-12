import type { ChatMessage } from "@/features/chat/contracts/chat";
import type { ConversationMessage } from "@/features/chat/transports/daily-session-contract";
import type { PendingDailySend } from "./daily-conversation-reducer";

export interface DailySessionViewMessage extends ChatMessage {
  ordinal: string;
  pending?: boolean;
}

const unsupportedMessage = "暂不支持展示的消息";
const reportTypeLabels = {
  all: "总体",
  buckle: "卡口/设备监控",
  event: "预警事态",
} as const;

export function adaptDailySessionMessage(
  message: ConversationMessage,
): DailySessionViewMessage {
  return {
    id: message.messageId,
    role: message.role,
    content: visibleContent(message),
    createdAt: Date.parse(message.createdAt),
    ordinal: message.ordinal,
  };
}

export function mergeDailySessionMessages(
  older: DailySessionViewMessage[],
  current: DailySessionViewMessage[],
): DailySessionViewMessage[] {
  const currentById = new Map(current.map((message) => [message.id, message]));
  const merged = older.map(
    (message) => currentById.get(message.id) ?? message,
  );
  const olderIds = new Set(older.map((message) => message.id));
  for (const message of current) {
    if (!olderIds.has(message.id)) merged.push(message);
  }
  return sortDailySessionMessages(merged);
}

export function projectDailySessionMessages(
  messages: ConversationMessage[],
  pending: PendingDailySend | null,
): DailySessionViewMessage[] {
  const projected = messages
    .map(adaptDailySessionMessage)
    .sort(compareViewMessages);
  if (!pending) return projected;
  if (pending.status === "blocked" || pending.status === "failed") {
    return projected;
  }
  if (
    pending.userMessageId &&
    messages.some((message) => message.messageId === pending.userMessageId)
  ) {
    return projected;
  }
  return [
    ...projected,
    {
      id: `pending:${pending.clientRequestId}`,
      role: "user",
      content: pending.content,
      createdAt: pending.createdAt ?? 0,
      ordinal: "pending",
      pending: true,
    },
  ];
}

function sortDailySessionMessages(
  messages: DailySessionViewMessage[],
): DailySessionViewMessage[] {
  return [...messages].sort(compareViewMessages);
}

function compareViewMessages(
  left: DailySessionViewMessage,
  right: DailySessionViewMessage,
): number {
  if (left.ordinal === "pending") return right.ordinal === "pending" ? 0 : 1;
  if (right.ordinal === "pending") return -1;
  const a = BigInt(left.ordinal);
  const b = BigInt(right.ordinal);
  return a < b ? -1 : a > b ? 1 : left.id.localeCompare(right.id);
}

function visibleContent(message: ConversationMessage): string {
  const { content } = message;
  if (content.kind === "text" && typeof content.text === "string") {
    return content.text;
  }
  if (
    message.role === "user" &&
    content.kind === "daily_report" &&
    typeof content.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(content.date) &&
    isReportType(content.reportType)
  ) {
    return `生成 ${content.date} ${reportTypeLabels[content.reportType]}日报`;
  }
  return unsupportedMessage;
}

function isReportType(value: unknown): value is keyof typeof reportTypeLabels {
  return typeof value === "string" && value in reportTypeLabels;
}
