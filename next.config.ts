import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Build a candidate without overwriting the assets served by the running process.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Private originals and local task artifacts are runtime storage, never release assets.
  outputFileTracingExcludes: {
    "/*": ["./knowledge/**/*", "./tmp/**/*", "./temp/**/*", "./backups/**/*", "./.env*", "./.langgraph_api/**/*", "./experiments/**/artifacts/**/*"],
  },
};

export default nextConfig;
