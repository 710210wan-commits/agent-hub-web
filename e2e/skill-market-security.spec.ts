import { expect, test } from "@playwright/test";
import { installGlobalAuthFixture } from "./fixtures/global-auth";
import { installSkillMarketFixture } from "./fixtures/skill-market-api";

test("URL scope injection cannot expand the fixed daily installation target", async ({ page }) => {
  const fixture = await installSkillMarketFixture(page, { initialSubmissionStatus: "published" });
  await page.goto("/skills/manage/publication-k03?mode=daily&scopeType=agent&scopeId=work");
  await page.getByRole("button", { name: "安装并启用" }).click();
  const call = fixture.calls.find((item) => item.path.endsWith("/installations"));
  expect(call?.body).toEqual({ scopeId: "daily", scopeType: "scenario", status: "enabled" });
});

test("an invalid upstream response fails at the client boundary and offers recovery", async ({ page }) => {
  await installGlobalAuthFixture(page);
  await page.route("**/api/skill-market/catalog**", async (route) => {
    await route.fulfill({
      body: JSON.stringify({ generatedAt: "not-a-date", items: [], total: "zero" }),
      contentType: "application/json",
      status: 200,
    });
  });
  await page.goto("/skills?mode=daily");
  await expect(page.getByRole("heading", { name: "操作失败" })).toBeVisible();
  await expect(page.getByText("Skill Market 返回了无法识别的数据。")).toBeVisible();
  await expect(page.getByRole("button", { name: "重试" })).toBeVisible();
});
