import { expect, test } from "@playwright/test";

test("desktop GIS shows named slots", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/gis?mode=daily");
  await expect(page.getByRole("region", { name: "地图画布" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "图层面板" })).toBeVisible();
  await page.screenshot({ path: "e2e/screenshots/gis-placeholder.png" });
});

test("tablet collapses sidebar labels and mobile uses GIS notice", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto("/chat?mode=daily");
  await expect(page.locator(".sidebar-link-label").first()).toBeHidden();

  await page.setViewportSize({ width: 390, height: 780 });
  await page.goto("/gis?mode=daily");
  await expect(page.getByText("GIS 工作台暂仅支持桌面端")).toBeVisible();
  await expect(page.getByRole("region", { name: "地图画布" })).toBeHidden();
});
