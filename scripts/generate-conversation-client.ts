import { writeGeneratedConversationClient } from "./conversation-client-generator";

async function main(): Promise<void> {
  const generated = await writeGeneratedConversationClient();
  console.log(
    `Generated ${generated.files.size} conversation client files in ` +
      `${generated.outputDirectory}.`,
  );
}

void main();
