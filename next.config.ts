import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // node-pty is a native addon used by the NutBot shell route — keep it out of
  // the server bundle so its prebuilt .node binary is required from node_modules
  // at runtime instead of being (incorrectly) traced/bundled by Turbopack.
  serverExternalPackages: ["node-pty"],
  // When the hub is opened from another machine (LAN IP, reverse-proxy
  // hostname, Tailscale name), dev-server asset requests arrive from an origin
  // that isn't the bind address and Next blocks them. List those hosts in
  // ALLOWED_DEV_ORIGINS (comma-separated), e.g. "192.168.1.50,hub.example.lan".
  allowedDevOrigins: [
    ...(process.env.ALLOWED_DEV_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    "*.ts.net",
  ],
};

export default nextConfig;
