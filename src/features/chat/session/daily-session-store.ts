"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type { ConversationMetadata } from "@/features/chat/transports/daily-session-contract";

export type DailySessionStoreStatus = "loading" | "ready" | "error";
export type DailySessionCreateStatus = "idle" | "creating" | "unknown" | "error";
export type DailySessionCreateResult =
  | { status: "created"; conversationId: string }
  | { status: "unknown" }
  | { status: "failed" };

interface StoreState {
  owner: number;
  status: DailySessionStoreStatus;
  conversations: ConversationMetadata[];
  nextCursor: string | null;
  errorMessage?: string;
  isLoadingMore: boolean;
  createStatus: DailySessionCreateStatus;
  createError?: string;
  renamingId?: string;
  renameError?: string;
}

export interface DailySessionStore extends Omit<StoreState, "owner"> {
  loadMore(): Promise<void>;
  retry(): Promise<void>;
  createConversation(title?: string): Promise<DailySessionCreateResult>;
  retryCreate(): Promise<DailySessionCreateResult>;
  renameConversation(
    conversationId: string,
    title: string,
  ): Promise<"renamed" | "conflict" | "failed">;
  clearRenameError(): void;
}

interface DailySessionStoreOptions {
  requestIdFactory?: () => string;
  onAuthRequired?: () => void;
}

interface PendingCreate {
  clientRequestId: string;
  title?: string;
}

const LIST_ERROR = "日常历史加载失败，请稍后重试";
const CREATE_ERROR = "持久会话创建失败，请稍后重试";
const CREATE_UNKNOWN = "创建结果暂未确认，请使用原请求重试";
const RENAME_ERROR = "会话重命名失败，请稍后重试";
const RENAME_CONFLICT = "会话已被其他请求更新，已刷新最新内容";

