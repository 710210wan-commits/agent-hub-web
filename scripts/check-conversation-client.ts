import { assertGeneratedConversationClientCurrent } from "./conversation-client-generator";

async function main(): Promise<void> {
  await assertGeneratedConversationClientCurrent();
  console.log("Generated conversation client is up to date.");
}

void main();
