import { strict as assert } from "node:assert";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium } from "@playwright/test";

interface ManagedProcess {
  child: ChildProcess;
  label: string;
  logs: string[];
}

const backendPort = Number(process.env.SKILL_MARKET_PARALLEL_API_PORT ?? "3301");
const legacyPort = Number(process.env.SKILL_MARKET_PARALLEL_LEGACY_PORT ?? "5300");
const frontendPort = Number(process.env.SKILL_MARKET_PARALLEL_FRONTEND_PORT ?? "3300");
const backendOrigin = `http://127.0.0.1:${backendPort}`;
const legacyOrigin = `http://127.0.0.1:${legacyPort}`;
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
const sharedSecret = "k07-parallel-run-only-secret-32-bytes";
const dsiRoot = requiredPath("DSI_AGENT_LOOP_ROOT");
const frontendRoot = process.cwd();
const processes: ManagedProcess[] = [];

async function main(): Promise<void> {
  await requireBuild(path.join(dsiRoot, "api", "dist", "index.js"), "DSI API");
  await requireBuild(path.join(dsiRoot, "dist", "server.js"), "legacy frontend server");
  await requireBuild(path.join(dsiRoot, ".next", "BUILD_ID"), "legacy frontend");
  await requireBuild(path.join(frontendRoot, ".next", "BUILD_ID"), "new frontend");

  try {
    const backend = startBackend();
    let legacy = startLegacy();
    const frontend = startFrontend();
    await Promise.all([
      waitFor(`${backendOrigin}/health`, "backend"),
      waitFor(`${legacyOrigin}/api/health`, "legacy frontend"),
      waitFor(`${frontendOrigin}/skills?mode=work`, "new frontend"),
    ]);

    const initialLegacyCatalog = await catalog(`${legacyOrigin}/api/skill-market/catalog`);
    const initialFrontendCatalog = await catalog(`${frontendOrigin}/api/skill-market/catalog?mode=daily`);
    assert.deepEqual(catalogIdentity(initialFrontendCatalog), catalogIdentity(initialLegacyCatalog));
    const networkEvidence = await verifyFrontendNetworkBoundaries();

    await stop(legacy);
    processes.splice(processes.indexOf(legacy), 1);
    const afterLegacyStop = await catalog(`${frontendOrigin}/api/skill-market/catalog?mode=daily`);
    assert.deepEqual(catalogIdentity(afterLegacyStop), catalogIdentity(initialFrontendCatalog));

    legacy = startLegacy();
    await waitFor(`${legacyOrigin}/api/health`, "restarted legacy frontend");
    await stop(frontend);
    processes.splice(processes.indexOf(frontend), 1);
    const afterFrontendStop = await catalog(`${legacyOrigin}/api/skill-market/catalog`);
    assert.deepEqual(catalogIdentity(afterFrontendStop), catalogIdentity(initialLegacyCatalog));

    const evidence = {
      checkedAt: new Date().toISOString(),
      versions: {
        backend: gitRevision(dsiRoot),
        legacyFrontend: gitRevision(dsiRoot),
        newFrontend: gitRevision(frontendRoot),
      },
      origins: { backendOrigin, frontendOrigin, legacyOrigin },
      catalog: catalogIdentity(initialFrontendCatalog),
      isolation: {
        newFrontendAfterLegacyStop: true,
        legacyFrontendAfterNewFrontendStop: true,
        legacyFrontendRoutes: networkEvidence.legacyRoutes,
        newFrontendRequests: networkEvidence.newFrontendRequests,
      },
      result: "passed",
    };
    const outputPath = process.env.SKILL_MARKET_PARALLEL_EVIDENCE_PATH?.trim();
    if (outputPath) {
      const absolute = path.resolve(outputPath);
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    }
    console.log(JSON.stringify(evidence, null, 2));
    void backend;
  } finally {
    await Promise.allSettled([...processes].reverse().map(stop));
  }
}

function startBackend(): ManagedProcess {
  return start("backend", process.execPath, ["dist/index.js"], path.join(dsiRoot, "api"), {
    API_HOST: "127.0.0.1",
    API_PORT: String(backendPort),
    NODE_ENV: "production",
    SKILL_MARKET_GATEWAY_HMAC_SECRET: sharedSecret,
  });
}

function startLegacy(): ManagedProcess {
  return start("legacy", process.execPath, ["dist/server.js"], dsiRoot, {
    API_URL: backendOrigin,
    COZE_PROJECT_ENV: "PROD",
    HOSTNAME: "127.0.0.1",
    NODE_ENV: "production",
    PORT: String(legacyPort),
    SKILL_MARKET_GATEWAY_HMAC_SECRET: sharedSecret,
    SKILL_MARKET_GATEWAY_MANAGED_SCENARIOS: "daily",
    SKILL_MARKET_GATEWAY_PERMISSIONS: "",
    SKILL_MARKET_GATEWAY_PRINCIPAL_ID: "k07-parallel-operator",
    SKILL_MARKET_GATEWAY_PRINCIPAL_ROLES: "author,reviewer,admin,scenario_admin",
  });
}

