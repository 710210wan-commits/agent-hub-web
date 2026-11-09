import { assertGeneratedSkillMarketClientCurrent } from "./skill-market-client-generator";

async function main(): Promise<void> {
  await assertGeneratedSkillMarketClientCurrent();
  console.log("Generated Skill Market client is current.");
}

void main();
