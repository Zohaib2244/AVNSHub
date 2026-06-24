import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // node-pty is a native addon used by the NutBot shell route — keep it out of
  // the server bundle so its prebuilt .node binary is required from node_modules
  // at runtime instead of being (incorrectly) traced/bundled by Turbopack.
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
