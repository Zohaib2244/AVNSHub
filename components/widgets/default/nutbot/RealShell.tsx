"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

// A real, cross-platform shell tab. Each instance spawns its own pseudo-terminal
// on the host (PowerShell on Windows, $SHELL on macOS/Linux) via the integrated
// /api/nutbot-shell route — no separate server process needed. Output streams in
// over Server-Sent Events; keystrokes and resizes go back as POSTs.
//
// The session lives server-side keyed by id, so it survives this component
// unmounting/remounting (e.g. a tab switch); it is only killed when the tab is
// closed (this component truly unmounts).

const SHELL_URL = "/api/nutbot-shell";

export function RealShell() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let cleanup = () => {};

    (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed || !containerRef.current) return;

      const styles = getComputedStyle(document.documentElement);
      const fontFamily = styles.getPropertyValue("--font-jetbrains-mono").trim() || "monospace";

      // .term-xterm's font-size is calc(<rem> * --nb-scale), so focus mode's
      // scale bump flows through to the pty text too
      const readFontPx = () => Math.round(parseFloat(getComputedStyle(container).fontSize)) || 12;

      const term = new Terminal({
        convertEol: false,
        fontFamily: `${fontFamily}, monospace`,
        fontSize: readFontPx(),
        fontWeight: 500,
        cursorBlink: true,
        theme: {
          background: styles.getPropertyValue("--bg-nested").trim() || "#1a1610",
          foreground: styles.getPropertyValue("--text-primary").trim() || "#e8dfc8",
          cursor: styles.getPropertyValue("--accent-orange").trim() || "#ff6b2b",
          selectionBackground: styles.getPropertyValue("--accent-cyan").trim() || "#00b4c8",
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      const safeFit = () => { try { fitAddon.fit(); } catch {} };
      safeFit();

      // 1. create the server-side session
      let sessionId: string | null = null;
      try {
        const res = await fetch(SHELL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create" }),
        });
        const json = (await res.json()) as { session?: string; error?: string };
        if (!json.session) throw new Error(json.error || "no session returned");
        sessionId = json.session;
      } catch (err) {
        term.writeln(`\x1b[31m[failed to start shell: ${(err as Error).message}]\x1b[0m`);
        return;
      }
      if (disposed) {
        // unmounted before the session came back — reap it
        navigator.sendBeacon?.(SHELL_URL, JSON.stringify({ action: "kill", session: sessionId }));
        return;
      }

      const post = (payload: Record<string, unknown>) =>
        fetch(SHELL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, session: sessionId }),
        }).catch(() => {});

      const pushResize = () => post({ action: "resize", cols: term.cols, rows: term.rows });

      // 2. stream output via SSE
      const evtSource = new EventSource(`${SHELL_URL}?session=${encodeURIComponent(sessionId)}`);
      evtSource.onmessage = (e) => {
        try { term.write(JSON.parse(e.data) as string); } catch {}
      };
      evtSource.onerror = () => { /* EventSource auto-reconnects; buffer replays */ };

      // tell the pty our real size once connected
      safeFit();
      pushResize();

      // 3. keystrokes → server
      const dataDisposable = term.onData((data) => { post({ action: "input", data }); });

      // 4. refit + report size whenever the container resizes (covers tab show/
      //    hide via display:none → block, and window resize)
      const resizeObs = new ResizeObserver(() => {
        if (container.offsetParent === null) return; // hidden (display:none) — skip
        const px = readFontPx();
        if (term.options.fontSize !== px) term.options.fontSize = px;
        safeFit();
        pushResize();
      });
      resizeObs.observe(container);

      cleanup = () => {
        resizeObs.disconnect();
        dataDisposable.dispose();
        evtSource.close();
        if (sessionId) {
          navigator.sendBeacon?.(SHELL_URL, JSON.stringify({ action: "kill", session: sessionId }));
        }
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, []);

  return <div ref={containerRef} className="term-xterm" />;
}
