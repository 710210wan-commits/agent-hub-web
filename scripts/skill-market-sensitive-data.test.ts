import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { assertSkillMarketSensitiveDataSafe } from "./skill-market-sensitive-data";

const temporaryDirectories: string[] = [];
const secret = "build-scan-secret-canary-with-32-characters";
const origin = "https://private-daily-origin.example.test";

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("assertSkillMarketSensitiveDataSafe", () => {
  it("accepts a build whose client assets and public env are free of server data", async () => {
    const fixture = await createFixture();
    await expect(assertSkillMarketSensitiveDataSafe({
      buildRoot: fixture.buildRoot,
      envExamplePath: fixture.envExamplePath,
      forbiddenClientValues: [origin],
      forbiddenEverywhereValues: [secret],
    })).resolves.toBeUndefined();
  });

  it("rejects server-only Skill Market configuration exposed as NEXT_PUBLIC", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.envExamplePath, "NEXT_PUBLIC_SKILL_MARKET_DAILY_ORIGIN=https://unsafe.test\n");
    await expect(assertSkillMarketSensitiveDataSafe({
      buildRoot: fixture.buildRoot,
      envExamplePath: fixture.envExamplePath,
      forbiddenClientValues: [origin],
      forbiddenEverywhereValues: [secret],
    })).rejects.toThrow("NEXT_PUBLIC");
  });

  it("rejects server-only Skill Market configuration injected as a public build env", async () => {
    const fixture = await createFixture();
    await expect(assertSkillMarketSensitiveDataSafe({
      buildRoot: fixture.buildRoot,
      environment: { NEXT_PUBLIC_SKILL_MARKET_GATEWAY_HMAC_SECRET: secret },
      envExamplePath: fixture.envExamplePath,
      forbiddenClientValues: [origin],
      forbiddenEverywhereValues: [secret],
    })).rejects.toThrow("NEXT_PUBLIC");
  });

  it.each([
    "NEXT_PUBLIC_XIAOZHI_API_KEY",
    "NEXT_PUBLIC_XIAOZHI_API_ORIGIN",
    "NEXT_PUBLIC_DSI_SESSION_COOKIE",
  ])("rejects Work Skill server configuration exposed as %s", async (key) => {
    const fixture = await createFixture();
    await writeFile(fixture.envExamplePath, `${key}=unsafe\n`);
    await expect(assertSkillMarketSensitiveDataSafe({
      buildRoot: fixture.buildRoot,
      envExamplePath: fixture.envExamplePath,
      forbiddenClientValues: [origin],
      forbiddenEverywhereValues: [secret],
    })).rejects.toThrow("NEXT_PUBLIC");
  });

  it.each([
    ["server artifact", "server/app.js", secret],
    ["client artifact", "static/chunks/app.js", origin],
    ["source map", "server/app.js.map", secret],
    ["client env key", "static/chunks/app.js", "SKILL_MARKET_GATEWAY_HMAC_SECRET"],
    ["Xiaozhi client env key", "static/chunks/app.js", "XIAOZHI_API_KEY"],
    ["DSI session cookie marker", "static/chunks/app.js", "dsi_app_session"],
  ])("rejects a leak in a %s", async (_label, relativePath, leakedValue) => {
    const fixture = await createFixture();
    const target = path.join(fixture.buildRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, `window.__leak=${JSON.stringify(leakedValue)};`);
    await expect(assertSkillMarketSensitiveDataSafe({
      buildRoot: fixture.buildRoot,
      envExamplePath: fixture.envExamplePath,
      forbiddenClientValues: [origin],
      forbiddenEverywhereValues: [secret],
    })).rejects.toThrow("sensitive data");
  });
});

async function createFixture(): Promise<{ buildRoot: string; envExamplePath: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "agent-hub-sensitive-data-"));
  temporaryDirectories.push(root);
  const buildRoot = path.join(root, ".next");
  const envExamplePath = path.join(root, ".env.example");
  await mkdir(path.join(buildRoot, "static", "chunks"), { recursive: true });
  await mkdir(path.join(buildRoot, "server"), { recursive: true });
  await writeFile(path.join(buildRoot, "static", "chunks", "app.js"), "window.__safe=true;");
  await writeFile(path.join(buildRoot, "server", "app.js"), "process.env.SKILL_MARKET_DAILY_ORIGIN;");
  await writeFile(envExamplePath, "NEXT_PUBLIC_AGENT_API_BASE=/agent-api\n");
  return { buildRoot, envExamplePath };
}
