import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: ["hr-resume-screening.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3104",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
  webServer: [
    {
      command: "node e2e/fixtures/canonical-conversation-backend.mjs",
      url: "http://127.0.0.1:3203/__health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "corepack pnpm@9.0.0 dev --hostname 127.0.0.1 --port 3104",
      url: "http://127.0.0.1:3104/chat?mode=daily",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
        NEXT_PUBLIC_LEGACY_FRONTEND_URL: "http://localhost:5000",
        AGENT_API_ORIGIN: "http://127.0.0.1:3203",
        SKILL_MARKET_DAILY_ORIGIN: "http://127.0.0.1:3999",
        SKILL_MARKET_GATEWAY_HMAC_SECRET: "test-only-skill-market-hmac-secret-32-bytes",
        SKILL_MARKET_PRINCIPAL_ID: "hr-screening-e2e",
        SKILL_MARKET_PRINCIPAL_ROLES: "admin",
      },
    },
  ],
});
