import type {
  AcceptedConversationTurn,
  ConversationMessage,
  ConversationMetadata,
  ConversationPublicEvent,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";

export type DailyConversationStatus =
  | "idle"
  | "loading"
  | "ready"
  | "submitting"
  | "working"
  | "cancelling"
  | "completed"
  | "failed"
  | "stopped"
  | "disconnected"
  | "stale"
  | "deleted";

export type DailyTurnStatus = AcceptedConversationTurn["status"];

export interface DailyActiveTurn {
  turnId: string;
  taskId: string;
  turnIndex?: string;
  status: DailyTurnStatus;
  acceptedEventSeq: string;
  errorCode?: string | null;
}

export interface PendingDailySend {
  clientRequestId: string;
  content: string;
  status: "submitting" | "unknown" | "accepted" | "blocked" | "failed";
  userMessageId?: string;
  turnId?: string;
  createdAt?: number;
}

export interface DailyConversationState {
  key: string;
  conversation: ConversationMetadata | null;
  messagesById: Readonly<Record<string, ConversationMessage>>;
  activeTurn: DailyActiveTurn | null;
  pendingSend: PendingDailySend | null;
  appliedSeq: string;
  snapshotWatermark: string | null;
  nextCursor: string | null;
  status: DailyConversationStatus;
  activity: string | null;
  completedStepCount: number;
  notice: string | null;
}

export type DailyConversationAction =
  | { type: "loading" }
  | { type: "snapshot.install"; snapshot: ConversationSnapshot }
  | {
      type: "conversation.install";
      conversation: ConversationMetadata;
      key?: string;
    }
  | { type: "event.apply"; event: ConversationPublicEvent }
  | { type: "pending.start"; pending: PendingDailySend }
  | {
      type: "pending.status";
      status: PendingDailySend["status"];
      notice?: string | null;
    }
  | { type: "receipt.apply"; receipt: AcceptedConversationTurn }
  | { type: "stream.disconnected" }
  | { type: "stream.reconnecting" }
  | { type: "recovery.stale" }
  | { type: "cancel.requested" }
  | {
      type: "messages.merge";
      messages: ConversationMessage[];
      nextCursor: string | null;
    }
  | { type: "notice.set"; notice: string | null };

export class ConversationSequenceGapError extends Error {
  readonly expectedSeq: string;
  readonly receivedSeq: string;

  constructor(expectedSeq: string, receivedSeq: string) {
    super(`会话事件序号不连续：期望 ${expectedSeq}，收到 ${receivedSeq}`);
    this.name = "ConversationSequenceGapError";
    this.expectedSeq = expectedSeq;
    this.receivedSeq = receivedSeq;
  }
}

export function createInitialDailyConversationState(
  key: string,
): DailyConversationState {
  return {
    key,
    conversation: null,
    messagesById: {},
    activeTurn: null,
    pendingSend: null,
    appliedSeq: "0",
    snapshotWatermark: null,
    nextCursor: null,
    status: "idle",
    activity: null,
    completedStepCount: 0,
    notice: null,
  };
}

export function selectDailyConversationMessages(
  state: DailyConversationState,
): ConversationMessage[] {
  return Object.values(state.messagesById).sort((left, right) => {
    const ordinal = compareSequence(left.ordinal, right.ordinal);
    return ordinal === 0 ? left.messageId.localeCompare(right.messageId) : ordinal;
  });
}

export function dailyConversationReducer(
  state: DailyConversationState,
  action: DailyConversationAction,
): DailyConversationState {
  switch (action.type) {
    case "loading":
      return { ...state, status: "loading", notice: null };
    case "snapshot.install":
      return installSnapshot(state, action.snapshot);
    case "conversation.install":
      return {
        ...state,
        key: action.key ?? state.key,
        conversation: action.conversation,
        status: "ready",
        appliedSeq: "0",
        snapshotWatermark: action.conversation.lastEventSeq,
      };
    case "pending.start":
      return {
        ...state,
        pendingSend: action.pending,
        status: "submitting",
        notice: null,
      };
    case "pending.status":
      return {
        ...state,
        pendingSend: state.pendingSend
          ? { ...state.pendingSend, status: action.status }
          : null,
        status:
          action.status === "submitting"
            ? "submitting"
            : action.status === "accepted"
              ? state.status
              : "ready",
        notice: action.notice === undefined ? state.notice : action.notice,
      };
    case "receipt.apply":
      return applyReceipt(state, action.receipt);
    case "event.apply":
      return applyEvent(state, action.event);
    case "stream.disconnected":
      return {
        ...state,
        status: "disconnected",
        activity: null,
        notice: "连接已中断",
      };
    case "stream.reconnecting":
      return {
        ...state,
        status: statusFromTurn(state.activeTurn?.status),
        notice: null,
      };
    case "recovery.stale":
      return {
        ...state,
        status: "stale",
        activity: null,
        notice: "历史执行状态待确认",
      };
    case "cancel.requested":
      if (!state.activeTurn) return state;
      if (state.activeTurn.status === "queued") {
        return {
          ...state,
          activeTurn: { ...state.activeTurn, status: "interrupted" },
          status: "stopped",
          activity: null,
          notice: "生成已停止",
        };
      }
      if (state.activeTurn.status === "running") {
        return {
          ...state,
          activeTurn: { ...state.activeTurn, status: "cancelling" },
          status: "cancelling",
          activity: "正在停止…",
        };
      }
      return state;
    case "messages.merge": {
      const messagesById = { ...state.messagesById };
      for (const message of action.messages) {
        if (!messagesById[message.messageId]) {
          messagesById[message.messageId] = message;
        }
      }
      return { ...state, messagesById, nextCursor: action.nextCursor };
    }
    case "notice.set":
      return { ...state, notice: action.notice };
  }
}

function installSnapshot(
  state: DailyConversationState,
  snapshot: ConversationSnapshot,
): DailyConversationState {
  const messagesById: Record<string, ConversationMessage> = {};
  for (const message of snapshot.messages) messagesById[message.messageId] = message;
  return {
    ...state,
    conversation: snapshot.conversation,
    messagesById,
    activeTurn: snapshot.activeTurn,
    appliedSeq: "0",
    snapshotWatermark: snapshot.lastEventSeq,
    nextCursor: snapshot.nextCursor,
    status: statusFromTurn(snapshot.activeTurn?.status),
    activity: activityFromTurn(snapshot.activeTurn?.status),
    completedStepCount: 0,
    notice: null,
  };
}

function applyReceipt(
  state: DailyConversationState,
  receipt: AcceptedConversationTurn,
): DailyConversationState {
  const existing = state.activeTurn;
  const pending = bindPending(
    state,
    receipt.userMessageId,
    receipt.turnId,
    "accepted",
  );
  if (
    existing &&
    ((existing.turnId === receipt.turnId &&
      (isTerminal(existing.status) ||
        statusRank(existing.status) > statusRank(receipt.status))) ||
      (existing.turnId !== receipt.turnId &&
        compareSequence(existing.acceptedEventSeq, receipt.acceptedEventSeq) >= 0))
  ) {
    return { ...state, pendingSend: pending };
  }
  const activeTurn: DailyActiveTurn = {
    turnId: receipt.turnId,
    taskId: receipt.taskId,
    ...(existing?.turnId === receipt.turnId && existing.turnIndex
      ? { turnIndex: existing.turnIndex }
      : {}),
    status: receipt.status,
    acceptedEventSeq: receipt.acceptedEventSeq,
    errorCode: null,
  };
  return {
    ...state,
    activeTurn,
    pendingSend: pending,
    status: statusFromTurn(receipt.status),
    activity: activityFromTurn(receipt.status),
  };
}

function applyEvent(
  state: DailyConversationState,
  event: ConversationPublicEvent,
): DailyConversationState {
  const order = compareSequence(event.eventSeq, state.appliedSeq);
  if (order <= 0) return state;
  const expected = (BigInt(state.appliedSeq) + BigInt(1)).toString();
  if (event.eventSeq !== expected) {
    throw new ConversationSequenceGapError(expected, event.eventSeq);
  }

  let next: DailyConversationState = { ...state, appliedSeq: event.eventSeq };
  switch (event.type) {
    case "conversation.created":
      return next;
    case "conversation.updated":
      return {
        ...next,
        conversation: next.conversation
          ? {
              ...next.conversation,
              title: event.payload.title,
              version: event.payload.version,
              lastEventSeq: event.eventSeq,
            }
          : null,
      };
    case "conversation.closed":
    case "conversation.reopened":
    case "conversation.archived":
    case "conversation.unarchived":
      return { ...next, conversation: event.payload.conversation };
    case "conversation.deleted":
      return {
        ...next,
        conversation: next.conversation
          ? {
              ...next.conversation,
              status: "deleted",
              version: event.payload.version,
              lastEventSeq: event.eventSeq,
            }
          : null,
        status: "deleted",
        activity: null,
        activeTurn: null,
      };
    case "message.created": {
      const message = event.payload.message;
      const messagesById = {
        ...next.messagesById,
        [message.messageId]: message,
      };
      const pendingSend =
        message.role === "user"
          ? bindPending(
              { ...next, messagesById },
              message.messageId,
              message.turnId,
              "accepted",
            )
          : next.pendingSend;
      return { ...next, messagesById, pendingSend };
    }
    case "turn.queued":
      next = {
        ...next,
        pendingSend: bindPending(
          next,
          event.payload.userMessageId,
          event.payload.turn.turnId,
          "accepted",
        ),
      };
      return applyTurn(next, event.payload.turn);
    case "turn.started":
    case "turn.cancelling":
    case "turn.completed":
    case "turn.failed":
    case "turn.interrupted":
      return applyTurn(next, event.payload.turn);
    case "tool.started":
      if (event.turnId !== next.activeTurn?.turnId) return next;
      if (isTerminal(next.activeTurn.status)) return next;
      return { ...next, status: "working", activity: "正在使用工具…" };
    case "tool.completed":
      if (event.turnId !== next.activeTurn?.turnId) return next;
      if (isTerminal(next.activeTurn.status)) return next;
      return {
        ...next,
        status: "working",
        activity: "正在处理…",
        completedStepCount: next.completedStepCount + 1,
      };
  }
}

function applyTurn(
  state: DailyConversationState,
  turn: DailyActiveTurn,
): DailyConversationState {
  if (
    state.activeTurn?.turnId === turn.turnId &&
    isTerminal(state.activeTurn.status) &&
    !isTerminal(turn.status)
  ) {
    return state;
  }
  const isNewTurn = state.activeTurn?.turnId !== turn.turnId;
  return {
    ...state,
    activeTurn: turn,
    status: statusFromTurn(turn.status),
    activity: activityFromTurn(turn.status),
    completedStepCount: isNewTurn ? 0 : state.completedStepCount,
    notice:
      turn.status === "failed"
        ? "任务执行失败"
        : turn.status === "interrupted"
          ? "生成已停止"
          : null,
  };
}

function bindPending(
  state: Pick<DailyConversationState, "pendingSend" | "messagesById">,
  userMessageId: string,
  turnId: string,
  status: PendingDailySend["status"],
): PendingDailySend | null {
  const pending = state.pendingSend;
  if (!pending) return null;
  if (pending.userMessageId && pending.userMessageId !== userMessageId) {
    return pending;
  }
  if (state.messagesById[userMessageId]) return null;
  return { ...pending, userMessageId, turnId, status };
}

function compareSequence(left: string, right: string): number {
  const a = BigInt(left);
  const b = BigInt(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function isTerminal(status: DailyTurnStatus): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

function statusRank(status: DailyTurnStatus): number {
  switch (status) {
    case "queued":
      return 1;
    case "running":
      return 2;
    case "cancelling":
      return 3;
    case "completed":
    case "failed":
    case "interrupted":
      return 4;
  }
}

function statusFromTurn(
  status: DailyTurnStatus | undefined,
): DailyConversationStatus {
  switch (status) {
    case "queued":
      return "submitting";
    case "running":
      return "working";
    case "cancelling":
      return "cancelling";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "interrupted":
      return "stopped";
    default:
      return "ready";
  }
}

function activityFromTurn(status: DailyTurnStatus | undefined): string | null {
  switch (status) {
    case "queued":
      return "正在准备…";
    case "running":
      return "正在处理…";
    case "cancelling":
      return "正在停止…";
    default:
      return null;
  }
}
