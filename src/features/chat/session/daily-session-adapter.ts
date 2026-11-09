import type { ChatMessage } from "@/features/chat/contracts/chat";
import type { ConversationMessage } from "@/features/chat/transports/daily-session-contract";

export interface DailySessionViewMessage extends ChatMessage {
  ordinal: string;
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
  return merged;
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
