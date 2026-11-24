import { readFile } from "node:fs/promises";
import path from "node:path";

import { renderAssistantClient } from "./generate-assistant-client";

async function main(): Promise<void> {
  const outputPath = path.resolve("src/features/assistants/contracts/generated/index.ts");
  const expected = await renderAssistantClient();
  const actual = await readFile(outputPath, "utf8");
  if (actual !== expected) throw new Error("Generated assistant client has drifted.");
  console.log("Generated assistant client is up to date.");
}

void main();
