import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertGeneratedConversationClientCurrent,
  renderConversationClient,
  writeGeneratedConversationClient,
} from "./conversation-client-generator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("conversation client generation", () => {
  it("matches the committed generated files byte for byte", async () => {
    const rendered = await renderConversationClient();

    await expect(
      assertGeneratedConversationClientCurrent(),
    ).resolves.toBeUndefined();
    expect([...rendered.files.keys()].sort()).toEqual([
      "index.ts",
      "operations.ts",
      "schemas.ts",
    ]);
  });

  it("generates all operations without treating SSE text as decoded events", async () => {
    const rendered = await renderConversationClient();
    const operations = rendered.files.get("operations.ts") ?? "";

    expect(operations).toContain("export const conversationOperationSchemas = {");
    expect(operations.match(/^  [A-Za-z_$][A-Za-z0-9_$]*: \{$/gm)).toHaveLength(
      18,
    );
    expect(operations).toContain("streamConversationEventsResponseSchema = z.string()");
    expect(operations).not.toContain("parseEventStream");
  });

  it("adds frontend sequence bounds and known-content validation", async () => {
    const rendered = await renderConversationClient();
    const schemas = rendered.files.get("schemas.ts") ?? "";

    expect(schemas).toContain("9223372036854775807");
    expect(schemas).toContain("validateKnownMessageContent");
    expect(schemas).toContain("ConversationPublicEventSchema");
  });

  it("restores generated output and detects a hand edit", async () => {
    const root = await temporaryRoot();
    const outputDirectory = path.join(root, "generated");
    await writeGeneratedConversationClient({ outputDirectory });
    await expect(
      assertGeneratedConversationClientCurrent({ outputDirectory }),
    ).resolves.toBeUndefined();

    const target = path.join(outputDirectory, "schemas.ts");
    await writeFile(target, `${await readFile(target, "utf8")}\n// hand edit\n`);
    await expect(
      assertGeneratedConversationClientCurrent({ outputDirectory }),
    ).rejects.toThrow("schemas.ts");
  });

  it("refuses to replace a directory not named generated", async () => {
    const root = await temporaryRoot();
    const unsafe = path.join(root, "not-generated");
    await mkdir(unsafe);

    await expect(
      writeGeneratedConversationClient({ outputDirectory: unsafe }),
    ).rejects.toThrow("unsafe generated client directory");
  });
});

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(
    path.join(tmpdir(), "agent-hub-conversation-client-"),
  );
  temporaryDirectories.push(directory);
  return directory;
}
