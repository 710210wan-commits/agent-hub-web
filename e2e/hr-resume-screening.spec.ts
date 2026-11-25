import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const FIXTURE_ORIGIN = "http://127.0.0.1:3203";

test.beforeEach(async ({ request }) => {
  const response = await request.post(`${FIXTURE_ORIGIN}/__reset`);
  expect(response.ok()).toBe(true);
});

test("Plaza → 1 JD/20 resumes → criteria → partial/cancel/Continue/retry → CSV → reload/history", async ({ page }) => {
  await page.goto("/assistants");
  await login(page);
  await page.getByRole("link", { name: /简历筛选助手/ }).click();

  await page.getByLabel("上传岗位描述").setInputFiles({
    name: "synthetic-jd.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic JD only\n"),
  });
  await page.getByLabel("上传候选人简历").setInputFiles(
    Array.from({ length: 20 }, (_, index) => ({
      name: index === 0
        ? `合成简历-${"LongCandidateFileName".repeat(5)}.pdf`
        : `candidate-${String(index + 1).padStart(2, "0")}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.7\nSynthetic candidate ${index + 1}; PRIVATE_RESUME_BODY\n`),
    })),
  );
  await expect(page.getByText("已就绪 21/21")).toBeVisible();
  await page.getByRole("button", { name: "开始筛选", exact: true }).click();
  await expect(page).toHaveURL(/assistant=resume-screening&conversation=/);

  await expect(page.getByRole("textbox", { name: "标准标题" })).toBeVisible();
  await page.getByRole("textbox", { name: "标准标题" }).fill("高级 TypeScript");
  await page.getByRole("button", { name: "保存标准" }).click();
  await expect(page.getByText("保存失败，请稍后重试")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "确认并开始筛选" })).toBeEnabled();
  await page.getByRole("button", { name: "确认并开始筛选" }).click();

  await expect(page.getByText("部分完成")).toBeVisible();
  const messageResult = page.getByRole("button", { name: "查看筛选结果", exact: true }).first();
  await messageResult.click();
  const drawer = page.getByRole("dialog", { name: "筛选结果" });
  const closeResult = drawer.getByRole("button", { name: "关闭结果" });
  await expect(closeResult).toBeInViewport();
  await expect(closeResult).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(messageResult).toBeFocused();

  await page.getByRole("button", { name: "查看完整结果" }).click();
  await expect(page.getByText("失败 1", { exact: true })).toBeVisible();
  const results = drawer.getByRole("navigation", { name: "候选人结果列表" });
  const recommended = results.getByRole("button", { name: "candidate-02 推荐 100 分" });
  const failed = results.getByRole("button", { name: "candidate-20 评估失败" });
  await expect(recommended).toBeVisible();
  await expect(failed).toBeVisible();
  const tierFilter = drawer.getByRole("button", { name: "推荐 19 人" });
  const recommendedBadge = recommended.getByText("推荐", { exact: true });
  await expect(recommendedBadge).toHaveCSS("background-color", "rgb(234, 247, 239)");
  await tierFilter.click();
  await expect(results.getByRole("button")).toHaveCount(19);
  await drawer.getByRole("button", { name: "全部候选人" }).click();
  await expect(results.getByRole("button")).toHaveCount(20);
  await page.getByRole("button", { name: "取消筛选批次" }).click();
  await page.getByRole("button", { name: "继续未完成筛选" }).click();
  await results.getByRole("button", { name: "candidate-20 评估失败", exact: true }).click();
  await page.getByRole("button", { name: "重试该候选人" }).click();
  await expect(page.getByText("推荐进入下一轮")).toBeVisible();
  await expect(page.getByText(/共 20 人 · 完成 20 · 失败 0/).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const csv = await readFile(await download.path());
  expect(csv.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
  expect(new TextDecoder("utf-8", { fatal: true }).decode(csv)).toBe(
    "candidateId,advisoryTier,decision,evidenceExcerpts\r\ncandidate,recommended,meets,合成项目证据\r\n",
  );
  await page.getByRole("button", { name: "关闭结果" }).click();
  await expect(page.getByText("PRIVATE_RESUME_BODY")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "查看完整结果" })).toBeVisible();
  await page.goto("/history?mode=1");
  await expect(page.getByRole("heading", { name: "简历筛选助手" })).toBeVisible();
  const recents = page.getByRole("list", { name: "最近会话" });
  const recentHr = recents.getByRole("link", { name: /合成岗位筛选/ });
  await expect(recentHr).toBeVisible();
  await expect(recentHr.locator("time[datetime]")).toBeVisible();
  await page.getByRole("list", { name: "简历筛选助手会话" }).getByRole("link", { name: /合成岗位筛选/ }).click();
  const criteria = page.getByRole("region", { name: "筛选标准" });
  await expect(criteria.getByText("高级 TypeScript", { exact: true })).toBeVisible();
  await expect(criteria.getByRole("textbox")).toHaveCount(0);
  await page.setViewportSize({ width: 860, height: 900 });
  await expect.poll(() => criteria.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const candidates = page.getByRole("region", { name: "候选人文件" });
  await expect(candidates.getByText("已解析").first()).toBeVisible();
  await expect.poll(() => candidates.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(page.getByText("PRIVATE_RESUME_BODY")).toHaveCount(0);

  await page.goto("/history?mode=1");
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除 合成岗位筛选" }).click();
  await expect(page.getByRole("list", { name: "简历筛选助手会话" })).toHaveCount(0);
  await expect(recents.getByRole("link", { name: /合成岗位筛选/ })).toHaveCount(0);
  await expect(recents.getByRole("link", { name: /Alice 历史会话/ })).toBeVisible();
});

