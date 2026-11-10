"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
import {
  adaptDailySessionMessage,
  mergeDailySessionMessages,
  type DailySessionViewMessage,
} from "@/features/chat/session/daily-session-adapter";
import { useDailySessionAuth } from "@/features/chat/session/daily-session-auth-provider";
import {
  DailySessionClientError,
  type DailySessionClient,
} from "@/features/chat/transports/daily-session-client";
import type { ConversationMetadata } from "@/features/chat/transports/daily-session-contract";

import { MessageList } from "./message-list";

type ViewStatus = "loading" | "ready" | "not-found" | "error";

interface ViewState {
  key: string;
  status: ViewStatus;
  conversation?: ConversationMetadata;
  messages: DailySessionViewMessage[];
  nextCursor: string | null;
  errorMessage?: string;
  loadingEarlier: boolean;
  pageError?: string;
}

const loadFailure = "历史会话加载失败，请稍后重试";
const notFoundMessage = "会话不存在、已删除或不属于当前用户";

export function DailySessionView({
  client,
  conversationId,
}: {
  client: DailySessionClient;
  conversationId: string;
}) {
  const auth = useDailySessionAuth();
  const viewKey = `${auth.identityGeneration}:${conversationId}`;
  const [state, setState] = useState<ViewState>(() => initialState(viewKey));
  const activeKeyRef = useRef(viewKey);
  activeKeyRef.current = viewKey;
  const requestEpochRef = useRef(0);
  const snapshotControllerRef = useRef<AbortController | null>(null);
  const pageControllerRef = useRef<AbortController | null>(null);

  const applySnapshot = useCallback(
    async (key: string, epoch: number, controller: AbortController) => {
      try {
        const snapshot = await client.loadSnapshot(
          conversationId,
          controller.signal,
        );
        if (!isCurrent(key, epoch, controller, activeKeyRef, requestEpochRef)) {
          return;
        }
        setState({
          key,
          status: "ready",
          conversation: snapshot.conversation,
          messages: snapshot.messages.map(adaptDailySessionMessage),
          nextCursor: snapshot.nextCursor,
          loadingEarlier: false,
        });
      } catch (error) {
        if (!isCurrent(key, epoch, controller, activeKeyRef, requestEpochRef)) {
          return;
        }
        if (isAuthRequired(error)) {
          auth.invalidate();
          return;
        }
        if (isNotFound(error)) {
          setState({
            ...initialState(key),
            status: "not-found",
            errorMessage: notFoundMessage,
          });
          return;
        }
        setState({
          ...initialState(key),
          status: "error",
          errorMessage: safeError(error, loadFailure),
        });
      }
    },
    [auth, client, conversationId],
  );

  const startSnapshotLoad = useCallback(() => {
    snapshotControllerRef.current?.abort();
    pageControllerRef.current?.abort();
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    const key = activeKeyRef.current;
    const controller = new AbortController();
    snapshotControllerRef.current = controller;
    setState(initialState(key));
    void applySnapshot(key, epoch, controller);
  }, [applySnapshot]);

  useEffect(() => {
    snapshotControllerRef.current?.abort();
    pageControllerRef.current?.abort();
    requestEpochRef.current += 1;
    const epoch = requestEpochRef.current;
    const controller = new AbortController();
    snapshotControllerRef.current = controller;
    void applySnapshot(viewKey, epoch, controller);
    return () => {
      controller.abort();
      pageControllerRef.current?.abort();
      if (requestEpochRef.current === epoch) requestEpochRef.current += 1;
    };
  }, [applySnapshot, viewKey]);

  const visibleState = state.key === viewKey ? state : initialState(viewKey);

  const loadEarlier = useCallback(async () => {
    if (!visibleState.nextCursor || visibleState.loadingEarlier) return;
    pageControllerRef.current?.abort();
    const controller = new AbortController();
    pageControllerRef.current = controller;
    const key = viewKey;
    const epoch = requestEpochRef.current;
    const cursor = visibleState.nextCursor;
    setState((current) => ({
      ...current,
      loadingEarlier: true,
      pageError: undefined,
    }));
    try {
      const page = await client.loadMessages(
        conversationId,
        cursor,
        controller.signal,
      );
      if (!isCurrent(key, epoch, controller, activeKeyRef, requestEpochRef)) {
        return;
      }
      const older = page.messages.map(adaptDailySessionMessage);
      setState((current) => ({
        ...current,
        messages: mergeDailySessionMessages(older, current.messages),
        nextCursor: page.nextCursor,
        loadingEarlier: false,
      }));
    } catch (error) {
      if (!isCurrent(key, epoch, controller, activeKeyRef, requestEpochRef)) {
        return;
      }
      if (isAuthRequired(error)) {
        auth.invalidate();
        return;
      }
      setState((current) => ({
        ...current,
        loadingEarlier: false,
        pageError: safeError(error, "更早消息加载失败，请稍后重试"),
      }));
    }
  }, [auth, client, conversationId, viewKey, visibleState]);

  if (visibleState.status === "loading") {
    return <LoadingState label="正在加载历史会话…" />;
  }
  if (visibleState.status === "not-found") {
    return <ErrorState message={visibleState.errorMessage ?? notFoundMessage} />;
  }
  if (visibleState.status === "error") {
    return (
      <div className="daily-session-view-state">
        <ErrorState message={visibleState.errorMessage ?? loadFailure} />
        <button className="secondary-button" onClick={startSnapshotLoad} type="button">
          重试加载
        </button>
      </div>
    );
  }

  return (
    <section aria-label="日常历史会话" className="daily-session-view">
      <header className="daily-session-view-heading">
        <div>
          <span>持久会话</span>
          <h1>{visibleState.conversation?.title || "未命名会话"}</h1>
        </div>
        <p>当前为只读历史，会话发送将在后续阶段开放</p>
      </header>

      {visibleState.nextCursor ? (
        <button
          className="secondary-button daily-session-load-earlier"
          disabled={visibleState.loadingEarlier}
          onClick={() => void loadEarlier()}
          type="button"
        >
          {visibleState.loadingEarlier ? "正在加载…" : "加载更早消息"}
        </button>
      ) : null}
      {visibleState.pageError ? (
        <div className="inline-error" role="alert">
          {visibleState.pageError}
        </div>
      ) : null}
      {visibleState.messages.length === 0 ? (
        <EmptyState
          description="可从历史页切换其他会话"
          title="这个持久会话暂时没有消息"
        />
      ) : (
        <MessageList messages={visibleState.messages} />
      )}
    </section>
  );
}

function initialState(key: string): ViewState {
  return {
    key,
    status: "loading",
    messages: [],
    nextCursor: null,
    loadingEarlier: false,
  };
}

function isCurrent(
  key: string,
  epoch: number,
  controller: AbortController,
  activeKeyRef: React.RefObject<string>,
  epochRef: React.RefObject<number>,
): boolean {
  return (
    activeKeyRef.current === key &&
    epochRef.current === epoch &&
    !controller.signal.aborted
  );
}

function isAuthRequired(error: unknown): boolean {
  return (
    error instanceof DailySessionClientError && error.status === 401
  );
}

function isNotFound(error: unknown): boolean {
  return error instanceof DailySessionClientError && error.status === 404;
}

function safeError(error: unknown, fallback: string): string {
  return error instanceof DailySessionClientError ? error.message : fallback;
}
