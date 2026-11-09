import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "thin-loop-real-transport.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3102",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  webServer: [
    {
      command: "node e2e/fixtures/thin-loop-backend.mjs",
      url: "http://127.0.0.1:3201/__health",
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: "corepack pnpm@9.0.0 dev --hostname 127.0.0.1 --port 3102",
      url: "http://127.0.0.1:3102/chat?mode=daily",
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
        NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
        AGENT_API_ORIGIN: "http://127.0.0.1:3201",
      },
    },
  ],
});
