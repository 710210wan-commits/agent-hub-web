import { expect, test } from "@playwright/test";
import { installGlobalAuthFixture } from "./fixtures/global-auth";

for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 720 }]) {
  for (const kind of ["skills", "mcp"] as const) {
    test(`${kind} keeps the account visible while long content scrolls at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await installGlobalAuthFixture(page);
      await page.route("**/api/skill-market/catalog**", async route => {
        const items = Array.from({ length: 20 }, (_, i) => ({
          id: `built-in:layout-skill-${i}`, name: `layout-skill-${i}`, title: `长列表技能 ${i}`,
          description: "用于验证长内容布局", source: "built-in", sourceDir: "skills",
          relativePath: `skills/layout-skill-${i}/SKILL.md`, allowedTools: [],
          loadedByScenarios: [{ id: "daily", name: "日常" }], status: "available",
          availability: { runnable: true, installable: false }, category: "other",
          categoryLabel: "内置 Skill", categorySource: "inferred",
        }));
        await route.fulfill({ json: { generatedAt: "2026-11-14T00:00:00.000Z", items, total: items.length } });
      });
      await page.route("**/mcp-api/**", async route => {
        await route.fulfill({ json: { ok: true, data: { items: Array.from({ length: 20 }, (_, i) => ({
          id: `layout-server-${i}`, displayName: `长列表服务 ${i}`, description: "用于验证长内容布局",
          label: 1, transport: "http", url: "https://example.test/mcp", enabled: false,
          allowedTools: [], readOnlyTools: [], health: "unknown",
        })) } } });
      });
      await page.goto(`/${kind}?mode=daily`);
      const last = page.getByRole("heading", { name: kind === "skills" ? "长列表技能 19" : "长列表服务 19", exact: true });
      await last.waitFor();
      const footer = page.locator(".sidebar-user");
      await expect(footer).toContainText("Playwright Operator");
      await expect.poll(async () => (await footer.boundingBox())!.y + (await footer.boundingBox())!.height).toBeLessThanOrEqual(viewport.height);
      const content = page.locator(".app-content");
      await expect.poll(() => content.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
      await expect(footer).toBeInViewport();
      expect(await content.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(viewport.height);
    });
  }
}
