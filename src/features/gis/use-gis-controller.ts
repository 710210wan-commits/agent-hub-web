"use client";

import { useCallback, useEffect, useReducer, useRef } from "react";

import type { GisStreamEvent, GisTransport } from "./contracts";
import { gisReducer, type GisAction } from "./gis-reducer";
import { createInitialGisState } from "./gis-state";
import type { MapRenderer } from "./map/map-renderer";

export function useGisController(transport: GisTransport) {
  const [state, dispatch] = useReducer(
    gisReducer,
    undefined,
    createInitialGisState,
  );
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const rendererRef = useRef<MapRenderer | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);
  const runIdRef = useRef<string | null>(null);
  const lastQueryRef = useRef<string | null>(null);

  const commit = useCallback((action: GisAction): boolean => {
    const previous = stateRef.current;
    const next = gisReducer(previous, action);
    if (next === previous) return false;
    stateRef.current = next;
    dispatch(action);

    const renderer = rendererRef.current;
    if (!renderer) return true;
    if (action.type === "applyGisUpdate") {
      const layer = next.layers.find((item) =>
        item.update.taskId === action.update.taskId &&
        item.update.key === action.update.key
      );
      if (layer) renderer.apply(layer.update);
    } else if (action.type === "resetForNewRun") {
      for (const layer of previous.layers) {
        if (!layer.kept) renderer.remove(layer.update.key);
      }
    } else if (action.type === "clearMap") {
      renderer.clear();
    }
    return true;
  }, []);

  const execute = useCallback(async (query: string) => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    runIdRef.current = null;
    lastQueryRef.current = query;
    commit({ type: "resetForNewRun" });

    try {
      const created = await transport.createRun(
        { profile: "standard", query },
        abortController.signal,
      );
      if (generation !== generationRef.current) {
        void transport.abortRun(created.runId).catch(() => undefined);
        return;
      }
      runIdRef.current = created.runId;
      commit({ type: "runConnected", runId: created.runId });

      for await (const event of transport.streamRun(
        created.runId,
        abortController.signal,
      )) {
        if (generation !== generationRef.current) return;
        applyEvent(event, commit);
      }
    } catch (error) {
      if (
        generation !== generationRef.current ||
        abortController.signal.aborted
      ) {
        return;
      }
      commit({
        type: "terminalFailure",
        message: error instanceof Error ? error.message : "任务执行失败，请稍后重试",
      });
    }
  }, [commit, transport]);

  const submit = useCallback((value: string): boolean => {
    const query = value.trim();
    if (
      !query ||
      ["submitting", "working"].includes(stateRef.current.status)
    ) {
      return false;
    }
    void execute(query);
    return true;
  }, [execute]);

  const stop = useCallback(() => {
    if (!["submitting", "working"].includes(stateRef.current.status)) return;
    generationRef.current += 1;
    abortControllerRef.current?.abort();
    const runId = runIdRef.current;
    runIdRef.current = null;
    commit({ type: "terminalStop", reason: "生成已停止" });
    if (runId) void transport.abortRun(runId).catch(() => undefined);
  }, [commit, transport]);

  const regenerate = useCallback(() => {
    if (
      lastQueryRef.current &&
      !["submitting", "working"].includes(stateRef.current.status)
    ) {
      void execute(lastQueryRef.current);
    }
  }, [execute]);

  const keepResult = useCallback(() => commit({ type: "keepResult" }), [commit]);
  const clearMap = useCallback(() => commit({ type: "clearMap" }), [commit]);

  const setRenderer = useCallback((renderer: MapRenderer | null) => {
    rendererRef.current = renderer;
    if (!renderer) return;
    renderer.clear();
    for (const layer of stateRef.current.layers) renderer.apply(layer.update);
  }, []);

  useEffect(() => () => {
    generationRef.current += 1;
    abortControllerRef.current?.abort();
  }, []);

  return {
    state,
    submit,
    stop,
    regenerate,
    keepResult,
    clearMap,
    setRenderer,
  };
}

function applyEvent(
  event: GisStreamEvent,
  commit: (action: GisAction) => boolean,
): void {
  switch (event.type) {
    case "run.connected":
      commit({ type: "runConnected", runId: event.runId });
      break;
    case "activity.update":
      commit({ type: "activityUpdate", label: event.label });
      break;
    case "gis.update":
      commit({ type: "applyGisUpdate", update: event.update });
      break;
    case "answer.done":
      commit({ type: "terminalSuccess", content: event.content ?? "" });
      break;
    case "run.failed":
      commit({ type: "terminalFailure", message: event.message });
      break;
    case "run.stopped":
      commit({ type: "terminalStop", reason: event.reason });
      break;
    case "run.disconnected":
      commit({ type: "terminalDisconnect", warning: event.warning });
      break;
    case "answer.delta":
      break;
  }
}
