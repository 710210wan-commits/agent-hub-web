import { expect, test } from "@playwright/test";

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
      loadedByScenarios: [{ id: "daily", name: "日常" }],
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
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/api/skill-market/catalog")) {
      await route.continue();
      return;
    }
    expect(url.searchParams.get("mode")).toBe("daily");
    catalogRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(catalogResponse) });
  });

  await page.goto("/skills?mode=daily");
  await expect(page.getByRole("heading", { name: "Alpha Query" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beta Report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "刷新" })).toHaveCount(0);

  await page.getByRole("searchbox", { name: "搜索 Skill" }).fill("document-render");
  await expect(page.getByRole("heading", { name: "Beta Report" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Alpha Query" })).toHaveCount(0);
  expect(catalogRequests).toBe(1);
});

test("work Skill placeholder never requests the daily catalog", async ({ page }) => {
  let catalogRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/skill-market/")) catalogRequests += 1;
  });

  await page.goto("/skills?mode=work");
  await expect(page.getByRole("heading", { name: "办公场景暂未接入" })).toBeVisible();
  await page.waitForTimeout(100);
  expect(catalogRequests).toBe(0);
});