test("adds only the 18th resume from the composer and keeps the cumulative 18 after reload", async ({ page }) => {
  await page.goto("/assistants");
  await login(page);
  await page.getByRole("link", { name: /简历筛选助手/ }).click();
  await page.getByLabel("上传岗位描述").setInputFiles({ name: "jd.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic JD\n") });
  await page.getByLabel("上传候选人简历").setInputFiles(Array.from({ length: 17 }, (_, index) => ({
    name: `resume-${index + 1}.pdf`, mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.7\nSynthetic resume ${index + 1}\n`),
  })));
  await expect(page.getByText("已就绪 18/18")).toBeVisible();
  await page.getByRole("button", { name: "开始筛选", exact: true }).click();
  await page.getByRole("button", { name: "确认并开始筛选" }).click();
  const composer = page.locator(".composer");
  const openSummary = composer.getByRole("button", { name: "查看累计结果" });
  const total = page.getByRole("dialog", { name: "累计筛选结果" });
  await expect(total).toHaveCount(0);
  await openSummary.click();
  await expect(total).toContainText("共 17 人");
  await page.keyboard.press("Escape");
  await expect(openSummary).toBeFocused();
  const addResumes = composer.getByRole("button", { name: "添加简历", exact: true });
  const screenNew = composer.getByRole("button", { name: "筛选新简历" });
  const send = composer.getByRole("button", { name: "发送" });
  await expect(addResumes).toBeVisible();
  await expect(composer.getByRole("button", { name: "更改 JD", exact: true })).toBeVisible();
  await expect(composer.getByText("活跃简历 17 份")).toBeVisible();
  await expect(composer.getByText("JD 1 份")).toBeVisible();
  const [addBounds, screenBounds, sendBounds] = await Promise.all([addResumes.boundingBox(), screenNew.boundingBox(), send.boundingBox()]);
  expect(addBounds!.x).toBeLessThan(screenBounds!.x);
  expect(sendBounds!.x - (screenBounds!.x + screenBounds!.width)).toBeGreaterThanOrEqual(0);
  expect(sendBounds!.x - (screenBounds!.x + screenBounds!.width)).toBeLessThanOrEqual(12);
  await composer.getByLabel("添加简历").setInputFiles({ name: "resume-18.pdf", mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nSynthetic resume 18\n") });
  await expect(composer.getByText("resume-18.pdf")).toBeVisible();
  await composer.getByRole("button", { name: "筛选新简历" }).click();
  await expect(page.getByRole("region", { name: "筛选结果摘要" })).toContainText("共 1 人 · 完成 1");
  await openSummary.click();
  await expect(total).toContainText("共 18 人 · 已评分 18");
  await expect(total).toContainText("推荐 18");
  await total.getByRole("button", { name: "暂不匹配 0" }).click();
  await expect(total.getByText("此档暂无候选人")).toBeVisible();
  await total.getByRole("button", { name: "当前名单" }).click();
  await expect(total).toContainText("共 18 人 · 已评分 18");
  const zipButton = total.getByRole("button", { name: "下载简历 ZIP" });
  await expect(zipButton).toBeEnabled();
  const zipRequest = page.waitForRequest(req => req.method() === "HEAD" && req.url().includes("/screening-summary/export.zip"));
  const zipDownload = page.waitForEvent("download");
  await zipButton.click();
  const zipUrl = new URL((await zipRequest).url());
  expect(Object.fromEntries(zipUrl.searchParams)).toEqual({ scope: "active", groupId: "a".repeat(64) });
  const archive = await zipDownload;
  expect(archive.suggestedFilename()).toBe("synthetic-resumes.zip");
  expect((await readFile(await archive.path())).readUInt32LE(0)).toBe(0x04034b50);
  await page.keyboard.press("Escape");
  await expect(composer.getByText("活跃简历 18 份")).toBeVisible();
  await composer.getByRole("textbox", { name: "消息" }).fill("汇总全部 18 人");
  await composer.getByRole("button", { name: "发送" }).click();
  await expect(page.getByText("共筛选 18 人，推荐 18 人。")).toBeVisible();
  await page.reload();
  await openSummary.click();
  await expect(total).toContainText("共 18 人 · 已评分 18");
  await total.getByRole("button", { name: "查看 resume-1 的筛选结果", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "筛选结果" });
  await expect(detail).toContainText("resume-1");
  await expect(total).toHaveCount(0);
  await detail.getByRole("button", { name: "返回累计结果" }).click();
  await expect(total).toContainText("共 18 人");
  await page.keyboard.press("Escape");
  await expect(openSummary).toBeFocused();
});

async function login(page: Page) {
  await page.getByRole("textbox", { name: "用户名" }).fill("alice");
  await page.getByLabel("密码").fill("test-only-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("用户 A", { exact: true })).toBeVisible();
}
