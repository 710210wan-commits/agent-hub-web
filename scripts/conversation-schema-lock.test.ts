import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { verifyPinnedConversationSchema } from "./conversation-schema-lock";

const schemaPath = path.resolve(
  "src/features/chat/conversation/contracts/schema/conversation.v1.json",
);
const lockPath = path.resolve(
  "src/features/chat/conversation/contracts/schema/conversation.v1.lock.json",
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("verifyPinnedConversationSchema", () => {
  it("verifies the pinned source, version, operation count, and bytes", async () => {
    const verified = await verifyPinnedConversationSchema();

    expect(verified.lock).toEqual({
      artifact: "conversation.v1.json",
      contractId: "conversation.v1",
      operationCount: 19,
      schemaVersion: "0.1.4",
      sha256: "e773f1f9824d9af837a236234b235083a1d1cf02f2570057b843c181265799b0",
      sourceCommit: "5ab29df6afd9e811321c639437b2672472f43996",
      sourcePath: "api/openapi/conversation.v1.json",
      sourceRepository: "DSI",
    });
  });

  it("fails closed when the schema bytes drift", async () => {
    const fixture = await createFixture();
    await writeFile(
      fixture.schemaPath,
      `${await readFile(fixture.schemaPath, "utf8")}\n`,
    );

    await expect(verifyPinnedConversationSchema(fixture)).rejects.toThrow(
      "SHA-256",
    );
  });

  it.each([
    ["schemaVersion", "0.1.3", "version"],
    ["operationCount", 17, "operation count"],
    ["sourcePath", "api/openapi/other.json", "lock"],
  ] as const)("rejects %s drift", async (field, value, message) => {
    const fixture = await createFixture();
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock[field] = value;
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    await expect(verifyPinnedConversationSchema(fixture)).rejects.toThrow(
      message,
    );
  });

  it("rejects a non-local reference even when the updated hash matches", async () => {
    const fixture = await createFixture();
    const document = JSON.parse(await readFile(fixture.schemaPath, "utf8"));
    document.components.schemas.CreateConversationRequest.properties.title = {
      $ref: "https://example.invalid/title.json",
    };
    const schema = `${JSON.stringify(document, null, 2)}\n`;
    await writeFile(fixture.schemaPath, schema);
    const lock = JSON.parse(await readFile(fixture.lockPath, "utf8"));
    lock.sha256 = createHash("sha256").update(schema).digest("hex");
    await writeFile(fixture.lockPath, `${JSON.stringify(lock, null, 2)}\n`);

    await expect(verifyPinnedConversationSchema(fixture)).rejects.toThrow(
      "non-local reference",
    );
  });
});

async function createFixture(): Promise<{
  lockPath: string;
  schemaPath: string;
}> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "agent-hub-conversation-schema-"),
  );
  temporaryDirectories.push(directory);
  const fixture = {
    lockPath: path.join(directory, "conversation.v1.lock.json"),
    schemaPath: path.join(directory, "conversation.v1.json"),
  };
  await Promise.all([
    copyFile(lockPath, fixture.lockPath),
    copyFile(schemaPath, fixture.schemaPath),
  ]);
  return fixture;
}
