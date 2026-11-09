import { useCallback, useEffect, useMemo, useRef } from "react";

export interface BatchedDeltaController {
  push: (delta: string) => void;
  flush: () => void;
  drain: () => Promise<void>;
  reset: () => void;
}

const MAX_FRAGMENTS_PER_DRAIN_BATCH = 12;

export function useBatchedDeltas(
  onFlush: (content: string) => void,
  intervalMs = 60,
): BatchedDeltaController {
  const fragmentsRef = useRef<string[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drainingRef = useRef(false);
  const drainResolversRef = useRef<Array<() => void>>([]);
  const flushNextRef = useRef<() => void>(() => undefined);
  const onFlushRef = useRef(onFlush);
  const delay = Math.min(80, Math.max(40, intervalMs));

  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const resolveDrains = useCallback(() => {
    drainingRef.current = false;
    for (const resolve of drainResolversRef.current.splice(0)) resolve();
  }, []);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const content = fragmentsRef.current.splice(0).join("");
    if (content) onFlushRef.current(content);
    resolveDrains();
  }, [resolveDrains]);

  const schedule = useCallback(() => {
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => flushNextRef.current(), delay);
    }
  }, [delay]);

  const flushNext = useCallback(() => {
    timerRef.current = null;
    const fragmentCount = drainingRef.current
      ? MAX_FRAGMENTS_PER_DRAIN_BATCH
      : fragmentsRef.current.length;
    const content = fragmentsRef.current.splice(0, fragmentCount).join("");
    if (content) onFlushRef.current(content);
    if (fragmentsRef.current.length > 0) schedule();
    else resolveDrains();
  }, [resolveDrains, schedule]);

  useEffect(() => {
    flushNextRef.current = flushNext;
  }, [flushNext]);

  const push = useCallback(
    (delta: string) => {
      fragmentsRef.current.push(delta);
      schedule();
    },
    [schedule],
  );

  const drain = useCallback(() => {
    if (fragmentsRef.current.length === 0) return Promise.resolve();
    drainingRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const drained = new Promise<void>((resolve) => {
      drainResolversRef.current.push(resolve);
    });
    schedule();
    return drained;
  }, [schedule]);

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    fragmentsRef.current = [];
    resolveDrains();
  }, [resolveDrains]);

  useEffect(() => () => reset(), [reset]);

  return useMemo(
    () => ({ push, flush, drain, reset }),
    [drain, flush, push, reset],
  );
}
