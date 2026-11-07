import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { verifyPinnedSkillMarketSchema } from "./skill-market-schema-lock";

const schemaPath = path.resolve(
  "src/features/skills/contracts/schema/skill-market.v1.json",
);
const lockPath = path.resolve(
  "src/features/skills/contracts/schema/skill-market.v1.lock.json",
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("verifyPinnedSkillMarketSchema", () => {
  it("verifies the pinned version, source commit, hash, and Skill Market scope", async () => {
    const verified = await verifyPinnedSkillMarketSchema();
    expect(verified.lock).toMatchObject({
      contractId: "skill-market.v1",
      operationCount: 28,
      schemaVersion: "1.1.0",
      sha256: "49d3a134485a714362e50ae92288fb85ce830b225862472846798dbd325c372e",
      sourceCommit: "f8b6ad021547158acbd68181a78a13bf2bc1d92c",
    });
  });

  it("fails closed when the pinned bytes drift", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.schemaPath, `${await readFile(fixture.schemaPath, "utf8")}\n`);
    await expect(verifyPinnedSkillMarketSchema(fixture)).rejects.toThrow("SHA-256");
  });

  it("fails closed when version metadata drifts", async () => {
    const fixture = await createFixture();
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock.schemaVersion = "2.0.0";
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await expect(verifyPinnedSkillMarketSchema(fixture)).rejects.toThrow("version");
  });

  it("rejects unrelated backend paths even with a matching updated hash", async () => {
    const fixture = await createFixture();
    const document = JSON.parse(await readFile(fixture.schemaPath, "utf8"));
    document.paths["/api/other-module"] = { get: { responses: { "200": { description: "no" } } } };
    const schema = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(fixture.schemaPath, schema);
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock.sha256 = createHash("sha256").update(schema).digest("hex");
    lock.operationCount += 1;
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await expect(verifyPinnedSkillMarketSchema(fixture)).rejects.toThrow(
      "outside /api/skill-market",
    );
  });
});

async function createFixture(): Promise<{ lockPath: string; schemaPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-hub-skill-schema-"));
  temporaryDirectories.push(directory);
  const fixture = {
    lockPath: path.join(directory, "skill-market.v1.lock.json"),
    schemaPath: path.join(directory, "skill-market.v1.json"),
  };
  await Promise.all([
    copyFile(lockPath, fixture.lockPath),
    copyFile(schemaPath, fixture.schemaPath),
  ]);
  return fixture;
}
