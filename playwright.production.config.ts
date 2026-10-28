import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./production-e2e",
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:3101",
    channel: "chrome",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "corepack pnpm@9.0.0 start --hostname 127.0.0.1 --port 3101",
    url: "http://127.0.0.1:3101/chat?mode=daily",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
