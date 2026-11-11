import { assertGeneratedKbClientCurrent } from "./kb-client-generator";

async function main(): Promise<void> {
  await assertGeneratedKbClientCurrent();
  console.log("Generated Knowledge Base client is up to date.");
}

void main();
