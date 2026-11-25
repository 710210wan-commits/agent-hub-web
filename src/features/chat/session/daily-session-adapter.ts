import type { ChatMessage } from "@/features/chat/contracts/chat";
import type { ConversationMessage } from "@/features/chat/transports/daily-session-contract";
import {
  AssistantArtifactReferenceSchema,
  ConversationAttachmentSchema,
} from "@/features/chat/conversation/contracts/generated";
import type { DailyActiveOutput, PendingDailySend } from "./daily-conversation-reducer";
import { snapshotCapabilitySelection } from "../capabilities/contracts";

export interface DailySessionViewMessage extends ChatMessage {
  ordinal: string;
  pending?: boolean;
  streaming?: boolean;
  partialStatus?: DailyActiveOutput["status"] | "disconnected";
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
  const attachments = safeAttachments(message.content);
  const hasTextJobDescription = message.role === "user" && message.content.kind === "assistant_setup"
    && message.content.jobDescriptionSource === "text";
  const artifactRefs = message.artifactRefs.flatMap((artifact) => {
    const parsed = AssistantArtifactReferenceSchema.safeParse(artifact);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    id: message.messageId,
    role: message.role,
    content: visibleContent(message),
    createdAt: Date.parse(message.createdAt),
    ordinal: message.ordinal,
    ...(attachments.length ? { attachments } : {}),
    ...(hasTextJobDescription ? { jobDescriptionSource: "text" as const } : {}),
    ...(artifactRefs.length ? { artifactRefs } : {}),
    ...(message.role === "user" && message.capabilitySelection ? { selection: snapshotCapabilitySelection(message.capabilitySelection) } : {}),
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
  activeOutput: DailyActiveOutput | null = null,
): DailySessionViewMessage[] {
  let projected = messages
    .map(adaptDailySessionMessage)
    .sort(compareViewMessages);
  if (
    activeOutput?.content &&
    !messages.some(message => message.messageId === activeOutput.messageId)
  ) {
    projected = sortDailySessionMessages([
      ...projected,
      {
        id: activeOutput.messageId,
        role: "assistant",
        content: activeOutput.content,
        createdAt: 0,
        ordinal: "streaming",
        streaming: activeOutput.status === "streaming",
        partialStatus: activeOutput.status,
      },
    ]);
  }
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
      selection: snapshotCapabilitySelection(pending.capabilitySelection),
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
  const leftRank = specialOrdinalRank(left.ordinal);
  const rightRank = specialOrdinalRank(right.ordinal);
  if (leftRank !== 0 || rightRank !== 0) {
    return leftRank === rightRank ? left.id.localeCompare(right.id) : leftRank - rightRank;
  }
  const a = BigInt(left.ordinal);
  const b = BigInt(right.ordinal);
  return a < b ? -1 : a > b ? 1 : left.id.localeCompare(right.id);
}

function specialOrdinalRank(ordinal: string): number {
  if (ordinal === "pending") return 1;
  if (ordinal === "streaming") return 2;
  return 0;
}

function visibleContent(message: ConversationMessage): string {
  const { content } = message;
  if (content.kind === "text" && typeof content.text === "string") {
    return content.text;
  }
  if (content.kind === "assistant_setup") {
    if (typeof content.text === "string" && content.text.trim()) return content.text;
    if (typeof content.prompt === "string" && content.prompt.trim()) return content.prompt;
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

function safeAttachments(content: Record<string, unknown>) {
  if (content.kind !== "assistant_setup" || !Array.isArray(content.attachments)) return [];
  return content.attachments.flatMap((attachment) => {
    const parsed = ConversationAttachmentSchema.safeParse(attachment);
    return parsed.success ? [parsed.data] : [];
  });
}

function isReportType(value: unknown): value is keyof typeof reportTypeLabels {
  return typeof value === "string" && value in reportTypeLabels;
}
