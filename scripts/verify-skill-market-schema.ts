import { verifyPinnedSkillMarketSchema } from "./skill-market-schema-lock";

async function main(): Promise<void> {
  const verified = await verifyPinnedSkillMarketSchema();
  console.log(
    `Verified ${verified.lock.contractId}@${verified.lock.schemaVersion} ` +
      `from ${verified.lock.sourceRepository}@${verified.lock.sourceCommit} ` +
      `(sha256=${verified.lock.sha256}, operations=${verified.lock.operationCount}).`,
  );
}

void main();
