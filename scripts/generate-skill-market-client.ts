import { writeGeneratedSkillMarketClient } from "./skill-market-client-generator";

async function main(): Promise<void> {
  const generated = await writeGeneratedSkillMarketClient();
  console.log(
    `Generated ${generated.files.size} Skill Market client files in ` +
      `${generated.outputDirectory}.`,
  );
}

void main();
