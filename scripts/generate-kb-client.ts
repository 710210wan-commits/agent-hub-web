import { writeGeneratedKbClient } from "./kb-client-generator";

async function main(): Promise<void> {
  const generated = await writeGeneratedKbClient();
  console.log(
    `Generated ${generated.files.size} Knowledge Base client files in ` +
      `${generated.outputDirectory}.`,
  );
}

void main();
