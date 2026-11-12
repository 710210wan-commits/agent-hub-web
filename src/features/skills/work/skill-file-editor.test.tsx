import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import skillFileFixture from "./fixtures/skill-file.json";
import skillListFixture from "./fixtures/skill-list.json";
import skillTreeFixture from "./fixtures/skill-tree.json";
import {
  parseWorkSkillFile,
  parseWorkSkillListEnvelope,
  parseWorkSkillTree,
} from "./contracts";
import { SkillFileEditor } from "./skill-file-editor";
import type { WorkSkillsApi } from "./work-api";

const managedSkill = parseWorkSkillListEnvelope(skillListFixture).data[1];
const readonlySkill = parseWorkSkillListEnvelope(skillListFixture).data[2];

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    createSkillNode: vi.fn(async () => undefined),
    deleteSkillNode: vi.fn(async () => undefined),
    getSkillFile: vi.fn(async () => parseWorkSkillFile(skillFileFixture)),
    getSkillTree: vi.fn(async () => parseWorkSkillTree(skillTreeFixture)),
    updateSkillFile: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

describe("SkillFileEditor", () => {
  it("按 新建文件 → 新建目录 → 刷新 排列操作，并默认读取 SKILL.md", async () => {
    const api = apiStub();
    render(<SkillFileEditor api={api} skill={managedSkill} />);

    const actions = await screen.findByTestId("work-tree-actions");
    expect(within(actions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "新建文件",
      "新建目录",
      "刷新目录树",
    ]);
    expect(api.getSkillTree).toHaveBeenCalledWith("mysql-reporter", expect.any(AbortSignal));
    expect(api.getSkillFile).toHaveBeenCalledWith("mysql-reporter", "SKILL.md", expect.any(AbortSignal));
    const editor = await screen.findByRole("textbox", { name: "SKILL.md 内容" });
    expect((editor as HTMLTextAreaElement).value)
      .toContain("name: MySQL Reporter");
  });

  it("保存单飞，并可创建文件、目录和删除节点", async () => {
    let releaseSave!: () => void;
    const updateSkillFile = vi.fn(
      () => new Promise<void>((resolve) => { releaseSave = resolve; }),
    );
    const api = apiStub({ updateSkillFile });
    render(<SkillFileEditor api={api} skill={managedSkill} />);
    const editor = await screen.findByRole("textbox", { name: "SKILL.md 内容" });
    fireEvent.change(editor, { target: { value: "# changed" } });
    const save = screen.getByRole("button", { name: "保存文件" });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(updateSkillFile).toHaveBeenCalledTimes(1);
    expect(save).toBeDisabled();
    releaseSave();
    await waitFor(() => expect(save).not.toBeDisabled());

    fireEvent.click(screen.getByRole("button", { name: "新建文件" }));
    const fileDialog = screen.getByRole("dialog", { name: "新建文件" });
    fireEvent.change(within(fileDialog).getByLabelText("路径"), { target: { value: "scripts/new.py" } });
    fireEvent.change(within(fileDialog).getByLabelText("内容"), { target: { value: "print('ok')" } });
    fireEvent.click(within(fileDialog).getByRole("button", { name: "创建" }));
    await waitFor(() => expect(api.createSkillNode).toHaveBeenCalledWith(
      "mysql-reporter",
      { content: "print('ok')", is_dir: false, path: "scripts/new.py" },
    ));

    fireEvent.click(screen.getByRole("button", { name: "新建目录" }));
    const folderDialog = screen.getByRole("dialog", { name: "新建目录" });
    fireEvent.change(within(folderDialog).getByLabelText("路径"), { target: { value: "assets" } });
    fireEvent.click(within(folderDialog).getByRole("button", { name: "创建" }));
    await waitFor(() => expect(api.createSkillNode).toHaveBeenCalledWith(
      "mysql-reporter",
      { content: "", is_dir: true, path: "assets" },
    ));

    fireEvent.click(screen.getByRole("button", { name: "删除节点" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除节点" }));
    await waitFor(() => expect(api.deleteSkillNode).toHaveBeenCalledWith("mysql-reporter", "SKILL.md"));
  });

  it("拒绝越界路径；只读 Skill 不展示写操作", async () => {
    const api = apiStub();
    const { rerender } = render(<SkillFileEditor api={api} skill={managedSkill} />);
    await screen.findByRole("textbox", { name: "SKILL.md 内容" });
    fireEvent.click(screen.getByRole("button", { name: "新建文件" }));
    const dialog = screen.getByRole("dialog", { name: "新建文件" });
    fireEvent.change(within(dialog).getByLabelText("路径"), { target: { value: "../secret" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "创建" }));
    expect(api.createSkillNode).not.toHaveBeenCalled();
    expect(within(dialog).getByRole("alert")).toHaveTextContent("文件路径不合法");

    rerender(<SkillFileEditor api={api} skill={readonlySkill} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: "新建文件" })).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "保存文件" })).not.toBeInTheDocument();
  });
});
