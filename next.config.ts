import type { NextConfig } from "next";

import { resolveAgentApiRewrites } from "./src/config/proxy";
import { resolvePublicRuntimeConfig } from "./src/config/env";
import { resolveSkillMarketTargetConfig } from "./src/config/skill-market-targets";

resolvePublicRuntimeConfig(process.env);
resolveSkillMarketTargetConfig(process.env);

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return resolveAgentApiRewrites(process.env);
  },
};

export default nextConfig;
