import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "daily-sse-real.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3107",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: [
    {
      command: "pnpm exec tsx tests/conversations/daily-sse-e2e-server.mjs",
      cwd: "../DSI-agent-loop/api",
      url: "http://127.0.0.1:3207/__health",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        SESSION_TEST_DATABASE_URL:
          "postgresql://postgres:postgres@127.0.0.1:5432/dsi_session_test",
      },
    },
    {
      command: "pnpm dev --hostname 127.0.0.1 --port 3107",
      url: "http://127.0.0.1:3107/chat?mode=daily",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
        AGENT_API_ORIGIN: "http://127.0.0.1:3207",
        SKILL_MARKET_DAILY_ORIGIN: "http://127.0.0.1:3999",
        SKILL_MARKET_GATEWAY_HMAC_SECRET:
          "task7-test-only-skill-market-hmac-secret",
        SKILL_MARKET_PRINCIPAL_ID: "daily-sse-real-e2e",
        SKILL_MARKET_PRINCIPAL_ROLES: "admin",
      },
    },
  ],
});
