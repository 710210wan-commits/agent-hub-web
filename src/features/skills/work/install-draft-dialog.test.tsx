import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import installDraftRemoteFixture from "./fixtures/install-draft-remote.json";
import installDraftUploadFixture from "./fixtures/install-draft-upload.json";
import {
  buildDraftShareConfig,
  InstallDraftDialog,
  mergeInstallDrafts,
} from "./install-draft-dialog";
import type { WorkSkillInstallDraft } from "./contracts";

const uploadDraft = installDraftUploadFixture.data as WorkSkillInstallDraft;
const remoteDraft = installDraftRemoteFixture.data as WorkSkillInstallDraft;

describe("mergeInstallDrafts", () => {
  it("合并多草稿并展平解析项", () => {
    const merged = mergeInstallDrafts([uploadDraft, remoteDraft]);
    expect(merged.draftIds).toHaveLength(2);
    expect(merged.sourceLabel).toBe("2 个来源");
    expect(merged.items).toHaveLength(3);
    expect(merged.allowedAccessLevels).toEqual(["global", "department", "user"]);
  });

  it("单草稿保留原始来源", () => {
    const merged = mergeInstallDrafts([uploadDraft]);
    expect(merged.sourceLabel).toBe("mysql-reporter.zip");
    expect(merged.items[0].sourceType).toBe("upload");
  });
});

describe("buildDraftShareConfig", () => {
  const merged = mergeInstallDrafts([uploadDraft]);

  it("user 级保留草稿默认 user_uids（仅自己语义）", () => {
    expect(buildDraftShareConfig("user", merged)).toEqual({
      access_level: "user",
      department_ids: [],
      user_uids: ["op-001"],
    });
  });

  it("department 级保留草稿默认 department_ids", () => {
    expect(buildDraftShareConfig("department", merged)).toEqual({
      access_level: "department",
      department_ids: [],
      user_uids: [],
    });
  });

  it("global 级提交空配置", () => {
    expect(buildDraftShareConfig("global", merged)).toEqual({
      access_level: "global",
      department_ids: [],
      user_uids: [],
    });
  });
});

describe("InstallDraftDialog", () => {
  it("按 来源 → 解析项 → 生效范围 的顺序渲染，取消在左、确认添加在右", () => {
    const { container } = render(
      <InstallDraftDialog drafts={[uploadDraft]} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );

    const source = screen.getByText("来源").closest(".work-draft-source");
    const items = container.querySelector(".work-draft-items");
    const scope = screen.getByText("生效范围");
    expect(
      source!.compareDocumentPosition(items!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      items!.compareDocumentPosition(scope) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const footer = container.querySelector(".work-modal-footer")!;
    const buttons = Array.from(footer.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["取消", "确认添加"]);
  });

  it("远程草稿失败项显示解析失败标签与错误文案", () => {
    render(<InstallDraftDialog drafts={[remoteDraft]} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByText("解析失败")).toBeInTheDocument();
    expect(screen.getByText(/拉取失败/)).toBeInTheDocument();
  });

  it("按 allowed_access_levels 过滤生效范围选项", () => {
    render(<InstallDraftDialog drafts={[remoteDraft]} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("radio", { name: "指定人" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "全局共享" })).not.toBeInTheDocument();
  });

  it("确认时提交选中等级对应的 share_config", () => {
    const onConfirm = vi.fn();
    render(<InstallDraftDialog drafts={[uploadDraft]} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("radio", { name: "全局共享" }));
    fireEvent.click(screen.getByRole("button", { name: "确认添加" }));
    expect(onConfirm).toHaveBeenCalledWith({
      access_level: "global",
      department_ids: [],
      user_uids: [],
    });
  });

  it("确认中禁用按钮并显示加载文案", () => {
    render(
      <InstallDraftDialog confirming drafts={[uploadDraft]} onCancel={vi.fn()} onConfirm={vi.fn()} />,
    );
    const confirmButton = screen.getByRole("button", { name: "正在添加…" });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  });
});
