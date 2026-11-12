import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import confirmResultsFixture from "./fixtures/confirm-results.json";
import installDraftUploadFixture from "./fixtures/install-draft-upload.json";
import remoteListFixture from "./fixtures/remote-list.json";
import skillFileFixture from "./fixtures/skill-file.json";
import skillListFixture from "./fixtures/skill-list.json";
import type { WorkSkill, WorkSkillListEnvelope } from "./contracts";
import { WorkSkillsApiError, type WorkSkillsApi } from "./work-api";
import { WorkSkillsPage } from "./work-skills-page";

const listEnvelope = skillListFixture as unknown as WorkSkillListEnvelope;

function apiStub(overrides: Partial<WorkSkillsApi> = {}): WorkSkillsApi {
  return {
    listSkills: vi.fn(async () => structuredClone(listEnvelope)),
    getSkillFile: vi.fn(async () => skillFileFixture.data),
    setSkillEnabled: vi.fn(async (slug: string, enabled: boolean) => ({
      ...(listEnvelope.data.find((skill) => skill.slug === slug) as WorkSkill),
      enabled,
    })),
    deleteSkill: vi.fn(async () => undefined),
    deleteSkillsBatch: vi.fn(async () => confirmResultsFixture.data),
    prepareSkillUpload: vi.fn(async () => installDraftUploadFixture.data),
    listRemoteSkills: vi.fn(async () => remoteListFixture.data),
    searchRemoteSkills: vi.fn(async () => []),
    prepareRemoteSkills: vi.fn(async () => installDraftUploadFixture.data),
    confirmInstallDraft: vi.fn(async () => confirmResultsFixture.data),
    discardInstallDraft: vi.fn(async () => undefined),
    exportSkill: vi.fn(),
    ...overrides,
  } as unknown as WorkSkillsApi;
}

async function renderPage(api: WorkSkillsApi, props: Partial<Parameters<typeof WorkSkillsPage>[0]> = {}) {
  const view = render(<WorkSkillsPage api={api} {...props} />);
  await waitFor(() => expect(screen.getByText("MySQL Reporter")).toBeInTheDocument());
  return view;
}

function groupTitles(): string[] {
  return Array.from(document.querySelectorAll(".work-group-title")).map(
    (element) => element.textContent ?? "",
  );
}

