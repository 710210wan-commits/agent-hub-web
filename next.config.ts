import type { NextConfig } from "next";

import { resolveAgentApiRewrites } from "./src/config/proxy";
import { resolvePublicRuntimeConfig } from "./src/config/env";
import { resolveSkillMarketGatewayConfig } from "./src/config/skill-market-gateway";
import { resolveSkillMarketPrincipalConfig } from "./src/config/skill-market-principal";
import { resolveSkillMarketTargetConfig } from "./src/config/skill-market-targets";

resolvePublicRuntimeConfig(process.env);
resolveSkillMarketGatewayConfig(process.env);
resolveSkillMarketPrincipalConfig(process.env);
resolveSkillMarketTargetConfig(process.env);

import { resolveMcpRewrites } from "./src/config/mcp-proxy";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [...resolveAgentApiRewrites(process.env), ...resolveMcpRewrites(process.env)];
  },
};

export default nextConfig;
