import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { verifyPinnedKbSchema } from "./kb-schema-lock";

const schemaPath = path.resolve("src/features/knowledge/contracts/schema/kb.v1.json");
const lockPath = path.resolve(
  "src/features/knowledge/contracts/schema/kb.v1.lock.json",
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("verifyPinnedKbSchema", () => {
  it("verifies the pinned version, source commit, hash, and KB scope", async () => {
    const verified = await verifyPinnedKbSchema();
    expect(verified.lock).toMatchObject({
      contractId: "kb.v1",
      operationCount: 23,
      schemaVersion: "1.0.0",
      // DSI@0ce83e1（知识库 OpenAPI 契约生成 + 错误信封统一）的 kb.v1.json
      sha256: "61a62bc5fe722ced10a835c6f0f69a88c2043d7280cf36083fe5eb7b902d8f3d",
      sourceCommit: "0ce83e1899a626306223d1e291fa422e89df91fd",
    });
  });

  it("fails closed when the pinned bytes drift", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.schemaPath, `${await readFile(fixture.schemaPath, "utf8")}\n`);
    await expect(verifyPinnedKbSchema(fixture)).rejects.toThrow("SHA-256");
  });

  it("fails closed when version metadata drifts", async () => {
    const fixture = await createFixture();
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock.schemaVersion = "1.1.0";
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await expect(verifyPinnedKbSchema(fixture)).rejects.toThrow("version");
  });

  it("rejects unrelated backend paths even with a matching updated hash", async () => {
    const fixture = await createFixture();
    const document = JSON.parse(await readFile(fixture.schemaPath, "utf8"));
    document.paths["/api/other-module"] = {
      get: { responses: { "200": { description: "no" } } },
    };
    const schema = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(fixture.schemaPath, schema);
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock.sha256 = createHash("sha256").update(schema).digest("hex");
    lock.operationCount += 1;
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);
    await expect(verifyPinnedKbSchema(fixture)).rejects.toThrow(
      "outside /api/kb",
    );
  });
});

async function createFixture(): Promise<{ lockPath: string; schemaPath: string }> {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-hub-kb-schema-"));
  temporaryDirectories.push(directory);
  const fixture = {
    lockPath: path.join(directory, "kb.v1.lock.json"),
    schemaPath: path.join(directory, "kb.v1.json"),
  };
  await Promise.all([
    copyFile(lockPath, fixture.lockPath),
    copyFile(schemaPath, fixture.schemaPath),
  ]);
  return fixture;
}