describe("WorkSkillsPage 结构与顺序", () => {
  it("工具栏顺序：搜索在左，右侧依次为批量管理、远程安装、上传 Skill、刷新", async () => {
    const api = apiStub();
    await renderPage(api);

    const shoulder = document.querySelector(".work-shoulder")!;
    const search = shoulder.querySelector(".work-search")!;
    expect(shoulder.firstElementChild).toBe(search);

    const actions = shoulder.querySelector(".work-actions")!;
    const buttons = Array.from(actions.querySelectorAll("button, label.work-button"));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "批量管理",
      "远程安装",
      "上传 Skill",
      "",
    ]);
    expect(actions.querySelector('button[aria-label="刷新 Skills"]')).not.toBeNull();
  });

  it("分组顺序为推荐、内置、上传的", async () => {
    await renderPage(apiStub());
    expect(groupTitles()).toEqual(["推荐", "内置", "上传的"]);
  });

  it("批量模式完全替换工具栏：全选、反选、清空、批量删除 (n)、退出管理", async () => {
    await renderPage(apiStub());
    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));

    const actions = document.querySelector(".work-actions")!;
    const buttons = Array.from(actions.querySelectorAll("button"));
    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      "全选",
      "反选",
      "清空",
      "批量删除 (0)",
      "退出管理",
    ]);
    expect(screen.getByRole("button", { name: "批量删除 (0)" })).toBeDisabled();
    expect(groupTitles()).toEqual(["内置", "上传的"]);
  });

  it("批量模式只为可管理且非内置的卡片显示复选", async () => {
    await renderPage(apiStub());
    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));

    expect(screen.queryByRole("checkbox", { name: "选择 Deep Research" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "选择 Meeting Notes" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "选择 MySQL Reporter" })).toBeInTheDocument();
  });

  it("卡片操作位：推荐为 +；已启用为勾选；禁用为 +；只读卡片无操作位", async () => {
    const api = apiStub({
      listSkills: vi.fn(async () => ({
        ...structuredClone(listEnvelope),
        data: structuredClone(listEnvelope.data).map((skill) =>
          skill.slug === "deep-research" ? { ...skill, enabled: false } : skill,
        ),
      })),
    });
    await renderPage(api);

    const recommendedCard = screen.getByText("skill-creator").closest(".work-card")!;
    expect(within(recommendedCard as HTMLElement).getByRole("button", { name: "安装推荐 Skill" })).toBeInTheDocument();

    const builtinCard = screen.getByText("Deep Research").closest(".work-card") as HTMLElement;
    expect(within(builtinCard).getByRole("button", { name: "启用 Skill" })).toBeInTheDocument();

    const uploadCard = screen.getByText("MySQL Reporter").closest(".work-card") as HTMLElement;
    const toggle = within(uploadCard).getByRole("button", { name: "禁用 Skill" });
    expect(toggle.querySelector(".work-status-check")).not.toBeNull();

    const readonlyCard = screen.getByText("Meeting Notes").closest(".work-card") as HTMLElement;
    expect(readonlyCard.querySelector(".work-status-action")).toBeNull();
  });

  it("无可删除技能时批量管理按钮禁用", async () => {
    const api = apiStub({
      listSkills: vi.fn(async () => ({
        ...structuredClone(listEnvelope),
        data: structuredClone(listEnvelope.data).map((skill) => ({
          ...skill,
          can_manage: false,
        })),
      })),
    });
    await renderPage(api);
    expect(screen.getByRole("button", { name: "批量管理" })).toBeDisabled();
  });
});

