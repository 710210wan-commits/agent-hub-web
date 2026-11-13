import { expect, test } from "@playwright/test";

import { installGlobalAuthFixture } from "./fixtures/global-auth";
import { installWorkSkillsFixture } from "./fixtures/work-skills-api";

const catalogResponse = {
  generatedAt: "2026-11-07T00:00:00.000Z",
  items: [
    {
      allowedTools: ["gis-query"],
      availability: { installable: false, runnable: true },
      category: "other",
      categoryLabel: "内置 Skill",
      categorySource: "inferred",
      description: "查询日常目标",
      id: "built-in:alpha-query",
      loadedByScenarios: [{ id: "daily", name: "决策" }],
      name: "alpha-query",
      relativePath: "skills/alpha-query/SKILL.md",
      source: "built-in",
      sourceDir: "skills",
      status: "available",
      title: "Alpha Query",
    },
    {
      allowedTools: ["document-render"],
      availability: { installable: true, runnable: false },
      category: "other",
      categoryLabel: "市场发布",
      categorySource: "inferred",
      description: "生成报告草稿",
      id: "market:publication-1",
      loadedByScenarios: [],
      market: { publicationId: "publication-1", revision: 2 },
      name: "beta-report",
      relativePath: "market://publication-1/SKILL.md",
      source: "market",
      sourceDir: "Skill Market",
      status: "available",
      title: "Beta Report",
    },
  ],
  total: 2,
};

test("daily Skill plaza loads the catalog and filters it without another request", async ({ page }) => {
  let catalogRequests = 0;
  await installGlobalAuthFixture(page);
  await page.route("**/api/skill-market/catalog**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("mode")).toBe("daily");
    catalogRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(catalogResponse) });
  });

  await page.goto("/skills?mode=1");
  await expect(page.getByRole("heading", { name: "Alpha Query" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看 Alpha Query 详情" }).locator(".skill-card-icon")).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);
  const dailyPrimary = page.getByRole("link", { name: "创建 Skill" });
  await expect(dailyPrimary).toHaveCSS("background-color", "rgb(49, 94, 234)");
  await expect(page.getByRole("link", { name: "发布管理" })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  const requestsAfterInitialLoad = catalogRequests;

  await page.getByRole("searchbox", { name: "搜索 Skill" }).fill("document-render");
  await expect(page.getByRole("heading", { name: "Beta Report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alpha Query" })).toHaveCount(0);
  expect(catalogRequests).toBe(requestsAfterInitialLoad);

  await page.getByRole("searchbox", { name: "搜索 Skill" }).fill("");
  await page.getByRole("button", { name: "查看 Alpha Query 详情" }).click();
  const dialog = page.getByRole("dialog", { name: "Alpha Query" });
  await expect(dialog).toHaveClass(/skill-detail-dialog/);
  await expect(dialog.getByText("查询日常目标")).toBeVisible();
});

test("work Skill page never requests the daily catalog", async ({ page }) => {
  await installWorkSkillsFixture(page);
  let catalogRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skill-market/")) catalogRequests += 1;
  });

  await page.goto("/skills?mode=2");
  await expect(page.getByRole("searchbox", { name: "搜索技能" })).toBeVisible();
  await expect(page.getByRole("button", { name: "查看 MySQL Reporter 预览" })).toBeVisible();
  await page.waitForTimeout(100);
  expect(catalogRequests).toBe(0);
});
