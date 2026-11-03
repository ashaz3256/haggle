import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-better-sqlite3", "better-sqlite3"],
  // Pin the tracing root so a stray lockfile higher up the tree doesn't confuse Next.
  outputFileTracingRoot: path.join(__dirname),
};
export default nextConfig;
