"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { AppMode } from "@/config/modes";

import type {
  ChatMessage,
  ChatSelectionSnapshot,
  CreateChatRunInput,
} from "./contracts/chat";
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

export function useChatController(transport: ChatTransport, mode: AppMode) {
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const batchGenerationRef = useRef(0);
  const lastInputRef = useRef<CreateChatRunInput | null>(null);
  const batchedDeltas = useBatchedDeltas((delta) => {
    if (batchGenerationRef.current === generationRef.current) {
      dispatch({ type: "stream.event", event: { type: "answer.delta", delta } });
    }
  });

  const execute = useCallback(
    async (
      input: CreateChatRunInput,
      behavior: "append" | "retry" | "continue",
      resumeFromRunId?: string,
    ) => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      batchedDeltas.reset();
      lastInputRef.current = input;
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
            : await transport.createRun(input, abortController.signal);
        if (generation !== generationRef.current) return;
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
    [execute, mode, state.draftSelection, transport.capabilities.selections],
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

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
    },
    [],
  );

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