export function useDailySessionStore(
  client: DailySessionClient,
  identityGeneration: number,
  options: DailySessionStoreOptions = {},
): DailySessionStore {
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  const requestIdFactoryRef = useRef(requestIdFactory);
  requestIdFactoryRef.current = requestIdFactory;
  const onAuthRequiredRef = useRef(options.onAuthRequired);
  onAuthRequiredRef.current = options.onAuthRequired;

  const [state, setState] = useState<StoreState>(() =>
    initialState(identityGeneration),
  );
  const generationRef = useRef(identityGeneration);
  generationRef.current = identityGeneration;
  const epochRef = useRef(0);
  const controllersRef = useRef(new Set<AbortController>());
  const pendingCreateRef = useRef<PendingCreate | null>(null);
  const failedCreateTitleRef = useRef<string | undefined>(undefined);

  const beginRequest = useCallback(() => {
    const controller = new AbortController();
    controllersRef.current.add(controller);
    return controller;
  }, []);

  const finishRequest = useCallback((controller: AbortController) => {
    controllersRef.current.delete(controller);
  }, []);

  const isCurrent = useCallback(
    (generation: number, epoch: number, signal: AbortSignal) =>
      generationRef.current === generation &&
      epochRef.current === epoch &&
      !signal.aborted,
    [],
  );

  const invalidateAuth = useCallback(() => {
    epochRef.current += 1;
    for (const controller of controllersRef.current) controller.abort();
    controllersRef.current.clear();
    pendingCreateRef.current = null;
    failedCreateTitleRef.current = undefined;
    setState(initialState(generationRef.current));
    onAuthRequiredRef.current?.();
  }, []);

  const loadPage = useCallback(
    async (input: {
      generation: number;
      epoch: number;
      cursor?: string;
      replace: boolean;
    }) => {
      const controller = beginRequest();
      try {
        const page = await client.listConversations(
          input.cursor === undefined ? {} : { cursor: input.cursor },
          controller.signal,
        );
        if (!isCurrent(input.generation, input.epoch, controller.signal)) return;
        setState((current) => {
          const base =
            current.owner === input.generation
              ? current
              : initialState(input.generation);
          return {
            ...base,
            status: "ready",
            conversations: input.replace
              ? page.conversations
              : mergeConversations(base.conversations, page.conversations),
            nextCursor: page.nextCursor,
            errorMessage: undefined,
            isLoadingMore: false,
          };
        });
      } catch (error) {
        if (!isCurrent(input.generation, input.epoch, controller.signal)) return;
        if (isAuthRequired(error)) {
          invalidateAuth();
          return;
        }
        setState((current) => ({
          ...(current.owner === input.generation
            ? current
            : initialState(input.generation)),
          status: input.replace ? "error" : current.status,
          errorMessage: safeMessage(error, LIST_ERROR),
          isLoadingMore: false,
        }));
      } finally {
        finishRequest(controller);
      }
    },
    [beginRequest, client, finishRequest, invalidateAuth, isCurrent],
  );

  useEffect(() => {
    const controllers = controllersRef.current;
    generationRef.current = identityGeneration;
    epochRef.current += 1;
    const epoch = epochRef.current;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    pendingCreateRef.current = null;
    failedCreateTitleRef.current = undefined;
    void loadPage({
      generation: identityGeneration,
      epoch,
      replace: true,
    });
    return () => {
      if (epochRef.current === epoch) epochRef.current += 1;
      for (const controller of controllers) controller.abort();
      controllers.clear();
    };
  }, [client, identityGeneration, loadPage]);

  const visibleState =
    state.owner === identityGeneration ? state : initialState(identityGeneration);

  const retry = useCallback(async () => {
    const generation = generationRef.current;
    const epoch = epochRef.current;
    setState(initialState(generation));
    await loadPage({ generation, epoch, replace: true });
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (!visibleState.nextCursor || visibleState.isLoadingMore) return;
    const generation = generationRef.current;
    const epoch = epochRef.current;
    const cursor = visibleState.nextCursor;
    setState((current) => ({ ...current, isLoadingMore: true, errorMessage: undefined }));
    await loadPage({ generation, epoch, cursor, replace: false });
  }, [loadPage, visibleState.isLoadingMore, visibleState.nextCursor]);

  const submitCreate = useCallback(
    async (pending: PendingCreate): Promise<DailySessionCreateResult> => {
      const generation = generationRef.current;
      const epoch = epochRef.current;
      const controller = beginRequest();
      pendingCreateRef.current = pending;
      setState((current) => ({
        ...(current.owner === generation ? current : initialState(generation)),
        createStatus: "creating",
        createError: undefined,
      }));
      try {
        const created = await client.createConversation(pending, controller.signal);
        if (!isCurrent(generation, epoch, controller.signal)) return { status: "failed" };
        pendingCreateRef.current = null;
        failedCreateTitleRef.current = undefined;
        setState((current) => ({
          ...current,
          conversations: mergeConversations(
            [created.conversation],
            current.conversations,
          ),
          createStatus: "idle",
          createError: undefined,
        }));
        return {
          status: "created",
          conversationId: created.conversation.conversationId,
        };
      } catch (error) {
        if (!isCurrent(generation, epoch, controller.signal)) return { status: "failed" };
        failedCreateTitleRef.current = pending.title;
        if (isCreateOutcomeUnknown(error)) {
          setState((current) => ({
            ...current,
            createStatus: "unknown",
            createError: CREATE_UNKNOWN,
          }));
          return { status: "unknown" };
        }
        if (isAuthRequired(error)) {
          invalidateAuth();
          return { status: "failed" };
        }
        pendingCreateRef.current = null;
        setState((current) => ({
          ...current,
          createStatus: "error",
          createError: safeMessage(error, CREATE_ERROR),
        }));
        return { status: "failed" };
      } finally {
        finishRequest(controller);
      }
    },
    [beginRequest, client, finishRequest, invalidateAuth, isCurrent],
  );

  const createConversation = useCallback(
    async (title?: string) => {
      const normalizedTitle = normalizeOptionalTitle(title);
      const pending = pendingCreateRef.current ?? {
        clientRequestId: requestIdFactoryRef.current(),
        ...(normalizedTitle === undefined ? {} : { title: normalizedTitle }),
      };
      return submitCreate(pending);
    },
    [submitCreate],
  );

  const retryCreate = useCallback(async () => {
    const pending = pendingCreateRef.current ?? {
      clientRequestId: requestIdFactoryRef.current(),
      ...(failedCreateTitleRef.current === undefined
        ? {}
        : { title: failedCreateTitleRef.current }),
    };
    return submitCreate(pending);
  }, [submitCreate]);

  const renameConversation = useCallback(
    async (conversationId: string, title: string) => {
      const currentConversation =
        state.owner === generationRef.current
          ? state.conversations.find((item) => item.conversationId === conversationId)
          : undefined;
      if (!currentConversation) return "failed" as const;
      const generation = generationRef.current;
      const epoch = epochRef.current;
      const controller = beginRequest();
      setState((current) => ({
        ...current,
        renamingId: conversationId,
        renameError: undefined,
      }));
      try {
        const renamed = await client.renameConversation(
          conversationId,
          { title: title.trim(), expectedVersion: currentConversation.version },
          controller.signal,
        );
        if (!isCurrent(generation, epoch, controller.signal)) return "failed" as const;
        setState((current) => ({
          ...current,
          conversations: mergeConversations(current.conversations, [renamed]),
          renamingId: undefined,
        }));
        return "renamed" as const;
      } catch (error) {
        if (!isCurrent(generation, epoch, controller.signal)) return "failed" as const;
        if (isAuthRequired(error)) {
          invalidateAuth();
          return "failed" as const;
        }
        if (isConflict(error)) {
          await loadPage({ generation, epoch, replace: true });
          if (generationRef.current === generation && epochRef.current === epoch) {
            setState((current) => ({
              ...current,
              renamingId: undefined,
              renameError: RENAME_CONFLICT,
            }));
          }
          return "conflict" as const;
        }
        setState((current) => ({
          ...current,
          renamingId: undefined,
          renameError: safeMessage(error, RENAME_ERROR),
        }));
        return "failed" as const;
      } finally {
        finishRequest(controller);
      }
    },
    [beginRequest, client, finishRequest, invalidateAuth, isCurrent, loadPage, state],
  );

  const clearRenameError = useCallback(() => {
    setState((current) => ({ ...current, renameError: undefined }));
  }, []);

  return {
    status: visibleState.status,
    conversations: visibleState.conversations,
    nextCursor: visibleState.nextCursor,
    errorMessage: visibleState.errorMessage,
    isLoadingMore: visibleState.isLoadingMore,
    createStatus: visibleState.createStatus,
    createError: visibleState.createError,
    renamingId: visibleState.renamingId,
    renameError: visibleState.renameError,
    loadMore,
    retry,
    createConversation,
    retryCreate,
    renameConversation,
    clearRenameError,
  };
}

