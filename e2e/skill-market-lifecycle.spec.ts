import { expect, test } from "@playwright/test";
import { installSkillMarketFixture } from "./fixtures/skill-market-api";

test("filters the Plaza, opens Detail, and visits My Skills", async ({ page }) => {
  await installSkillMarketFixture(page);
  await page.goto("/skills?mode=daily");

  await page.getByLabel("来源").selectOption("market");
  await expect(page.getByRole("heading", { name: "Market K03" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Built In K03" })).toHaveCount(0);
  await page.getByRole("button", { name: "查看 Market K03 详情" }).click();
  const detail = page.getByRole("dialog", { name: "Market K03" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("市场发布", { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "关闭 Skill 详情" }).click();
  await expect(detail).toHaveCount(0);
  await page.getByRole("link", { name: "我的" }).click();
  await expect(page.getByRole("heading", { name: "我的 Skill" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "我创建" })).toBeVisible();
  await expect(page.getByText("market-k03", { exact: true })).toBeVisible();
});

test("creates, edits, refreshes a conflict, saves, and submits a Draft", async ({ page }) => {
  await installSkillMarketFixture(page, { conflictOnFirstSave: true });
  await page.goto("/skills/drafts/new?mode=daily");

  await page.getByLabel("草稿名称").fill("market-k03");
  await page.getByLabel("ZIP 文件").setInputFiles({
    buffer: Buffer.from("PK\u0003\u0004fixture"),
    mimeType: "application/zip",
    name: "market-k03.zip",
  });
  await page.getByRole("button", { name: "创建草稿" }).click();
  await page.getByRole("link", { name: "打开草稿" }).click();
  await expect(page.getByRole("heading", { name: "market-k03" })).toBeVisible();

  await page.getByLabel("文件 JSON").fill(JSON.stringify({ "SKILL.md": "# First edit" }, null, 2));
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("heading", { name: "状态已发生变化" })).toBeVisible();
  await page.getByRole("button", { name: "刷新数据" }).click();
  await expect(page.getByText("状态：editing · 修订 r2 · 1 个文件", { exact: true })).toBeVisible();

  await page.getByLabel("文件 JSON").fill(JSON.stringify({ "SKILL.md": "# Saved edit" }, null, 2));
  await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByText("编辑状态：已与服务端同步")).toBeVisible();
  await page.getByRole("button", { name: "提交审核" }).click();
  await expect(page.getByText(/已提交审核：submission-k03/)).toBeVisible();
});

test("runs Creator from Requirement through Smoke and saves a Draft", async ({ page }) => {
  await installSkillMarketFixture(page);
  await page.goto("/skills/creator?mode=daily");

  await page.getByLabel("名称").fill("market-k03");
  await page.getByLabel("标题").fill("Market K03");
  await page.getByLabel("版本").fill("1.0.0");
  await page.getByLabel("需求描述").fill("Create deterministic lifecycle evidence for the daily scenario.");
  await page.getByRole("button", { name: "分析需求" }).click();
  await expect(page.getByText("需求边界已提取。")).toBeVisible();
  await page.getByRole("button", { name: "确认 Spec" }).click();
  await expect(page.getByRole("button", { name: "获取服务端推荐" })).toBeVisible();
  await page.getByRole("button", { name: "获取服务端推荐" }).click();
  await expect(page.getByText(/Reads the lifecycle input/)).toBeVisible();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "确认工具方案" }).click();
  await page.getByRole("button", { name: "生成 Bundle" }).click();
  await expect(page.getByText("2 个文件，0 条 diagnostics。")).toBeVisible();
  await page.getByRole("button", { name: "建议 Smoke Cases" }).click();
  await page.getByRole("button", { name: "执行 Smoke" }).click();
  await expect(page.getByLabel("Smoke Evidence")).toContainText("smoke-1：passed");
  await page.getByRole("button", { name: "保存草稿" }).click();
  await expect(page.getByText(/草稿 draft-k03 已保存/)).toBeVisible();
});

test("runs Trigger Test, approves, and restores authoritative review state after refresh", async ({ page }) => {
  await installSkillMarketFixture(page);
  await page.goto("/skills/review/submission-k03?mode=daily");

  await page.getByLabel("触发查询").fill("lifecycle");
  await page.getByRole("button", { name: "运行 Trigger Test" }).click();
  await expect(page.getByText("结果摘要：1/1 通过")).toBeVisible();
  await page.getByLabel("Definition 已核对").check();
  await page.getByLabel("Trigger 证据已核对").check();
  await page.getByLabel("Validator 已核对").check();
  await page.getByRole("button", { name: "批准" }).click();
  await expect(page.getByText(/状态：approved/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/状态：approved/)).toBeVisible();
  await expect(page.getByText("结果摘要：1/1 通过")).toBeVisible();
});

test("rejects a Submission with a required reviewer comment", async ({ page }) => {
  await installSkillMarketFixture(page);
  await page.goto("/skills/review/submission-k03?mode=daily");
  await page.getByLabel("审核评语").fill("Trigger boundary needs revision.");
  await page.getByRole("button", { name: "拒绝" }).click();
  await expect(page.getByText(/状态：rejected/)).toBeVisible();
});

test("downloads, enables, disables, withdraws, and revises a Publication", async ({ page }) => {
  const fixture = await installSkillMarketFixture(page, { initialSubmissionStatus: "published" });
  await page.goto("/skills/manage/publication-k03?mode=daily");
  await expect(page.getByRole("heading", { name: "market-k03" })).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 Artifact" }).click();
  await expect((await download).suggestedFilename()).toBe("market-k03-r1.zip");
  await expect(page.getByRole("status")).toContainText("下载已校验");

  await page.getByRole("button", { name: "安装并启用" }).click();
  await expect(page.getByRole("status")).toContainText("scenario:daily 已启用");
  await page.getByRole("button", { name: "停用 daily" }).click();
  await expect(page.getByRole("status")).toContainText("scenario:daily 已停用");
  expect(fixture.state.installationStatus).toBe("disabled");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "下架" }).click();
  await expect(page.getByRole("status")).toContainText("Publication 已下架");
  await page.getByRole("button", { name: "创建新修订" }).click();
  await expect(page.getByRole("status")).toContainText("已从 Publication publication-k03 创建新修订 r2");
});

