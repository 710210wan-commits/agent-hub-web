import type { NextConfig } from "next";

import { resolveAgentApiRewrites } from "./src/config/proxy";
import { resolvePublicRuntimeConfig } from "./src/config/env";

resolvePublicRuntimeConfig(process.env);

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return resolveAgentApiRewrites(process.env);
  },
};

export default nextConfig;
