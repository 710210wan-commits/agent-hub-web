"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { AppMode } from "@/config/modes";

import type {
  ChatMessage,
  ChatSelectionSnapshot,
  CreateChatRunInput,
} from "./contracts/chat";
import { SessionNotFoundError } from "./contracts/session";
import type { ChatTransport } from "./contracts/transport";
import { chatReducer } from "./reducer/chat-reducer";
import { createInitialChatState } from "./reducer/chat-state";
import { useBatchedDeltas } from "./use-batched-deltas";

let localId = 0;

function createId(prefix: string): string {
  localId += 1;
  return `${prefix}-${Date.now()}-${localId}`;
}

function hasSelections(selection: ChatSelectionSnapshot): boolean {
  return (
    selection.knowledgeBaseIds.length > 0 ||
    selection.skillIds.length > 0 ||
    selection.mcpIds.length > 0
  );
}

export interface ChatControllerOptions {
  initialSessionId?: string;
  onSessionResolved?: (sessionId: string) => void;
  routeKey?: string;
}

export function useChatController(
  transport: ChatTransport,
  mode: AppMode,
  options: ChatControllerOptions = {},
) {
  const [state, dispatch] = useReducer(
    chatReducer,
    options.initialSessionId,
    createInitialChatState,
  );
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(options.initialSessionId ?? null);
  const notifiedSessionRef = useRef<string | null>(options.initialSessionId ?? null);
  const onSessionResolvedRef = useRef(options.onSessionResolved);
  const identityRef = useRef<{
    mode: AppMode;
    transport: ChatTransport;
  } | null>(null);
  const generationRef = useRef(0);
  const batchGenerationRef = useRef(0);
  const lastInputRef = useRef<CreateChatRunInput | null>(null);
  const batchedDeltas = useBatchedDeltas((delta) => {
    if (batchGenerationRef.current === generationRef.current) {
      dispatch({ type: "stream.event", event: { type: "answer.delta", delta } });
    }
  });

  useEffect(() => {
    onSessionResolvedRef.current = options.onSessionResolved;
  }, [options.onSessionResolved]);

  useEffect(() => {
    const previousIdentity = identityRef.current;
    const routeCaughtUpToResolvedSession = Boolean(
      previousIdentity &&
        previousIdentity.mode === mode &&
        previousIdentity.transport === transport &&
        options.initialSessionId &&
        options.initialSessionId === sessionIdRef.current,
    );
    identityRef.current = { mode, transport };
    if (routeCaughtUpToResolvedSession) return;

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    batchedDeltas.reset();
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    runIdRef.current = null;
    lastInputRef.current = null;
    sessionIdRef.current = options.initialSessionId ?? null;
    notifiedSessionRef.current = options.initialSessionId ?? null;
    dispatch({
      type: "session.reset",
      sessionId: options.initialSessionId,
    });

    if (!options.initialSessionId) return;
    if (!transport.sessions) {
      dispatch({
        type: "session.load.failed",
        message: "当前模式不支持历史会话",
      });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    dispatch({ type: "session.load.start" });
    void transport.sessions
      .loadSession(options.initialSessionId, abortController.signal)
      .then((loaded) => {
        if (generation !== generationRef.current || abortController.signal.aborted) return;
        sessionIdRef.current = loaded.session.id;
        dispatch({
          type: "session.load.success",
          sessionId: loaded.session.id,
          messages: loaded.messages,
        });
      })
      .catch((error: unknown) => {
        if (generation !== generationRef.current || abortController.signal.aborted) return;
        if (error instanceof SessionNotFoundError) {
          sessionIdRef.current = null;
          dispatch({ type: "session.load.not-found" });
          return;
        }
        dispatch({
          type: "session.load.failed",
          message: error instanceof Error ? error.message : "会话加载失败，请稍后重试",
        });
      });

    return () => abortController.abort();
  }, [
    batchedDeltas,
    mode,
    options.initialSessionId,
    options.routeKey,
    transport,
  ]);

  const execute = useCallback(
    async (
      input: CreateChatRunInput,
      behavior: "append" | "retry" | "continue",
      resumeFromRunId?: string,
    ) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      batchedDeltas.reset();
      const runInput: CreateChatRunInput = {
        ...input,
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
      };
      lastInputRef.current = runInput;
      if (behavior === "append") {
        dispatch({
          type: "message.submit",
          userMessage: {
            id: createId("user"),
            content: input.content,
            selection: input.selection,
            createdAt: Date.now(),
          },
          assistantMessageId: createId("assistant"),
        });
      } else if (behavior === "retry") {
        dispatch({ type: "run.retry" });
      } else {
        dispatch({ type: "run.continue" });
      }

      const abortController = new AbortController();
      abortControllerRef.current?.abort();
      abortControllerRef.current = abortController;

      try {
        const created =
          behavior === "continue" && resumeFromRunId && transport.resumeRun
            ? await transport.resumeRun(resumeFromRunId, abortController.signal)
            : await transport.createRun(runInput, abortController.signal);
        if (generation !== generationRef.current) return;
        if (created.sessionId && !sessionIdRef.current) {
          sessionIdRef.current = created.sessionId;
          dispatch({ type: "session.resolve", sessionId: created.sessionId });
          if (notifiedSessionRef.current !== created.sessionId) {
            notifiedSessionRef.current = created.sessionId;
            onSessionResolvedRef.current?.(created.sessionId);
          }
        }
        runIdRef.current = created.runId;
        dispatch({
          type: "stream.event",
          event: { type: "run.connected", runId: created.runId },
        });
        for await (const event of transport.streamRun(
          created.runId,
          abortController.signal,
        )) {
          if (generation !== generationRef.current) return;
          if (event.type === "answer.delta") {
            batchGenerationRef.current = generation;
            batchedDeltas.push(event.delta);
          } else {
            batchedDeltas.flush();
            if (generation !== generationRef.current) return;
            dispatch({ type: "stream.event", event });
          }
        }
        if (generation === generationRef.current) batchedDeltas.flush();
      } catch (error) {
        if (generation !== generationRef.current) return;
        batchedDeltas.flush();
        if (abortController.signal.aborted) return;
        dispatch({
          type: "stream.event",
          event: {
            type: "run.failed",
            message: error instanceof Error ? error.message : "任务执行失败，请稍后重试",
          },
        });
      }
    },
    [batchedDeltas, transport],
  );

  const submit = useCallback(
    (content: string) => {
      if (state.sessionStatus === "loading" || state.sessionStatus === "not-found" || state.sessionStatus === "failed") {
        return false;
      }
      const input = { mode, content, selection: state.draftSelection };
      if (!transport.capabilities.selections && hasSelections(input.selection)) {
        dispatch({
          type: "stream.event",
          event: { type: "run.failed", message: "当前后端尚未接入所选能力" },
        });
        return false;
      }
      void execute(input, "append");
      return true;
    },
    [
      execute,
      mode,
      state.draftSelection,
      state.sessionStatus,
      transport.capabilities.selections,
    ],
  );

  const stop = useCallback(() => {
    batchedDeltas.flush();
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    const runId = runIdRef.current;
    dispatch({
      type: "stream.event",
      event: { type: "run.stopped", reason: "生成已停止" },
    });
    if (runId) void transport.abortRun(runId).catch(() => undefined);
  }, [batchedDeltas, transport]);

  const regenerate = useCallback(async () => {
    if (lastInputRef.current) await execute(lastInputRef.current, "retry");
  }, [execute]);

  const continueRun = useCallback(async () => {
    const runId = runIdRef.current;
    if (transport.capabilities.resume && transport.resumeRun && lastInputRef.current && runId) {
      await execute(lastInputRef.current, "continue", runId);
    }
  }, [execute, transport]);

  const changeSelection = useCallback((selection: ChatSelectionSnapshot) => {
    dispatch({ type: "selection.change", selection });
  }, []);

  useEffect(() => () => abortControllerRef.current?.abort(), []);

  return {
    state,
    submit,
    stop,
    regenerate,
    continueRun,
    changeSelection,
  };
}

export function lastUserMessage(messages: ChatMessage[]): ChatMessage | undefined {
  return [...messages].reverse().find((message) => message.role === "user");
}
