import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["thin-loop-real-transport.spec.ts", "daily-session-j1.spec.ts", "daily-capabilities.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 6_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100/chat?mode=daily",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_CHAT_TRANSPORT: "mock",
      NEXT_PUBLIC_E2E_SCENARIOS: "1",
      NEXT_PUBLIC_LEGACY_FRONTEND_URL: "http://localhost:5000",
      SKILL_MARKET_DAILY_ORIGIN: "http://127.0.0.1:3999",
      SKILL_MARKET_GATEWAY_HMAC_SECRET: "e2e-only-skill-market-secret-32-bytes",
      SKILL_MARKET_PRINCIPAL_ID: "playwright-operator",
      SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS: "daily",
      SKILL_MARKET_PRINCIPAL_PERMISSIONS: "",
      SKILL_MARKET_PRINCIPAL_ROLES: "author,reviewer,admin,scenario_admin",
    },
  },
});