test("recovers from publish success with installation failure without republishing", async ({ page }) => {
  const fixture = await installSkillMarketFixture(page, { initialSubmissionStatus: "approved", partialEnableFailure: true });
  await page.goto("/skills/review/submission-k03?mode=daily");
  await page.getByRole("button", { name: "发布并启用" }).click();
  await expect(page.getByText(/发布已完成，但启用失败/)).toBeVisible();
  await page.getByRole("link", { name: "前往发布管理继续启用" }).click();
  await page.getByRole("button", { name: "安装并启用" }).click();
  await expect(page.getByRole("status")).toContainText("scenario:daily 已启用");
  expect(fixture.calls.filter((call) => call.path.endsWith("/publish-and-enable"))).toHaveLength(1);
  expect(fixture.calls.filter((call) => call.path.endsWith("/installations"))).toHaveLength(1);
});

test("does not leak daily Creator description or requests into work mode", async ({ page }) => {
  const fixture = await installSkillMarketFixture(page);
  const secretDescription = "Sensitive daily-only requirement description.";
  await page.goto("/skills/creator?mode=daily");
  await page.getByLabel("需求描述").fill(secretDescription);
  await page.goto("/skills/creator?mode=work");
  await expect(page.getByRole("heading", { name: "办公场景暂未接入" })).toBeVisible();
  await expect(page.getByText(secretDescription)).toHaveCount(0);
  const stored = await page.evaluate(() => sessionStorage.getItem("skill-creator-safe-progress"));
  expect(stored).not.toContain(secretDescription);
  const before = fixture.calls.length;
  await page.waitForTimeout(100);
  expect(fixture.calls).toHaveLength(before);
  await page.goto("/skills/creator?mode=daily");
  await expect(page.getByLabel("需求描述")).toHaveValue("");
});
