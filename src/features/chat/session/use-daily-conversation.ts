"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type {
  ConversationPublicEvent,
  ConversationSnapshot,
} from "@/features/chat/transports/daily-session-contract";

import {
  ConversationSequenceGapError,
  createInitialDailyConversationState,
  dailyConversationReducer,
  selectDailyConversationMessages,
  type DailyConversationAction,
  type DailyConversationState,
} from "./daily-conversation-reducer";
import {
  projectDailySessionMessages,
  type DailySessionViewMessage,
} from "./daily-session-adapter";

export interface UseDailyConversationOptions {
  client: DailySessionClient;
  identityGeneration: number;
  conversationId?: string;
  onConversationResolved?(conversationId: string): void;
  onAuthRequired?(): void;
  idFactory?: () => string;
}

export interface DailyConversationController {
  state: DailyConversationState;
  messages: DailySessionViewMessage[];
  conversationId?: string;
  submit(content: string): Promise<void>;
  retrySubmit(): Promise<void>;
  cancel(): Promise<void>;
  reconnect(): void;
  loadEarlier(): Promise<void>;
}

const disconnectedCode = "STREAM_DISCONNECTED";

export function useDailyConversation({
  client,
  identityGeneration,
  conversationId,
  onConversationResolved,
  onAuthRequired,
  idFactory = defaultIdFactory,
}: UseDailyConversationOptions): DailyConversationController {
  const initialKey = identityKey(identityGeneration, conversationId);
  const [state, setState] = useState<DailyConversationState>(() =>
    createInitialDailyConversationState(initialKey),
  );
  const stateRef = useRef(state);
  const generationRef = useRef(identityGeneration);
  const epochRef = useRef(0);
  const activeConversationRef = useRef<string | undefined>(conversationId);
  const workflowControllerRef = useRef<AbortController | null>(null);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);
  const createKeyRef = useRef<string | null>(null);
  const pendingRouteConversationRef = useRef<string | null>(null);
  const idFactoryRef = useRef(idFactory);
  const onResolvedRef = useRef(onConversationResolved);
  const onAuthRequiredRef = useRef(onAuthRequired);

  useEffect(() => {
    idFactoryRef.current = idFactory;
    onResolvedRef.current = onConversationResolved;
    onAuthRequiredRef.current = onAuthRequired;
  }, [idFactory, onAuthRequired, onConversationResolved]);

  const commit = useCallback((action: DailyConversationAction) => {
    const next = dailyConversationReducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
    return next;
  }, []);

  const isCurrent = useCallback(
    (
      generation: number,
      epoch: number,
      id: string,
      controller: AbortController,
    ) =>
      generationRef.current === generation &&
      epochRef.current === epoch &&
      activeConversationRef.current === id &&
      !controller.signal.aborted,
    [],
  );

  const applyEvent = useCallback(
    (event: ConversationPublicEvent) => commit({ type: "event.apply", event }),
    [commit],
  );

  const recoverRange = useCallback(
    async (
      id: string,
      targetSeq: string,
      generation: number,
      epoch: number,
      controller: AbortController,
    ): Promise<ConversationPublicEvent[]> => {
      const future: ConversationPublicEvent[] = [];
      let cursor = stateRef.current.appliedSeq;
      while (BigInt(cursor) < BigInt(targetSeq)) {
        const page = await client.listEvents(
          id,
          { afterSeq: cursor, limit: 200 },
          controller.signal,
        );
        if (!isCurrent(generation, epoch, id, controller)) return [];
        for (const item of page.events) {
          if (BigInt(item.eventSeq) <= BigInt(targetSeq)) applyEvent(item);
          else future.push(item);
        }
        if (BigInt(stateRef.current.appliedSeq) >= BigInt(targetSeq)) break;
        if (BigInt(page.nextAfterSeq) <= BigInt(cursor)) {
          throw new DailySessionClientError({
            code: "RESYNC_REQUIRED",
            message: "事件记录已过期，请重新同步会话",
          });
        }
        cursor = page.nextAfterSeq;
      }
      return future.sort((left, right) =>
        BigInt(left.eventSeq) < BigInt(right.eventSeq) ? -1 : 1,
      );
    },
    [applyEvent, client, isCurrent],
  );

  const installSnapshotHistory = useCallback(
    async (
      id: string,
      generation: number,
      epoch: number,
      controller: AbortController,
      snapshot: ConversationSnapshot,
    ) => {
      commit({ type: "snapshot.install", snapshot });
      const future = await recoverRange(
        id,
        snapshot.lastEventSeq,
        generation,
        epoch,
        controller,
      );
      for (const item of future) applyEvent(item);
      return snapshot.lastEventSeq;
    },
    [applyEvent, commit, recoverRange],
  );

  const repairGap = useCallback(
    async (
      id: string,
      receivedSeq: string,
      generation: number,
      epoch: number,
      controller: AbortController,
    ) => {
      const target = (BigInt(receivedSeq) - BigInt(1)).toString();
      await recoverRange(id, target, generation, epoch, controller);
    },
    [recoverRange],
  );

  const consumeStream = useCallback(
    async (
      id: string,
      afterSeq: string,
      generation: number,
      epoch: number,
      controller: AbortController,
    ) => {
      let resnapshotUsed = false;
      try {
        for await (const item of client.streamEvents(
          id,
          { afterSeq },
          controller.signal,
        )) {
          if (!isCurrent(generation, epoch, id, controller)) return;
          try {
            applyEvent(item);
          } catch (error) {
            if (!(error instanceof ConversationSequenceGapError)) throw error;
            while (true) {
              try {
                await repairGap(
                  id,
                  item.eventSeq,
                  generation,
                  epoch,
                  controller,
                );
                break;
              } catch (repairError) {
                if (!isResyncRequired(repairError) || resnapshotUsed) {
                  if (isResyncRequired(repairError)) {
                    commit({ type: "recovery.stale" });
                    return;
                  }
                  throw repairError;
                }
                resnapshotUsed = true;
                const snapshot = await client.loadSnapshot(
                  id,
                  controller.signal,
                );
                if (!isCurrent(generation, epoch, id, controller)) return;
                await installSnapshotHistory(
                  id,
                  generation,
                  epoch,
                  controller,
                  snapshot,
                );
              }
            }
            if (!isCurrent(generation, epoch, id, controller)) return;
            applyEvent(item);
          }
          if (item.type === "conversation.deleted") {
            controller.abort();
            return;
          }
        }
      } catch (error) {
        if (!isCurrent(generation, epoch, id, controller) || isAbortError(error)) {
          return;
        }
        if (isAuthRequired(error)) {
          onAuthRequiredRef.current?.();
          return;
        }
        if (isResyncRequired(error)) {
          commit({ type: "recovery.stale" });
          return;
        }
        if (isDisconnected(error)) {
          commit({ type: "stream.disconnected" });
          return;
        }
        commit({ type: "stream.disconnected" });
      }
    },
    [
      applyEvent,
      client,
      commit,
      installSnapshotHistory,
      isCurrent,
      repairGap,
    ],
  );

  const initialize = useCallback(
    async (
      id: string,
      generation: number,
      epoch: number,
      controller: AbortController,
    ) => {
      commit({ type: "loading" });
      let retriedSnapshot = false;
      while (true) {
        try {
          const snapshot = await client.loadSnapshot(id, controller.signal);
          if (!isCurrent(generation, epoch, id, controller)) return;
          const streamAfter = await installSnapshotHistory(
            id,
            generation,
            epoch,
            controller,
            snapshot,
          );
          if (!isCurrent(generation, epoch, id, controller)) return;
          void consumeStream(
            id,
            streamAfter,
            generation,
            epoch,
            controller,
          );
          return;
        } catch (error) {
          if (!isCurrent(generation, epoch, id, controller) || isAbortError(error)) {
            return;
          }
          if (isAuthRequired(error)) {
            onAuthRequiredRef.current?.();
            return;
          }
          if (isResyncRequired(error) && !retriedSnapshot) {
            retriedSnapshot = true;
            continue;
          }
          if (isResyncRequired(error)) {
            commit({ type: "recovery.stale" });
            return;
          }
          commit({ type: "notice.set", notice: safeMessage(error, "会话加载失败") });
          return;
        }
      }
    },
    [client, commit, consumeStream, installSnapshotHistory, isCurrent],
  );

  const startInitialization = useCallback(
    (id: string, generation: number, epoch: number) => {
      workflowControllerRef.current?.abort();
      const controller = new AbortController();
      workflowControllerRef.current = controller;
      void initialize(id, generation, epoch, controller);
    },
    [initialize],
  );

  useEffect(() => {
    if (
      conversationId &&
      generationRef.current === identityGeneration &&
      pendingRouteConversationRef.current === conversationId &&
      activeConversationRef.current === conversationId
    ) {
      pendingRouteConversationRef.current = null;
      return;
    }
    generationRef.current = identityGeneration;
    workflowControllerRef.current?.abort();
    mutationControllerRef.current?.abort();
    pageControllerRef.current?.abort();
    epochRef.current += 1;
    const epoch = epochRef.current;
    activeConversationRef.current = conversationId;
    createKeyRef.current = null;
    pendingRouteConversationRef.current = null;
    const initial = createInitialDailyConversationState(
      identityKey(identityGeneration, conversationId),
    );
    stateRef.current = initial;
    void Promise.resolve().then(() => {
      if (
        generationRef.current !== identityGeneration ||
        epochRef.current !== epoch
      ) {
        return;
      }
      setState(initial);
      if (conversationId) {
        startInitialization(conversationId, identityGeneration, epoch);
      }
    });
    return () => {
      if (epochRef.current !== epoch) return;
      workflowControllerRef.current?.abort();
      mutationControllerRef.current?.abort();
      pageControllerRef.current?.abort();
    };
  }, [
    client,
    conversationId,
    identityGeneration,
    startInitialization,
  ]);

  const performSubmit = useCallback(
    async (content: string, turnRequestId: string) => {
      mutationControllerRef.current?.abort();
      const controller = new AbortController();
      mutationControllerRef.current = controller;
      const generation = generationRef.current;
      let epoch = epochRef.current;
      let id = activeConversationRef.current;

      commit({
        type: "pending.start",
        pending: {
          clientRequestId: turnRequestId,
          content,
          status: "submitting",
          createdAt: Date.now(),
        },
      });

      try {
        if (!id) {
          const createRequestId = createKeyRef.current ?? idFactoryRef.current();
          createKeyRef.current = createRequestId;
          const created = await client.createConversation(
            {
              clientRequestId: createRequestId,
              title: compactTitle(content),
            },
            controller.signal,
          );
          if (
            generationRef.current !== generation ||
            epochRef.current !== epoch ||
            controller.signal.aborted
          ) {
            return;
          }
          id = created.conversation.conversationId;
          activeConversationRef.current = id;
          epochRef.current += 1;
          epoch = epochRef.current;
          createKeyRef.current = null;
          commit({
            type: "conversation.install",
            conversation: created.conversation,
            key: identityKey(generation, id),
          });
          pendingRouteConversationRef.current = id;
        }

        const receipt = await client.submitTurn(
          id,
          {
            clientRequestId: turnRequestId,
            input: { kind: "text", text: content },
          },
          controller.signal,
        );
        if (!isCurrent(generation, epoch, id, controller)) return;
        commit({ type: "receipt.apply", receipt });
        if (!workflowControllerRef.current) {
          startInitialization(id, generation, epoch);
        }
        if (pendingRouteConversationRef.current === id) {
          onResolvedRef.current?.(id);
        }
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) return;
        if (isAuthRequired(error)) {
          onAuthRequiredRef.current?.();
          return;
        }
        if (isTurnInProgress(error)) {
          commit({
            type: "pending.status",
            status: "blocked",
            notice: "当前会话已有任务运行中",
          });
          return;
        }
        if (isNetworkUnknown(error)) {
          commit({ type: "pending.status", status: "unknown" });
          return;
        }
        commit({
          type: "pending.status",
          status: "failed",
          notice: safeMessage(error, "发送失败，请稍后重试"),
        });
      }
    },
    [client, commit, isCurrent, startInitialization],
  );

  const submit = useCallback(
    async (content: string) => {
      const normalized = content.trim();
      if (!normalized) return;
      if (!activeConversationRef.current && !createKeyRef.current) {
        createKeyRef.current = idFactoryRef.current();
      }
      await performSubmit(normalized, idFactoryRef.current());
    },
    [performSubmit],
  );

  const retrySubmit = useCallback(async () => {
    const pending = stateRef.current.pendingSend;
    if (!pending) return;
    await performSubmit(pending.content, pending.clientRequestId);
  }, [performSubmit]);

  const cancel = useCallback(async () => {
    const id = activeConversationRef.current;
    const activeTurn = stateRef.current.activeTurn;
    if (!id || !activeTurn || isTerminal(activeTurn.status)) return;
    mutationControllerRef.current?.abort();
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    const generation = generationRef.current;
    const epoch = epochRef.current;
    commit({ type: "cancel.requested" });
    try {
      await client.cancelTurn(id, activeTurn.turnId, controller.signal);
      if (!isCurrent(generation, epoch, id, controller)) return;
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      if (isAuthRequired(error)) {
        onAuthRequiredRef.current?.();
        return;
      }
      commit({ type: "notice.set", notice: safeMessage(error, "停止失败") });
    }
  }, [client, commit, isCurrent]);

  const reconnect = useCallback(() => {
    const id = activeConversationRef.current;
    if (!id) return;
    const generation = generationRef.current;
    const epoch = epochRef.current;
    workflowControllerRef.current?.abort();
    const controller = new AbortController();
    workflowControllerRef.current = controller;
    if (
      stateRef.current.key !== identityKey(generation, id) ||
      !stateRef.current.conversation
    ) {
      void initialize(id, generation, epoch, controller);
      return;
    }
    commit({ type: "stream.reconnecting" });
    void consumeStream(
      id,
      stateRef.current.appliedSeq,
      generation,
      epoch,
      controller,
    );
  }, [commit, consumeStream, initialize]);

  const loadEarlier = useCallback(async () => {
    const id = activeConversationRef.current;
    const cursor = stateRef.current.nextCursor;
    if (!id || !cursor) return;
    pageControllerRef.current?.abort();
    const controller = new AbortController();
    pageControllerRef.current = controller;
    const generation = generationRef.current;
    const epoch = epochRef.current;
    try {
      const page = await client.loadMessages(id, cursor, controller.signal);
      if (!isCurrent(generation, epoch, id, controller)) return;
      commit({
        type: "messages.merge",
        messages: page.messages,
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      if (!isCurrent(generation, epoch, id, controller) || isAbortError(error)) {
        return;
      }
      if (isAuthRequired(error)) onAuthRequiredRef.current?.();
      else commit({ type: "notice.set", notice: "更早消息加载失败，请稍后重试" });
    }
  }, [client, commit, isCurrent]);

  const expectedKey = identityKey(
    identityGeneration,
    conversationId ?? state.conversation?.conversationId,
  );
  const visibleState =
    state.key === expectedKey
      ? state
      : createInitialDailyConversationState(expectedKey);
  const messages = useMemo(
    () =>
      projectDailySessionMessages(
        selectDailyConversationMessages(visibleState),
        visibleState.pendingSend,
      ),
    [visibleState],
  );

  return {
    state: visibleState,
    messages,
    conversationId:
      visibleState.conversation?.conversationId ?? conversationId,
    submit,
    retrySubmit,
    cancel,
    reconnect,
    loadEarlier,
  };
}

function identityKey(generation: number, conversationId?: string): string {
  return `${generation}:${conversationId ?? "new"}`;
}

function compactTitle(content: string): string {
  return Array.from(content.replace(/\s+/g, " ").trim()).slice(0, 32).join("");
}

function defaultIdFactory(): string {
  return crypto.randomUUID();
}

function isTerminal(status: string): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function isClientCode(error: unknown, code: string): boolean {
  return error instanceof DailySessionClientError && error.code === code;
}

function isAuthRequired(error: unknown): boolean {
  return isClientCode(error, "AUTH_REQUIRED");
}

function isResyncRequired(error: unknown): boolean {
  return isClientCode(error, "RESYNC_REQUIRED");
}

function isDisconnected(error: unknown): boolean {
  return isClientCode(error, disconnectedCode);
}

function isTurnInProgress(error: unknown): boolean {
  return isClientCode(error, "TURN_IN_PROGRESS");
}

function isNetworkUnknown(error: unknown): boolean {
  return isClientCode(error, "NETWORK_ERROR") || isDisconnected(error);
}

function safeMessage(error: unknown, fallback: string): string {
  if (!(error instanceof DailySessionClientError)) return fallback;
  if (error.status === 404) return "会话不存在、已删除或不属于当前用户";
  return error.message;
}
