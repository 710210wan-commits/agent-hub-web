import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  assertGeneratedSkillMarketClientCurrent,
  renderSkillMarketClient,
  writeGeneratedSkillMarketClient,
} from "./skill-market-client-generator";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { force: true, recursive: true })
  ));
});

describe("Skill Market client generation", () => {
  it("matches the committed generated files byte for byte", async () => {
    const rendered = await renderSkillMarketClient();
    await expect(assertGeneratedSkillMarketClientCurrent()).resolves.toBeUndefined();
    expect([...rendered.files.keys()].sort()).toEqual([
      "index.ts",
      "operations.ts",
      "schemas.ts",
    ]);
  });

  it("fully restores a deleted generated directory", async () => {
    const root = await temporaryRoot();
    const outputDirectory = path.join(root, "generated");
    await writeGeneratedSkillMarketClient({ outputDirectory });
    await rm(outputDirectory, { force: true, recursive: true });
    await writeGeneratedSkillMarketClient({ outputDirectory });
    await expect(
      assertGeneratedSkillMarketClientCurrent({ outputDirectory }),
    ).resolves.toBeUndefined();
  });

  it("detects a hand-edited generated file", async () => {
    const root = await temporaryRoot();
    const outputDirectory = path.join(root, "generated");
    await writeGeneratedSkillMarketClient({ outputDirectory });
    const target = path.join(outputDirectory, "schemas.ts");
    await writeFile(target, `${await readFile(target, "utf8")}\n// hand edit\n`);
    await expect(
      assertGeneratedSkillMarketClientCurrent({ outputDirectory }),
    ).rejects.toThrow("schemas.ts");
  });

  it("refuses to recursively replace a directory not named generated", async () => {
    const root = await temporaryRoot();
    const unsafe = path.join(root, "not-generated");
    await mkdir(unsafe);
    await expect(
      writeGeneratedSkillMarketClient({ outputDirectory: unsafe }),
    ).rejects.toThrow("unsafe generated client directory");
  });
});

async function temporaryRoot(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "agent-hub-client-generator-"));
  temporaryDirectories.push(directory);
  return directory;
}
