import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  findSkillMarketIndependenceViolations,
  type SkillMarketSource,
} from "./skill-market-independence";

const roots = [
  path.resolve("src/app/api/skill-market"),
  path.resolve("src/app/skills"),
  path.resolve("src/features/skills"),
];

async function main(): Promise<void> {
  const sources: SkillMarketSource[] = [];
  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      sources.push({ path: path.relative(process.cwd(), file), source: await readFile(file, "utf8") });
    }
  }
  const violations = findSkillMarketIndependenceViolations(sources);
  assert.deepEqual(violations, [], `K-07 hidden runtime dependencies: ${JSON.stringify(violations)}`);
  console.log(`PASS K-07 frontend independence (${sources.length} source files)`);
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // Generated contracts intentionally retain source-repository provenance;
      // their imports and drift are enforced by the separate Schema gate.
      if (entry.name === "generated") return [];
      return sourceFiles(target);
    }
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }))).flat();
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
