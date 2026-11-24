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
      name: `candidate-${String(index + 1).padStart(2, "0")}.pdf`,
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
  await page.getByRole("button", { name: "查看完整结果" }).click();
  await expect(page.getByText("失败 1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "取消筛选批次" }).click();
  await page.getByRole("button", { name: "继续未完成筛选" }).click();
  await page.getByRole("button", { name: "candidate-20" }).click();
  await page.getByRole("button", { name: "重试该候选人" }).click();
  await expect(page.getByText("推荐进入下一轮")).toBeVisible();
  await expect(page.getByText(/共 20 人 · 完成 20 · 失败 0/).first()).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole("button", { name: "关闭结果" }).click();
  await expect(page.getByText("PRIVATE_RESUME_BODY")).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("button", { name: "查看完整结果" })).toBeVisible();
  await page.goto("/history?mode=1");
  await expect(page.getByRole("heading", { name: "简历筛选助手" })).toBeVisible();
  await page.getByRole("list", { name: "简历筛选助手会话" }).getByRole("link", { name: /合成岗位筛选/ }).click();
  await expect(page.getByRole("textbox", { name: "标准标题" })).toHaveValue("高级 TypeScript");
  await expect(page.getByText("PRIVATE_RESUME_BODY")).toHaveCount(0);
});

async function login(page: Page) {
  await page.getByRole("textbox", { name: "用户名" }).fill("alice");
  await page.getByLabel("密码").fill("test-only-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page.getByText("用户 A", { exact: true })).toBeVisible();
}
