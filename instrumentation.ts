/**
 * Runs once when the Next server process starts.
 *
 * config/customComponentMap.tsx holds a static `import()` per custom widget,
 * so an entry whose .tsx is missing is not a broken widget — it fails that
 * module's build, which cascades through config/customWidgets.ts →
 * lib/layout.ts → LayoutProvider → app/page.tsx and takes the whole dashboard
 * down. No error boundary can catch that; WidgetShell's only covers widgets
 * that *render* and throw.
 *
 * sanitizeComponentMap() already runs at the start of every generate request,
 * but that only helps if you start another generation — a dangling entry left
 * behind by an interrupted run (or a widget folder deleted by hand) otherwise
 * kept the site unbootable until someone edited the file themselves. Doing it
 * at boot too means a restart is always enough to get back to a working page:
 * the broken widget disappears, everything else loads.
 */
export async function register() {
  // fs-backed, and pointless in the edge runtime
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    const { purgeParkedWidgets, sanitizeComponentMap } = await import("@/lib/widget-creator/customRegistry");
    // Finish deletes that were parked to spare open pages a reload (see the
    // delete route) — nothing is connected yet, so dropping their imports now
    // costs nothing.
    const purged = purgeParkedWidgets();
    if (purged.length > 0) {
      console.log(`[avnhub] purged ${purged.length} deleted custom widget${purged.length > 1 ? "s" : ""}: ${purged.join(", ")}`);
    }
    const stale = sanitizeComponentMap();
    if (stale.length > 0) {
      console.warn(
        `[avnhub] dropped ${stale.length} custom widget${stale.length > 1 ? "s" : ""} whose component file is missing: ${stale.join(", ")}`,
      );
    }
  } catch (err) {
    // never let a startup hook stop the server from booting — a failure here
    // leaves things exactly as they were, which is what happened before it existed
    console.error("[avnhub] custom widget map sanitize failed at startup:", err);
  }
}
