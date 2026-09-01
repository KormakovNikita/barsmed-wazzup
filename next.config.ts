import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  output: "standalone",
  serverExternalPackages: ["webmaxsocket", "better-sqlite3", "ws"],
};

export default nextConfig;
