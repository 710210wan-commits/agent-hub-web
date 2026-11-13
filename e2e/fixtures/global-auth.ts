import type { Page, Route } from "@playwright/test";

export async function installGlobalAuthFixture(page: Page): Promise<void> {
  // Shell E2E owns these optional data requests; no local API/RAG service is required.
  // The dedicated canonical suite uses its actual HTTP fixture instead of this helper.
  await page.route("**/agent-api/api/conversation-capabilities?scenarioId=daily", async (route) => {
    await json(route, {
      schemaVersion: 1,
      scenarioId: "daily",
      knowledgeBases: { status: "unavailable", items: [], reasonCode: "KNOWLEDGE_BASE_CATALOG_UNAVAILABLE" },
      skills: { status: "unavailable", items: [], reasonCode: "SKILL_CATALOG_UNAVAILABLE" },
      mcpServers: { status: "unavailable", items: [], reasonCode: "MCP_PROVIDER_NOT_CONFIGURED" },
    });
  });
  await page.route("**/agent-api/api/kb/databases", async (route) => {
    await json(route, { success: true, databases: [] });
  });
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
