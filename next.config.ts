import type { NextConfig } from "next";

import { resolveAgentApiRewrites } from "./src/config/proxy";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return resolveAgentApiRewrites(process.env);
  },
};

export default nextConfig;
