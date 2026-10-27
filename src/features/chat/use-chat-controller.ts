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
  const lastInputRef = useRef<CreateChatRunInput | null>(null);
  const batchedDeltas = useBatchedDeltas((delta) =>
    dispatch({ type: "stream.event", event: { type: "answer.delta", delta } }),
  );

  const execute = useCallback(
    async (input: CreateChatRunInput, appendMessages: boolean) => {
      if (!transport.capabilities.selections && hasSelections(input.selection)) {
        dispatch({
          type: "stream.event",
          event: { type: "run.failed", message: "当前后端尚未接入所选能力" },
        });
        return;
      }

      lastInputRef.current = input;
      if (appendMessages) {
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
      } else {
        dispatch({ type: "run.retry" });
      }

      const abortController = new AbortController();
      abortControllerRef.current?.abort();
      abortControllerRef.current = abortController;

      try {
        const created = await transport.createRun(input, abortController.signal);
        runIdRef.current = created.runId;
        dispatch({
          type: "stream.event",
          event: { type: "run.connected", runId: created.runId },
        });
        for await (const event of transport.streamRun(
          created.runId,
          abortController.signal,
        )) {
          if (event.type === "answer.delta") {
            batchedDeltas.push(event.delta);
          } else {
            batchedDeltas.flush();
            dispatch({ type: "stream.event", event });
          }
        }
        batchedDeltas.flush();
      } catch (error) {
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
    (content: string) =>
      execute(
        {
          mode,
          content,
          selection: state.draftSelection,
        },
        true,
      ),
    [execute, mode, state.draftSelection],
  );

  const stop = useCallback(async () => {
    abortControllerRef.current?.abort();
    const runId = runIdRef.current;
    if (runId) await transport.abortRun(runId).catch(() => undefined);
    batchedDeltas.flush();
    dispatch({
      type: "stream.event",
      event: { type: "run.stopped", reason: "生成已停止" },
    });
  }, [batchedDeltas, transport]);

  const regenerate = useCallback(async () => {
    if (lastInputRef.current) await execute(lastInputRef.current, false);
  }, [execute]);

  const continueRun = useCallback(async () => {
    if (transport.capabilities.resume && lastInputRef.current) {
      await execute(lastInputRef.current, false);
    }
  }, [execute, transport.capabilities.resume]);

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
