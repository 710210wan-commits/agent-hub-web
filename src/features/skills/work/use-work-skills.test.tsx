import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import skillListFixture from "./fixtures/skill-list.json";
import skillMutationFixture from "./fixtures/skill-mutation.json";
import type { WorkSkillListEnvelope } from "./contracts";
import { useWorkSkills } from "./use-work-skills";
import { WorkSkillsApiError, type WorkSkillsApi } from "./work-api";

const envelope = skillListFixture as unknown as WorkSkillListEnvelope;
const mutationSkill = skillMutationFixture.data as WorkSkillListEnvelope["data"][number];

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    listSkills: vi.fn(async () => structuredClone(envelope)),
    setSkillEnabled: vi.fn(async () => structuredClone(mutationSkill)),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

describe("useWorkSkills", () => {
  it("首次加载从 loading 进入 success", async () => {
    const api = apiStub();
    const { result } = renderHook(() => useWorkSkills(api, 0));

    expect(result.current.state.kind).toBe("loading");
    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    if (result.current.state.kind === "success") {
      expect(result.current.state.skills).toHaveLength(3);
      expect(result.current.state.allowedAccessLevels).toEqual(["global", "department", "user"]);
    }
  });

  it("加载失败进入 error 并保留错误对象", async () => {
    const failure = new WorkSkillsApiError({
      code: "WORK_SKILLS_HTTP_500",
      message: "boom",
      retryable: true,
      status: 500,
      userMessage: "Work Skill 服务暂不可用，请稍后重试。",
    });
    const api = apiStub({ listSkills: vi.fn(async () => Promise.reject(failure)) });
    const { result } = renderHook(() => useWorkSkills(api, 0));

    await waitFor(() => expect(result.current.state.kind).toBe("error"));
    if (result.current.state.kind === "error") {
      expect(result.current.state.error.userMessage).toContain("暂不可用");
      expect(result.current.state.skills).toBeNull();
    }
  });

  it("refresh 期间保留旧数据并进入 refreshing", async () => {
    let resolveSecond: ((value: WorkSkillListEnvelope) => void) | null = null;
    const api = apiStub({
      listSkills: vi
        .fn()
        .mockImplementationOnce(async () => structuredClone(envelope))
        .mockImplementationOnce(
          () =>
            new Promise<WorkSkillListEnvelope>((resolve) => {
              resolveSecond = resolve;
            }),
        ),
    });
    const { result } = renderHook(() => useWorkSkills(api, 0));
    await waitFor(() => expect(result.current.state.kind).toBe("success"));

    act(() => result.current.refresh());
    expect(result.current.state.kind).toBe("refreshing");

    resolveSecond!(structuredClone(envelope));
    await waitFor(() => expect(result.current.state.kind).toBe("success"));
  });

  it("identityGeneration 变化时重新加载", async () => {
    const api = apiStub();
    const { result, rerender } = renderHook(
      ({ generation }) => useWorkSkills(api, generation),
      { initialProps: { generation: 0 } },
    );
    await waitFor(() => expect(result.current.state.kind).toBe("success"));
    expect(api.listSkills).toHaveBeenCalledTimes(1);

    rerender({ generation: 1 });
    await waitFor(() => expect(api.listSkills).toHaveBeenCalledTimes(2));
  });

  it("卸载时中止进行中的请求", async () => {
    let observedSignal: AbortSignal | null = null;
    const api = apiStub({
      listSkills: vi.fn((signal?: AbortSignal) => {
        observedSignal = signal ?? null;
        return new Promise<WorkSkillListEnvelope>(() => {});
      }),
    });
    const { unmount } = renderHook(() => useWorkSkills(api, 0));
    await waitFor(() => expect(observedSignal).not.toBeNull());
    unmount();
    expect((observedSignal as AbortSignal | null)?.aborted).toBe(true);
  });

  it("setEnabled 原地替换技能并保持其余数据", async () => {
    const api = apiStub();
    const { result } = renderHook(() => useWorkSkills(api, 0));
    await waitFor(() => expect(result.current.state.kind).toBe("success"));

    await act(async () => result.current.setEnabled("mysql-reporter", false));

    expect(api.setSkillEnabled).toHaveBeenCalledWith("mysql-reporter", false);
    if (result.current.state.kind === "success") {
      const target = result.current.state.skills.find((skill) => skill.slug === "mysql-reporter");
      expect(target?.enabled).toBe(false);
      expect(result.current.state.skills).toHaveLength(3);
    }
  });
});
