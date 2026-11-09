import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useBatchedDeltas } from "./use-batched-deltas";

describe("useBatchedDeltas", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("batches ordered fragments at the default 60ms interval", () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useBatchedDeltas(onFlush));

    act(() => {
      result.current.push("第一");
      result.current.push("第二");
      vi.advanceTimersByTime(59);
    });
    expect(onFlush).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1));
    expect(onFlush).toHaveBeenCalledOnce();
    expect(onFlush).toHaveBeenCalledWith("第一第二");
  });

  it("flushes pending text immediately for terminal events", () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useBatchedDeltas(onFlush));

    act(() => {
      result.current.push("未到定时器");
      result.current.flush();
    });

    expect(onFlush).toHaveBeenCalledWith("未到定时器");
  });

  it("drains a buffered SSE burst across visible batches before terminal events", async () => {
    const onFlush = vi.fn();
    const { result } = renderHook(() => useBatchedDeltas(onFlush));
    let drained!: Promise<void>;

    act(() => {
      for (let index = 0; index < 30; index += 1) {
        result.current.push(String(index));
      }
      drained = result.current.drain();
    });

    await act(async () => vi.runAllTimersAsync());
    await drained;

    expect(onFlush.mock.calls.length).toBeGreaterThan(1);
    expect(onFlush.mock.calls.flat().join("")).toBe(
      Array.from({ length: 30 }, (_, index) => String(index)).join(""),
    );
  });

  it("clamps custom intervals to 40-80ms", () => {
    const onFlush = vi.fn();
    const { result, rerender } = renderHook(
      ({ interval }) => useBatchedDeltas(onFlush, interval),
      { initialProps: { interval: 5 } },
    );

    act(() => {
      result.current.push("低限");
      vi.advanceTimersByTime(39);
    });
    expect(onFlush).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onFlush).toHaveBeenCalledWith("低限");

    onFlush.mockClear();
    rerender({ interval: 500 });
    act(() => {
      result.current.push("高限");
      vi.advanceTimersByTime(79);
    });
    expect(onFlush).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onFlush).toHaveBeenCalledWith("高限");
  });
});
