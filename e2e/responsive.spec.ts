import { expect, test } from "@playwright/test";

test("tablet collapses sidebar labels and mobile opens navigation", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto("/chat?mode=daily");
  await expect(page.locator(".sidebar-link-label").first()).toBeHidden();

  await page.setViewportSize({ width: 390, height: 780 });
  const openButton = page.getByRole("button", { name: "打开导航" });
  await expect(openButton).toBeVisible();
  await openButton.click();
  await expect(page.getByRole("button", { name: "关闭导航" })).toBeVisible();
  await expect(page.locator(".sidebar")).toHaveClass(/is-mobile-open/);
});
