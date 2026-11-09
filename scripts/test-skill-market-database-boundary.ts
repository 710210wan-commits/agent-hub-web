import { strict as assert } from "node:assert";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = [
  path.resolve("src/app/api/skill-market"),
  path.resolve("src/features/skills"),
];
const forbidden = [
  /drizzle-orm/i,
  /node-postgres/i,
  /(?:from|require\()["']pg["']/i,
  /schema-skill-market/i,
  /skill_(?:drafts|submissions|publications|installations|reviews|market_audit_logs)/i,
];

async function main(): Promise<void> {
  const violations: string[] = [];
  for (const root of roots) {
    for (const file of await sourceFiles(root)) {
      const source = await readFile(file, "utf8");
      for (const pattern of forbidden) {
        if (pattern.test(source)) violations.push(`${path.relative(process.cwd(), file)}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    `J-01 requires the frontend/BFF to depend only on HTTP contracts, not database implementation: ${violations.join(", ")}`,
  );

  console.log("PASS J-01 frontend/BFF database boundary");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return files.flat();
}
