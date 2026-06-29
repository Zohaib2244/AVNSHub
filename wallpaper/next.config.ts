import path from "path";
import type { NextConfig } from "next";

// Static export for Wallpaper Engine — see ../CLAUDE.md's "Wallpaper Engine
// build" section and ./README.md. `output: "export"` requires every route to
// be export-compatible; this app's only route (app/page.tsx) renders
// WallpaperDashboard, which deliberately avoids anything server-dependent —
// no app/api here at all (unlike the main app's next.config.ts, which is
// output: "standalone" for the dev-server/Docker deployment and stays
// untouched).
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
  // shared widget/lib/config code lives one level up (../components, ../lib,
  // ../config) — root must span both directories for those imports to
  // resolve. Set explicitly rather than relying on Turbopack's own lockfile-
  // based auto-detection: with two lockfiles present (this app's own plus the
  // main project's), auto-detection picked the same directory but still
  // tripped a Turbopack prerender bug on Next.js 16.2.7's "/_global-error"
  // page (Invariant: Expected workStore to be initialized) until pinned here.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
