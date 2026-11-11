import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import dependencyOptionsFixture from "./fixtures/dependency-options.json";
import skillListFixture from "./fixtures/skill-list.json";
import {
  parseDependencyOptions,
  parseWorkSkillListEnvelope,
} from "./contracts";
import { SkillDependencies } from "./skill-dependencies";
import type { WorkSkillsApi } from "./work-api";

const managedSkill = parseWorkSkillListEnvelope(skillListFixture).data[1];
const builtinSkill = parseWorkSkillListEnvelope(skillListFixture).data[0];

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    getDependencyOptions: vi.fn(async () => parseDependencyOptions(dependencyOptionsFixture)),
    updateSkillDependencies: vi.fn(async (_slug, dependencies) => ({ ...managedSkill, ...dependencies })),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

describe("SkillDependencies", () => {
  it("按 工具 → MCP → Skill 排列，过滤自身并保存三组选择", async () => {
    const api = apiStub();
    render(<SkillDependencies api={api} skill={managedSkill} />);
    const groups = await screen.findAllByTestId("work-dependency-group");
    expect(groups.map((group) => group.getAttribute("data-kind"))).toEqual(["tools", "mcps", "skills"]);
    expect(screen.queryByRole("checkbox", { name: "mysql-reporter" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Terminal" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "mysql-mcp" }));
    fireEvent.click(screen.getByRole("button", { name: "更新依赖" }));
    await waitFor(() => expect(api.updateSkillDependencies).toHaveBeenCalledWith("mysql-reporter", {
      mcp_dependencies: ["mysql-mcp"],
      skill_dependencies: ["workspace-files"],
      tool_dependencies: ["read_file"],
    }));
  });

  it("加载失败可重试；内置 Skill 依赖只读", async () => {
    const getDependencyOptions = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(parseDependencyOptions(dependencyOptionsFixture));
    const api = apiStub({ getDependencyOptions });
    const { rerender } = render(<SkillDependencies api={api} skill={managedSkill} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("加载依赖选项失败");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByRole("checkbox", { name: "Terminal" })).toBeInTheDocument();

    const builtinApi = apiStub();
    rerender(<SkillDependencies api={builtinApi} skill={builtinSkill} />);
    expect(screen.queryByRole("button", { name: "更新依赖" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "web_search" })).toBeDisabled());
    expect(builtinApi.getDependencyOptions).not.toHaveBeenCalled();
  });
});
