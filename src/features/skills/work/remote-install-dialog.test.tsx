import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import installDraftUploadFixture from "./fixtures/install-draft-upload.json";
import remoteListFixture from "./fixtures/remote-list.json";
import remoteSearchFixture from "./fixtures/remote-search.json";
import type { WorkSkillInstallDraft } from "./contracts";
import { RemoteInstallDialog } from "./remote-install-dialog";
import type { WorkSkillsApi } from "./work-api";

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    listRemoteSkills: vi.fn(async () => remoteListFixture.data),
    searchRemoteSkills: vi.fn(async () => remoteSearchFixture.data),
    prepareRemoteSkills: vi.fn(async () => installDraftUploadFixture.data as WorkSkillInstallDraft),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

function renderDialog(api: WorkSkillsApi, onDraftsPrepared = vi.fn()) {
  return render(
    <RemoteInstallDialog api={api} onClose={vi.fn()} onDraftsPrepared={onDraftsPrepared} />,
  );
}

describe("RemoteInstallDialog", () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it("页签顺序为按仓库拉取、全局搜索发现；取消在左、解析并确认在右", () => {
    const { container } = renderDialog(apiStub());
    const tabs = Array.from(container.querySelectorAll(".work-tabs button"));
    expect(tabs.map((tab) => tab.textContent)).toEqual(["按仓库拉取", "全局搜索发现"]);
    const footer = container.querySelector(".work-modal-footer")!;
    expect(Array.from(footer.querySelectorAll("button")).map((button) => button.textContent)).toEqual([
      "取消",
      "解析并确认 (已选 0 个)",
    ]);
  });

  it("拉取单技能仓库时自动选中并可直接解析", async () => {
    const api = apiStub({
      listRemoteSkills: vi.fn(async () => [remoteListFixture.data[0]]),
    });
    const onDraftsPrepared = vi.fn();
    renderDialog(api, onDraftsPrepared);

    fireEvent.click(screen.getByRole("button", { name: "拉取技能" }));
    await waitFor(() => expect(api.listRemoteSkills).toHaveBeenCalledWith("https://github.com/anthropics/skills"));

    expect(screen.getByText("已选 1 / 共发现 1 个 skills。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "解析并确认 (已选 1 个)" }));
    await waitFor(() =>
      expect(api.prepareRemoteSkills).toHaveBeenCalledWith("https://github.com/anthropics/skills", ["skill-creator"]),
    );
    await waitFor(() => expect(onDraftsPrepared).toHaveBeenCalledTimes(1));
  });

  it("多技能仓库：全选/反选/清空更新计数，未选择时确认禁用", async () => {
    const api = apiStub();
    const onDraftsPrepared = vi.fn();
    renderDialog(api, onDraftsPrepared);

    fireEvent.click(screen.getByRole("button", { name: "拉取技能" }));
    await waitFor(() => expect(screen.getByText("已选 0 / 共发现 3 个 skills。")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "解析并确认 (已选 0 个)" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选 3 / 共发现 3 个 skills。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "反选" }));
    expect(screen.getByText("已选 0 / 共发现 3 个 skills。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "清空" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /docx/ }));
    expect(screen.getByRole("button", { name: "解析并确认 (已选 1 个)" })).toBeEnabled();
  });

  it("本地过滤只影响反选范围与展示，不改变已选项", async () => {
    const api = apiStub();
    renderDialog(api);

    fireEvent.click(screen.getByRole("button", { name: "拉取技能" }));
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /docx/ })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText("本地过滤检索"), { target: { value: "docx" } });
    expect(screen.queryByRole("checkbox", { name: /xlsx/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    expect(screen.getByText("已选 1 / 共发现 3 个 skills。")).toBeInTheDocument();
  });

  it("全局搜索：按来源分组解析并合并草稿", async () => {
    const prepare = vi.fn(async (source: string) => ({
      ...(installDraftUploadFixture.data as WorkSkillInstallDraft),
      draft_id: `draft-${source}`,
      source,
    }));
    const api = apiStub({ prepareRemoteSkills: prepare });
    const onDraftsPrepared = vi.fn();
    renderDialog(api, onDraftsPrepared);

    fireEvent.click(screen.getByRole("tab", { name: "全局搜索发现" }));
    fireEvent.change(screen.getByLabelText("搜索关键字"), { target: { value: "web" } });
    fireEvent.click(screen.getByRole("button", { name: "查找技能" }));
    await waitFor(() => expect(api.searchRemoteSkills).toHaveBeenCalledWith("web"));
    expect(screen.getByText("已选择 0 / 共找到 3 个 skills。")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全选" }));
    fireEvent.click(screen.getByRole("button", { name: "解析并确认 (已选 3 个)" }));
    await waitFor(() => expect(onDraftsPrepared).toHaveBeenCalledTimes(1));
    const drafts = onDraftsPrepared.mock.calls[0][0] as WorkSkillInstallDraft[];
    expect(drafts).toHaveLength(3);
    expect(prepare).toHaveBeenCalledTimes(3);
  });

  it("记录仓库历史并可清空", async () => {
    const api = apiStub();
    renderDialog(api);
    fireEvent.click(screen.getByRole("button", { name: "拉取技能" }));
    await waitFor(() => expect(api.listRemoteSkills).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "历史仓库" }));
    expect(screen.getByText("清空历史记录")).toBeInTheDocument();
    expect(globalThis.localStorage?.getItem("xiaozhi_remote_repo_history")).toContain(
      "https://github.com/anthropics/skills",
    );
  });

  it("解析失败显示错误且不触发草稿回调", async () => {
    const api = apiStub({
      listRemoteSkills: vi.fn(async () => Promise.reject(new Error("获取远程 Skills 失败"))),
    });
    const onDraftsPrepared = vi.fn();
    renderDialog(api, onDraftsPrepared);
    fireEvent.click(screen.getByRole("button", { name: "拉取技能" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("获取远程 Skills 失败"));
    expect(onDraftsPrepared).not.toHaveBeenCalled();
  });
});
