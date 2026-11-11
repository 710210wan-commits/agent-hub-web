import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import skillListFixture from "./fixtures/skill-list.json";
import { parseWorkSkillListEnvelope } from "./contracts";
import { buildShareConfigForAccessLevel, SkillSettings } from "./skill-settings";
import type { WorkSkillsApi } from "./work-api";

const envelope = parseWorkSkillListEnvelope(skillListFixture);
const builtinSkill = envelope.data[0];
const managedSkill = envelope.data[1];
const readonlySkill = envelope.data[2];

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    setSkillEnabled: vi.fn(async (_slug, enabled) => ({ ...managedSkill, enabled })),
    updateSkillShareConfig: vi.fn(async (_slug, shareConfig) => ({ ...managedSkill, share_config: shareConfig })),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

describe("SkillSettings", () => {
  it("切换范围时保留不可见数组，global 清空全部范围", () => {
    const original = {
      access_level: "department" as const,
      department_ids: [7, 9],
      user_uids: ["op-001", "op-002"],
    };
    expect(buildShareConfigForAccessLevel("department", original)).toEqual({
      access_level: "department",
      department_ids: [7, 9],
      user_uids: [],
    });
    expect(buildShareConfigForAccessLevel("user", original)).toEqual({
      access_level: "user",
      department_ids: [],
      user_uids: ["op-001", "op-002"],
    });
    expect(buildShareConfigForAccessLevel("global", original)).toEqual({
      access_level: "global",
      department_ids: [],
      user_uids: [],
    });
  });

  it("按 启用状态 → 生效范围 排列，并保存范围后保存启停", async () => {
    const api = apiStub();
    const onSkillChange = vi.fn();
    render(
      <SkillSettings
        allowedAccessLevels={envelope.allowed_access_levels}
        api={api}
        onSkillChange={onSkillChange}
        skill={managedSkill}
      />,
    );
    const cards = screen.getAllByTestId("work-settings-card");
    expect(cards.map((card) => card.getAttribute("data-kind"))).toEqual(["enabled", "scope"]);
    fireEvent.click(screen.getByRole("radio", { name: "全局共享" }));
    fireEvent.click(screen.getByRole("switch", { name: "启用状态" }));
    fireEvent.click(screen.getByRole("button", { name: "保存设置" }));
    await waitFor(() => expect(api.updateSkillShareConfig).toHaveBeenCalledWith("mysql-reporter", {
      access_level: "global",
      department_ids: [],
      user_uids: [],
    }));
    expect(api.setSkillEnabled).toHaveBeenCalledWith("mysql-reporter", false);
    expect(onSkillChange).toHaveBeenCalled();
  });

  it("内置范围固定 global 但允许启停；无管理权限时整体只读", () => {
    const { rerender } = render(
      <SkillSettings allowedAccessLevels={envelope.allowed_access_levels} api={apiStub()} skill={builtinSkill} />,
    );
    expect(screen.getByRole("radio", { name: "全局共享" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "全局共享" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "启用状态" })).not.toBeDisabled();

    rerender(
      <SkillSettings allowedAccessLevels={envelope.allowed_access_levels} api={apiStub()} skill={readonlySkill} />,
    );
    expect(screen.queryByRole("button", { name: "保存设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "启用状态" })).toBeDisabled();
  });
});