describe("WorkSkillsPage 交互", () => {
  it("搜索过滤分组并显示空态文案", async () => {
    await renderPage(apiStub());
    fireEvent.change(screen.getByLabelText("搜索技能"), { target: { value: "不存在的关键词" } });
    expect(screen.getByText("没有匹配的 Skill")).toBeInTheDocument();
    expect(screen.getByText(/换个关键词试试/)).toBeInTheDocument();
  });

  it("启停：调用 API、更新卡片并提示", async () => {
    const api = apiStub();
    await renderPage(api);

    const uploadCard = screen.getByText("MySQL Reporter").closest(".work-card") as HTMLElement;
    fireEvent.click(within(uploadCard).getByRole("button", { name: "禁用 Skill" }));
    await waitFor(() => expect(api.setSkillEnabled).toHaveBeenCalledWith("mysql-reporter", false));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Skill 已禁用"));
    expect(screen.getAllByRole("button", { name: "启用 Skill" }).length).toBeGreaterThan(0);
  });

  it("预览弹窗：读取 SKILL.md、footer 顺序正确、去管理触发回调", async () => {
    const api = apiStub();
    const onManageSkill = vi.fn();
    await renderPage(api, { onManageSkill });

    fireEvent.click(screen.getAllByRole("button", { name: /查看 MySQL Reporter 预览/ })[0]);
    await waitFor(() => expect(api.getSkillFile).toHaveBeenCalledWith("mysql-reporter", "SKILL.md"));

    const dialog = await screen.findByRole("dialog");
    const buttons = Array.from(dialog.querySelectorAll(".work-preview-footer button"));
    expect(buttons.map((button) => button.textContent)).toEqual(["卸载", "关闭", "去管理"]);

    fireEvent.click(screen.getByRole("button", { name: "去管理" }));
    expect(onManageSkill).toHaveBeenCalledWith("mysql-reporter");
  });

  it("内置 Skill 预览不显示卸载", async () => {
    await renderPage(apiStub());
    fireEvent.click(screen.getAllByRole("button", { name: /查看 Deep Research 预览/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "卸载" })).not.toBeInTheDocument();
  });

  it("批量删除流程：确认弹窗文案、确认后调用 API 并退出管理", async () => {
    const api = apiStub();
    await renderPage(api);

    fireEvent.click(screen.getByRole("button", { name: "批量管理" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "选择 MySQL Reporter" }));
    expect(screen.getByRole("button", { name: "批量删除 (1)" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "批量删除 (1)" }));
    expect(screen.getByText("确定要批量删除选中的技能吗？")).toBeInTheDocument();
    expect(screen.getByText(/您已选中了 1 个技能/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确定删除" }));
    await waitFor(() => expect(api.deleteSkillsBatch).toHaveBeenCalledWith(["mysql-reporter"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "批量管理" })).toBeInTheDocument());
  });

  it("卸载流程：预览内卸载需确认", async () => {
    const api = apiStub();
    await renderPage(api);

    fireEvent.click(screen.getAllByRole("button", { name: /查看 MySQL Reporter 预览/ })[0]);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "卸载" }));

    expect(screen.getByText("卸载 MySQL Reporter")).toBeInTheDocument();
    const confirmDialog = document.querySelector(".work-confirm-dialog") as HTMLElement;
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "卸载" }));
    await waitFor(() => expect(api.deleteSkill).toHaveBeenCalledWith("mysql-reporter"));
  });

  it("上传流程：非法文件名提示，合法文件进入草稿确认", async () => {
    const api = apiStub();
    await renderPage(api);

    const input = document.querySelector<HTMLInputElement>("#work-skill-upload")!;
    fireEvent.change(input, { target: { files: [new File(["x"], "notes.md")] } });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("仅支持上传 .zip 文件或 SKILL.md 文件"));
    expect(api.prepareSkillUpload).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { files: [new File(["x"], "skill.zip")] } });
    await waitFor(() => expect(api.prepareSkillUpload).toHaveBeenCalled());
    expect(await screen.findByRole("dialog")).toHaveTextContent("确认添加 Skill");
  });

  it("推荐安装：拉取并解析进入草稿确认", async () => {
    const api = apiStub({
      listRemoteSkills: vi.fn(async () => [remoteListFixture.data[0]]),
    });
    await renderPage(api);

    fireEvent.click(screen.getAllByRole("button", { name: "安装推荐 Skill" })[0]);
    await waitFor(() => expect(api.listRemoteSkills).toHaveBeenCalled());
    await waitFor(() => expect(api.prepareRemoteSkills).toHaveBeenCalled());
    expect(await screen.findByRole("dialog")).toHaveTextContent("确认添加 Skill");
  });

  it("草稿确认后刷新列表并提示数量", async () => {
    const api = apiStub();
    await renderPage(api);

    fireEvent.change(document.querySelector<HTMLInputElement>("#work-skill-upload")!, {
      target: { files: [new File(["x"], "skill.zip")] },
    });
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "确认添加" }));

    await waitFor(() => expect(api.confirmInstallDraft).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("添加完成：成功 1 个，失败 1 个"),
    );
    expect(api.listSkills).toHaveBeenCalledTimes(2);
  });

  it("identityGeneration 变化时重新加载并重置页面状态", async () => {
    const api = apiStub();
    const { rerender } = render(<WorkSkillsPage api={api} identityGeneration={0} />);
    await waitFor(() => expect(api.listSkills).toHaveBeenCalledTimes(1));

    rerender(<WorkSkillsPage api={api} identityGeneration={1} />);
    await waitFor(() => expect(api.listSkills).toHaveBeenCalledTimes(2));
  });

  it("列表错误时展示错误文案", async () => {
    const api = apiStub({
      listSkills: vi.fn(async () =>
        Promise.reject(
          new WorkSkillsApiError({
            code: "WORK_SKILLS_SESSION_INVALID",
            message: "登录状态已失效，请重新登录。",
            retryable: false,
            status: 401,
            userMessage: "登录状态已失效，请重新登录后重试。",
          }),
        ),
      ),
    });
    render(<WorkSkillsPage api={api} />);
    await waitFor(() =>
      expect(screen.getByText(/登录状态已失效，请重新登录后重试。/)).toBeInTheDocument(),
    );
  });
});
