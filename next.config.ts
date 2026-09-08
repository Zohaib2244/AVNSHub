import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // node-pty is a native addon used by the NutBot shell route — keep it out of
  // the server bundle so its prebuilt .node binary is required from node_modules
  // at runtime instead of being (incorrectly) traced/bundled by Turbopack.
  serverExternalPackages: ["node-pty"],
  // AVN Hub is served on avns2 behind Caddy at http://192.168.1.24 and
  // http://hub.avns.nut, so dev-server asset requests arrive from an origin
  // that isn't the bind address. Without this Next blocks them in dev.
  allowedDevOrigins: [
    "192.168.1.24",
    "hub.avns.nut",
    "*.avns.nut",
    "100.115.191.107",
    "*.ts.net",
  ],
};

export default nextConfig;
