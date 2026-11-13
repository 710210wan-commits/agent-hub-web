import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import skillListFixture from "./fixtures/skill-list.json";
import type { WorkSkill } from "./contracts";
import { SkillPreviewDialog } from "./skill-preview-dialog";

const [builtin, upload, remoteReadonly] = skillListFixture.data as WorkSkill[];

describe("SkillPreviewDialog", () => {
  it("标题/来源在左、启停开关在右；卸载在左、关闭/去管理在右", () => {
    const { container } = render(
      <SkillPreviewDialog
        canManage
        markdown="# Hello"
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={upload}
      />,
    );

    const head = container.querySelector(".work-preview-head")!;
    const title = head.querySelector(".work-preview-title")!;
    const toggle = head.querySelector(".work-switch")!;
    expect(
      title.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(title as HTMLElement).getByRole("heading", { name: upload.name })).toHaveClass(
      "skill-detail-title",
    );
    expect(within(title as HTMLElement).getByText(upload.slug)).toHaveClass("skill-detail-slug");

    const footer = container.querySelector(".work-preview-footer")!;
    const left = footer.querySelector(".work-preview-footer-left")!;
    const right = footer.querySelector(".work-preview-footer-right")!;
    expect(left.textContent).toContain("卸载");
    expect(Array.from(right.querySelectorAll("button")).map((button) => button.textContent)).toEqual([
      "关闭",
      "去管理",
    ]);
  });

  it("渲染 SKILL.md markdown 内容", () => {
    const { container } = render(
      <SkillPreviewDialog
        canManage
        markdown={"# MySQL Reporter\n\n工作流程说明。"}
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={upload}
      />,
    );
    const body = container.querySelector(".work-preview-body")!;
    expect(within(body as HTMLElement).getByRole("heading", { level: 1, name: "MySQL Reporter" })).toBeInTheDocument();
    expect(within(body as HTMLElement).getByText("工作流程说明。")).toBeInTheDocument();
  });

  it("隐藏 SKILL.md frontmatter，只展示排版后的正文", () => {
    const { container } = render(
      <SkillPreviewDialog
        canManage
        markdown={"---\nname: workspace-files\nslug: workspace-files\ndescription: 管理交付物。\n---\n\n# 工作区文件管理\n\n## 背景\n\n正文说明。"}
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={upload}
      />,
    );

    const body = container.querySelector(".work-preview-body") as HTMLElement;
    expect(within(body).queryByText(/name: workspace-files/)).not.toBeInTheDocument();
    expect(within(body).getByRole("heading", { level: 1, name: "工作区文件管理" })).toBeInTheDocument();
    expect(within(body).getByRole("heading", { level: 2, name: "背景" })).toBeInTheDocument();
    expect(within(body).getByText("正文说明。")).toBeInTheDocument();
  });

  it("主次操作使用与 Daily 共用的按钮语义类", () => {
    render(
      <SkillPreviewDialog
        canManage
        markdown=""
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={upload}
      />,
    );

    expect(screen.getByRole("button", { name: "关闭" })).toHaveClass("skill-action-secondary");
    expect(screen.getByRole("button", { name: "去管理" })).toHaveClass("skill-action-primary");
  });

  it("禁用状态显示已禁用标签，开关可切换", () => {
    const onToggleEnabled = vi.fn();
    render(
      <SkillPreviewDialog
        canManage
        markdown=""
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={onToggleEnabled}
        onUninstall={vi.fn()}
        skill={{ ...upload, enabled: false }}
      />,
    );
    expect(screen.getByText("已禁用")).toBeInTheDocument();
    const toggle = screen.getByRole("switch");
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(onToggleEnabled).toHaveBeenCalledTimes(1);
  });

  it("内置 Skill 不显示卸载按钮", () => {
    render(
      <SkillPreviewDialog
        canManage
        markdown=""
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={builtin}
      />,
    );
    expect(screen.queryByRole("button", { name: "卸载" })).not.toBeInTheDocument();
  });

  it("can_manage 为 false 时开关禁用，且仍展示预览", () => {
    render(
      <SkillPreviewDialog
        canManage={remoteReadonly.can_manage}
        error="读取失败"
        markdown=""
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={remoteReadonly}
      />,
    );
    expect(screen.getByRole("switch")).toBeDisabled();
    expect(screen.getByText("读取失败")).toBeInTheDocument();
  });

  it("加载中显示读取状态", () => {
    render(
      <SkillPreviewDialog
        canManage
        loading
        markdown=""
        onClose={vi.fn()}
        onManage={vi.fn()}
        onToggleEnabled={vi.fn()}
        onUninstall={vi.fn()}
        skill={upload}
      />,
    );
    expect(screen.getByText("正在读取 SKILL.md…")).toBeInTheDocument();
  });
});
