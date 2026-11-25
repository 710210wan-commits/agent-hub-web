import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { HrScreeningClient } from "../api/hr-screening-client";
import { useHrScreeningState } from "./use-hr-screening-state";

afterEach(() => vi.useRealTimers());

it("refreshes a background batch after its chat turn stops and stops polling when the batch ends", async () => {
  vi.useFakeTimers();
  const state = { conversationId: "session", activeBatch: { batchId: "batch" } };
  const getState = vi.fn().mockResolvedValueOnce(state).mockResolvedValue({ ...state, activeBatch: null });
  const mocked = { getState } as unknown as HrScreeningClient;
  const { result } = renderHook(() => useHrScreeningState({ client: mocked, conversationId: "session", refreshToken: 0 }));
  await act(async () => {});
  expect(result.current.state?.activeBatch).not.toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(result.current.state?.activeBatch).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(getState).toHaveBeenCalledTimes(2);

});
