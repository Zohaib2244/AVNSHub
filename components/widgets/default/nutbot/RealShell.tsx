"use client";

import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";

// Local-dev-only: connects to `npm run nutbot:shell` (scripts/nutbot-shell-server.mjs),
// a websocket server bound to 127.0.0.1 that hands back a real pty on this machine.
// Never point NEXT_PUBLIC_NUTBOT_SHELL_URL at anything reachable off-device.
export function RealShell({ wsUrl }: { wsUrl: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !wsUrl) return;

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

      const term = new Terminal({
        convertEol: true,
        fontFamily: `${fontFamily}, monospace`,
        fontSize: 12,
        cursorBlink: true,
        theme: {
          background: styles.getPropertyValue("--bg-nested").trim(),
          foreground: styles.getPropertyValue("--text-primary").trim(),
          cursor: styles.getPropertyValue("--accent-orange").trim(),
          selectionBackground: styles.getPropertyValue("--accent-cyan").trim(),
        },
      });

      const fitAddon = new FitAddon();
      term.loadAddon(fitAddon);
      term.open(containerRef.current);
      fitAddon.fit();

      const socket = new WebSocket(wsUrl);
      socket.binaryType = "arraybuffer";

      const sendResize = () => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(`\x00${JSON.stringify({ cols: term.cols, rows: term.rows })}`);
        }
      };

      socket.onopen = sendResize;
      socket.onmessage = (event) => {
        const data = typeof event.data === "string" ? event.data : new Uint8Array(event.data);
        term.write(data);
      };
      socket.onerror = () => {
        term.writeln("\r\n[connection error — is `npm run nutbot:shell` running?]");
      };
      socket.onclose = () => {
        term.writeln("\r\n[disconnected]");
      };

      const dataDisposable = term.onData((data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data);
      });

      const handleResize = () => {
        fitAddon.fit();
        sendResize();
      };
      window.addEventListener("resize", handleResize);

      cleanup = () => {
        window.removeEventListener("resize", handleResize);
        dataDisposable.dispose();
        socket.close();
        term.dispose();
      };
    })();

    return () => {
      disposed = true;
      cleanup();
    };
  }, [wsUrl]);

  if (!wsUrl) {
    return (
      <div className="term-line term-output">
        real shell not configured — set NEXT_PUBLIC_NUTBOT_SHELL_URL and run `npm run nutbot:shell` (dev only)
      </div>
    );
  }

  return <div ref={containerRef} className="term-xterm" />;
}
