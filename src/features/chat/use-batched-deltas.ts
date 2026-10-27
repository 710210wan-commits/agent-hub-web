import { useCallback, useEffect, useMemo, useRef } from "react";

export interface BatchedDeltaController {
  push: (delta: string) => void;
  flush: () => void;
}

export function useBatchedDeltas(
  onFlush: (content: string) => void,
  intervalMs = 60,
): BatchedDeltaController {
  const bufferRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFlushRef = useRef(onFlush);
  const delay = Math.min(80, Math.max(40, intervalMs));

  useEffect(() => {
    onFlushRef.current = onFlush;
  }, [onFlush]);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    const content = bufferRef.current;
    bufferRef.current = "";
    if (content) onFlushRef.current(content);
  }, []);

  const push = useCallback(
    (delta: string) => {
      bufferRef.current += delta;
      if (!timerRef.current) timerRef.current = setTimeout(flush, delay);
    },
    [delay, flush],
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return useMemo(() => ({ push, flush }), [flush, push]);
}