function initialState(owner: number): StoreState {
  return {
    owner,
    status: "loading",
    conversations: [],
    nextCursor: null,
    isLoadingMore: false,
    createStatus: "idle",
  };
}

function mergeConversations(
  current: ConversationMetadata[],
  incoming: ConversationMetadata[],
): ConversationMetadata[] {
  const incomingById = new Map(incoming.map((item) => [item.conversationId, item]));
  const merged = current.map(
    (item) => incomingById.get(item.conversationId) ?? item,
  );
  const existing = new Set(current.map((item) => item.conversationId));
  for (const item of incoming) {
    if (!existing.has(item.conversationId)) merged.push(item);
  }
  return merged;
}

function normalizeOptionalTitle(title?: string): string | undefined {
  const normalized = title?.trim();
  return normalized ? normalized : undefined;
}

function isCreateOutcomeUnknown(error: unknown): boolean {
  return (
    error instanceof DailySessionClientError &&
    (error.code === "NETWORK_ERROR" || error.code === "INVALID_RESPONSE")
  );
}

function isAuthRequired(error: unknown): boolean {
  return error instanceof DailySessionClientError && error.status === 401;
}

function isConflict(error: unknown): boolean {
  return error instanceof DailySessionClientError && error.status === 409;
}

function safeMessage(error: unknown, fallback: string): string {
  return error instanceof DailySessionClientError ? error.message : fallback;
}
