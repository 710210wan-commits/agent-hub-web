import type { Page, Route } from "@playwright/test";

export async function installGlobalAuthFixture(page: Page): Promise<void> {
  await page.route("**/agent-api/auth/xiaozhi-status", async (route) => {
    await json(route, {
      enabled: true,
      xiaozhiUrl: "http://xiaozhi.test",
      user: {
        id: "playwright-operator",
        displayName: "Playwright Operator",
        sessionExpiresAt: "2027-11-12T09:00:00.000Z",
      },
    });
  });
}

async function json(route: Route, body: unknown): Promise<void> {
  await route.fulfill({ body: JSON.stringify(body), contentType: "application/json", status: 200 });
}