function startFrontend(): ManagedProcess {
  return start("frontend", process.execPath, [
    path.join(frontendRoot, "node_modules", "next", "dist", "bin", "next"),
    "start", "--hostname", "127.0.0.1", "--port", String(frontendPort),
  ], frontendRoot, {
    AGENT_API_ORIGIN: backendOrigin,
    NEXT_PUBLIC_AGENT_API_BASE: "/agent-api",
    NEXT_PUBLIC_CHAT_TRANSPORT: "projects-new",
    NEXT_PUBLIC_LEGACY_FRONTEND_URL: legacyOrigin,
    NODE_ENV: "production",
    SKILL_MARKET_BFF_TIMEOUT_MS: "30000",
    SKILL_MARKET_DAILY_ORIGIN: backendOrigin,
    SKILL_MARKET_GATEWAY_HMAC_SECRET: sharedSecret,
    SKILL_MARKET_PRINCIPAL_ID: "k07-parallel-operator",
    SKILL_MARKET_PRINCIPAL_MANAGED_SCENARIOS: "daily",
    SKILL_MARKET_PRINCIPAL_PERMISSIONS: "",
    SKILL_MARKET_PRINCIPAL_ROLES: "author,reviewer,admin,scenario_admin",
  });
}

function start(label: string, command: string, args: string[], cwd: string, environment: NodeJS.ProcessEnv): ManagedProcess {
  const logs: string[] = [];
  const child = spawn(command, args, { cwd, env: { ...process.env, ...environment }, stdio: ["ignore", "pipe", "pipe"] });
  for (const stream of [child.stdout, child.stderr]) {
    stream?.on("data", (chunk: Buffer) => {
      logs.push(chunk.toString());
      if (logs.length > 80) logs.shift();
    });
  }
  const managed = { child, label, logs };
  processes.push(managed);
  return managed;
}

async function stop(process: ManagedProcess): Promise<void> {
  if (process.child.exitCode !== null || process.child.killed) return;
  process.child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => process.child.once("exit", () => resolve())),
    new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (process.child.exitCode === null) process.child.kill("SIGKILL");
}

async function waitFor(url: string, label: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  const logs = processes.find((item) => item.label.startsWith(label.split(" ")[0]))?.logs.join("") ?? "";
  throw new Error(`${label} did not become ready at ${url}.\n${logs}`);
}

async function catalog(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  assert.equal(response.status, 200, `${url}: ${response.status} ${await response.text()}`);
  return await response.json() as Record<string, unknown>;
}

function catalogIdentity(value: Record<string, unknown>): unknown {
  const items = Array.isArray(value.items) ? value.items : [];
  return items.map((item) => {
    const candidate = item as Record<string, unknown>;
    const market = candidate.market as Record<string, unknown> | undefined;
    return {
      id: candidate.id,
      name: candidate.name,
      publicationId: market?.publicationId,
      revision: market?.revision,
      source: candidate.source,
      status: candidate.status,
    };
  }).sort((left, right) => String(left.id).localeCompare(String(right.id)));
}

async function verifyFrontendNetworkBoundaries(): Promise<{
  legacyRoutes: string[];
  newFrontendRequests: string[];
}> {
  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage();
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.goto(`${frontendOrigin}/skills?mode=daily`, { waitUntil: "networkidle" });
    assert.equal(requests.some((url) => url.startsWith(legacyOrigin)), false, "new frontend contacted the legacy frontend");
    assert.equal(requests.some((url) => new URL(url).pathname === "/api/skills"), false, "new frontend contacted legacy /api/skills");
    assert.equal(requests.some((url) => new URL(url).pathname.startsWith("/api/skill-market/")), true, "new frontend did not use its same-origin Skill Market BFF");

    const workRequests: string[] = [];
    page.on("request", (request) => workRequests.push(request.url()));
    await page.goto(`${frontendOrigin}/skills?mode=work`, { waitUntil: "networkidle" });
    assert.equal(workRequests.some((url) => new URL(url).pathname.startsWith("/api/skill-market/")), false, "work mode sent a Skill Market request");
    const legacyPage = await browser.newPage();
    const legacyRoutes = [
      ["/skills", "Skill 广场"],
      ["/skills/mine", "作者工作台"],
      ["/skills/review", "Skill 审核队列"],
      ["/skills/manage", "发布与安装管理"],
    ] as const;
    for (const [route, heading] of legacyRoutes) {
      const response = await legacyPage.goto(`${legacyOrigin}${route}`, { waitUntil: "networkidle" });
      assert.equal(response?.ok(), true, `legacy route failed: ${route}`);
      await legacyPage.getByRole("heading", { name: heading }).waitFor();
    }
    return {
      legacyRoutes: legacyRoutes.map(([route]) => route),
      newFrontendRequests: requests.filter((url) => new URL(url).pathname.startsWith("/api/skill-market/")),
    };
  } finally {
    await browser.close();
  }
}

async function requireBuild(target: string, label: string): Promise<void> {
  await access(target).catch(() => { throw new Error(`${label} build is missing: ${target}`); });
}

function requiredPath(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return path.resolve(value);
}

function gitRevision(root: string): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
