import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface KbSchemaLock {
  artifact: "kb.v1.json";
  contractId: "kb.v1";
  operationCount: number;
  schemaVersion: string;
  sha256: string;
  sourceCommit: string;
  sourcePath: "api/openapi/kb.v1.json";
  sourceRepository: "DSI";
}

export interface VerifiedKbSchema {
  document: Record<string, unknown>;
  lock: KbSchemaLock;
  schemaBytes: Buffer;
}

export interface KbSchemaPaths {
  lockPath?: string;
  schemaPath?: string;
}

const DEFAULT_DIRECTORY = path.resolve(
  "src/features/knowledge/contracts/schema",
);

export async function verifyPinnedKbSchema(
  paths: KbSchemaPaths = {},
): Promise<VerifiedKbSchema> {
  const schemaPath = paths.schemaPath ?? path.join(DEFAULT_DIRECTORY, "kb.v1.json");
  const lockPath = paths.lockPath ?? path.join(DEFAULT_DIRECTORY, "kb.v1.lock.json");
  const [schemaBytes, lockText] = await Promise.all([
    readFile(schemaPath),
    readFile(lockPath, "utf8"),
  ]);
  const lock = parseLock(lockText);
  const sha256 = createHash("sha256").update(schemaBytes).digest("hex");
  if (sha256 !== lock.sha256) {
    throw new Error("Pinned Knowledge Base Schema SHA-256 does not match its lock file.");
  }

  const document = parseObject(schemaBytes.toString("utf8"), "Schema");
  const info = asObject(document.info, "Schema info");
  if (document.openapi !== "3.1.0") throw new Error("Pinned Knowledge Base Schema must use OpenAPI 3.1.0.");
  if (document["x-contract-id"] !== lock.contractId) throw new Error("Pinned Knowledge Base contract id does not match its lock file.");
  if (info.version !== lock.schemaVersion) throw new Error("Pinned Knowledge Base version does not match its lock file.");

  const pathsObject = asObject(document.paths, "Schema paths");
  const operationCount = countOperations(pathsObject);
  if (operationCount !== lock.operationCount) throw new Error("Pinned Knowledge Base operation count does not match its lock file.");
  if (Object.keys(pathsObject).some((route) => !route.startsWith("/api/kb/"))) {
    throw new Error("Pinned Schema contains a route outside /api/kb.");
  }
  assertLocalReferences(document);
  return { document, lock, schemaBytes };
}

function parseLock(text: string): KbSchemaLock {
  const lock = parseObject(text, "Schema lock");
  if (
    lock.artifact !== "kb.v1.json" ||
    lock.contractId !== "kb.v1" ||
    !Number.isSafeInteger(lock.operationCount) ||
    typeof lock.schemaVersion !== "string" ||
    !/^\d+\.\d+\.\d+$/.test(lock.schemaVersion) ||
    typeof lock.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(lock.sha256) ||
    typeof lock.sourceCommit !== "string" ||
    !/^[a-f0-9]{40}$/.test(lock.sourceCommit) ||
    lock.sourcePath !== "api/openapi/kb.v1.json" ||
    lock.sourceRepository !== "DSI"
  ) {
    throw new Error("Pinned Knowledge Base Schema lock is invalid.");
  }
  return lock as unknown as KbSchemaLock;
}

function parseObject(text: string, label: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
  return asObject(parsed, label);
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function countOperations(pathsObject: Record<string, unknown>): number {
  const methods = new Set(["delete", "get", "patch", "post", "put"]);
  let total = 0;
  for (const pathItem of Object.values(pathsObject)) {
    const item = asObject(pathItem, "Schema path item");
    total += Object.keys(item).filter((key) => methods.has(key)).length;
  }
  return total;
}

function assertLocalReferences(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertLocalReferences);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === "$ref" && (typeof child !== "string" || !child.startsWith("#/"))) {
      throw new Error("Pinned Knowledge Base Schema contains a non-local reference.");
    }
    assertLocalReferences(child);
  }
}
