import { expect, test } from "@playwright/test";

import { installWorkSkillsFixture } from "./fixtures/work-skills-api";

test("Work Market completes preview, enable, manage, detail, and return journey in control order", async ({ page }) => {
  const fixture = await installWorkSkillsFixture(page);
  let dailyRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skill-market/")) dailyRequests += 1;
  });

  await page.goto("/skills?mode=work");
  await expect(page.getByRole("button", { name: "查看 MySQL Reporter 预览" })).toBeVisible();
  await expect(page.locator(".work-actions").locator("button, label")).toHaveText([
    "批量管理",
    "远程安装",
    "上传 Skill",
    "",
  ]);

  await page.getByRole("button", { name: "查看 MySQL Reporter 预览" }).click();
  const preview = page.getByRole("dialog");
  await expect(preview.getByRole("heading", { level: 2, name: "MySQL Reporter" })).toBeVisible();
  await expect(preview.locator("footer").getByRole("button")).toHaveText(["卸载", "关闭", "去管理"]);
  await preview.getByRole("switch", { name: "切换启用状态" }).click();
  await expect.poll(() => fixture.state.skills.find((skill) => skill.slug === "mysql-reporter")?.enabled).toBe(false);

  await preview.getByRole("button", { name: "去管理" }).click();
  await expect(page).toHaveURL(/\/skills\/mysql-reporter\?mode=work$/);
  await expect(page.getByRole("heading", { name: "MySQL Reporter" })).toBeVisible();
  await expect(page.getByRole("tablist", { name: "Skill 管理" }).getByRole("tab")).toHaveText([
    "代码管理",
    "生效范围",
    "依赖管理",
  ]);

  await page.getByRole("button", { name: /返回 Work Skill/ }).click();
  await expect(page).toHaveURL(/\/skills\?mode=work$/);
  await expect(page.getByRole("searchbox", { name: "搜索技能" })).toBeVisible();
  expect(dailyRequests).toBe(0);
});

test("Work Market handles upload, remote draft, and batch deletion", async ({ page }) => {
  const fixture = await installWorkSkillsFixture(page);
  await page.goto("/skills?mode=work");
  await expect(page.getByRole("button", { name: "查看 MySQL Reporter 预览" })).toBeVisible();

  await page.locator("#work-skill-upload").setInputFiles({
    buffer: Buffer.from("task-6-upload"),
    mimeType: "application/zip",
    name: "task6-skill.zip",
  });
  const uploadDraft = page.getByRole("dialog");
  await expect(uploadDraft.getByRole("heading", { name: "确认添加 Skill" })).toBeVisible();
  await uploadDraft.getByRole("radio", { name: "全局共享" }).check();
  await uploadDraft.getByRole("button", { name: "确认添加" }).click();
  await expect(page.getByText("已添加 1 个 Skill")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看 Uploaded Task 6 预览" })).toBeVisible();

  await page.getByRole("button", { name: "远程安装" }).click();
  const remote = page.getByRole("dialog");
  await remote.getByRole("textbox", { name: "来源仓库" }).fill("anthropics/skills");
  await remote.getByRole("button", { name: "拉取技能" }).click();
  await remote.getByRole("checkbox", { name: /skill-creator/ }).check();
  await remote.getByRole("button", { name: "解析并确认 \(已选 1 个\)" }).click();
  const remoteDraft = page.getByRole("dialog");
  await expect(remoteDraft.getByRole("heading", { name: "确认添加 Skill" })).toBeVisible();
  await remoteDraft.getByRole("button", { name: "确认添加" }).click();
  await expect(page.getByRole("button", { name: "查看 skill-creator 预览" })).toBeVisible();

  await page.getByRole("button", { name: "批量管理" }).click();
  await expect(page.locator(".work-actions").getByRole("button")).toHaveText([
    "全选",
    "反选",
    "清空",
    "批量删除 (0)",
    "退出管理",
  ]);
  await page.getByRole("checkbox", { name: "选择 MySQL Reporter" }).check();
  await page.getByRole("button", { name: "批量删除 \(1\)" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "确定删除" }).click();
  await expect(page.getByText("批量删除成功，已删除 1 个技能")).toBeVisible();
  await expect(page.getByRole("button", { name: "查看 MySQL Reporter 预览" })).toHaveCount(0);

  expect(fixture.calls.some((call) => call.path.endsWith("/api/skills/import/prepare"))).toBe(true);
  expect(fixture.calls.some((call) => call.path.endsWith("/api/skills/remote/prepare"))).toBe(true);
  expect(fixture.calls.some((call) => call.path.endsWith("/api/system/skills/delete-batch"))).toBe(true);
});

test("Work Editor saves file, scope, dependencies, and exports the archive", async ({ page }) => {
  const fixture = await installWorkSkillsFixture(page);
  await page.goto("/skills/mysql-reporter?mode=work");

  const editor = page.getByRole("textbox", { name: "SKILL.md 内容" });
  await expect(editor).toContainText("MySQL Reporter");
  await editor.fill("# MySQL Reporter\n\nSaved by Task 6.");
  await page.getByRole("button", { name: "保存文件" }).click();
  await expect(page.getByText("文件已保存")).toBeVisible();

  await page.getByRole("tab", { name: "生效范围" }).click();
  await page.getByRole("radio", { name: "全局共享" }).check();
  await page.getByRole("switch", { name: "启用状态" }).click();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.getByText("设置已保存")).toBeVisible();

  await page.getByRole("tab", { name: "依赖管理" }).click();
  await page.getByRole("checkbox", { name: "mysql-mcp" }).check();
  await page.getByRole("button", { name: "更新依赖" }).click();
  await expect(page.getByText("依赖已更新")).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出" }).click();
  await expect(page.getByText("导出已开始")).toBeVisible();
  expect((await download).suggestedFilename()).toBe("mysql-reporter-task6.zip");

  expect(fixture.state.files["mysql-reporter:SKILL.md"]).toContain("Saved by Task 6");
  expect(fixture.state.skills.find((skill) => skill.slug === "mysql-reporter")?.share_config.access_level).toBe("global");
  expect(fixture.state.skills.find((skill) => skill.slug === "mysql-reporter")?.mcp_dependencies).toContain("mysql-mcp");
});

test("Work Editor keeps a non-manageable Skill fully read-only", async ({ page }) => {
  await installWorkSkillsFixture(page);
  await page.goto("/skills/meeting-notes?mode=work");

  await expect(page.getByText("你可以查看并使用此 Skill，但没有管理权限。")).toBeVisible();
  await expect(page.getByRole("button", { name: "导出" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "删除" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建文件" })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "SKILL.md 内容" })).toHaveAttribute("readonly", "");

  await page.getByRole("tab", { name: "生效范围" }).click();
  await expect(page.getByRole("button", { name: "保存设置" })).toHaveCount(0);
  await expect(page.getByRole("switch", { name: "启用状态" })).toBeDisabled();
  await page.getByRole("tab", { name: "依赖管理" }).click();
  await expect(page.getByRole("button", { name: "更新依赖" })).toHaveCount(0);
});
