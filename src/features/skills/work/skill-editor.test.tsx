import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import dependencyOptionsFixture from "./fixtures/dependency-options.json";
import skillFileFixture from "./fixtures/skill-file.json";
import skillListFixture from "./fixtures/skill-list.json";
import skillTreeFixture from "./fixtures/skill-tree.json";
import {
  parseDependencyOptions,
  parseWorkSkillFile,
  parseWorkSkillListEnvelope,
  parseWorkSkillTree,
} from "./contracts";
import { SkillEditor } from "./skill-editor";
import type { WorkSkillsApi } from "./work-api";

const envelope = parseWorkSkillListEnvelope(skillListFixture);

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    createSkillNode: vi.fn(async () => undefined),
    deleteSkill: vi.fn(async () => undefined),
    deleteSkillNode: vi.fn(async () => undefined),
    exportSkill: vi.fn(async () => ({ blob: new Blob(["zip"]), filename: "mysql-reporter.zip" })),
    getDependencyOptions: vi.fn(async () => parseDependencyOptions(dependencyOptionsFixture)),
    getSkillFile: vi.fn(async () => parseWorkSkillFile(skillFileFixture)),
    getSkillTree: vi.fn(async () => parseWorkSkillTree(skillTreeFixture)),
    listSkills: vi.fn(async () => envelope),
    setSkillEnabled: vi.fn(async (_slug, enabled) => ({ ...envelope.data[1], enabled })),
    updateSkillDependencies: vi.fn(async (_slug, dependencies) => ({ ...envelope.data[1], ...dependencies })),
    updateSkillFile: vi.fn(async () => undefined),
    updateSkillShareConfig: vi.fn(async (_slug, config) => ({ ...envelope.data[1], share_config: config })),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

describe("SkillEditor", () => {
  it("顶栏为 返回 → 名称/状态 → 导出/删除，页签顺序固定", async () => {
    render(<SkillEditor api={apiStub()} slug="mysql-reporter" />);
    const header = await screen.findByTestId("work-detail-header");
    expect(Array.from(header.children).map((node) => node.getAttribute("data-region"))).toEqual([
      "back",
      "identity",
      "actions",
    ]);
    const tabs = screen.getByRole("tablist", { name: "Skill 管理" });
    expect(within(tabs).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "代码管理",
      "生效范围",
      "依赖管理",
    ]);
  });

  it("导出使用上游文件名；删除需危险确认且单飞", async () => {
    const api = apiStub();
    const onDeleted = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const createObjectURL = vi.fn(() => "blob:skill");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    render(<SkillEditor api={api} onDeleted={onDeleted} slug="mysql-reporter" />);
    fireEvent.click(await screen.findByRole("button", { name: "导出" }));
    await waitFor(() => expect(api.exportSkill).toHaveBeenCalledWith("mysql-reporter"));
    expect(click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:skill");

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("dialog", { name: "删除 MySQL Reporter" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认删除 Skill" }));
    await waitFor(() => expect(api.deleteSkill).toHaveBeenCalledWith("mysql-reporter"));
    expect(onDeleted).toHaveBeenCalledWith("mysql-reporter");
    click.mockRestore();
  });

  it("只读 Skill 隐藏导出删除和全部写入口；缺失 Skill 显示可恢复错误", async () => {
    const { rerender } = render(<SkillEditor api={apiStub()} slug="meeting-notes" />);
    await screen.findByRole("heading", { name: "Meeting Notes" });
    expect(screen.queryByRole("button", { name: "导出" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "新建文件" })).not.toBeInTheDocument();

    rerender(<SkillEditor api={apiStub()} slug="missing-skill" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("未找到 Skill");
  });
});
