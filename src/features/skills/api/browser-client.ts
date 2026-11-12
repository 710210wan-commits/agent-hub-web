import { SkillMarketClient } from "./client";

let browserClient: SkillMarketClient | undefined;

export function getBrowserSkillMarketClient(): SkillMarketClient {
  browserClient ??= new SkillMarketClient();
  return browserClient;
}
