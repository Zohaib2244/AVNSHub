"use client";

// Generic host component for iframe-type custom widgets.
// The widget content lives entirely in /public/custom-widgets/<id>/index.html —
// no React code, no bundler step required to add or remove one.
//
// Protocol (all messages scoped to window.location.origin):
//   host → iframe  NUTMAG_THEME    { tokens, mode, palette }       on load + theme change
//   host → iframe  NUTMAG_CONTEXT  { size, settings }              on load + size/settings change
//   iframe → host  NUTMAG_RESIZE   { height: number }              whenever content height changes

import { useWidget } from "@/components/framework/WidgetContext";
import { subscribeTheme } from "@/lib/theme";
import { useEffect, useRef, useState } from "react";

const TOKEN_NAMES = [
  "--bg-page", "--bg-card", "--bg-nested", "--border", "--shadow",
  "--text-primary", "--text-muted", "--text-muted-dim",
  "--accent-orange", "--accent-cyan", "--accent-warm",
  "--badge-text", "--status-up", "--status-down",
] as const;

function buildThemeMessage() {
  const el = document.documentElement;
  const style = getComputedStyle(el);
  return {
    type: "NUTMAG_THEME",
    tokens: Object.fromEntries(TOKEN_NAMES.map((n) => [n, style.getPropertyValue(n).trim()])),
    mode: el.dataset.theme === "light" ? "light" : "dark",
    palette: el.dataset.palette ?? "ember",
  };
}

export function IframeWidget() {
  const { id, size, settings } = useWidget();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(128);

  // keep latest size + settings in refs so the onLoad closure always sends fresh values
  const sizeRef = useRef(size);
  const settingsRef = useRef(settings);
  sizeRef.current = size;
  settingsRef.current = settings;

  const origin = typeof window !== "undefined" ? window.location.origin : "*";

  // send both messages on iframe load
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      const win = iframe.contentWindow;
      if (!win) return;
      win.postMessage(buildThemeMessage(), origin);
      win.postMessage({ type: "NUTMAG_CONTEXT", size: sizeRef.current, settings: settingsRef.current }, origin);
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [origin]);

  // re-send theme whenever mode or palette changes
  useEffect(() => {
    return subscribeTheme(() => {
      iframeRef.current?.contentWindow?.postMessage(buildThemeMessage(), origin);
    });
  }, [origin]);

  // re-send context whenever size or settings change
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "NUTMAG_CONTEXT", size, settings },
      origin,
    );
  }, [size, settings, origin]);

  // listen for height resize requests from the iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data?.type === "NUTMAG_RESIZE" && typeof e.data.height === "number") {
        setHeight(Math.max(40, Math.round(e.data.height)));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      src={`/custom-widgets/${id}/index.html`}
      style={{ border: 0, width: "100%", height, display: "block", minHeight: 80 }}
      sandbox="allow-scripts allow-same-origin"
      title={id}
    />
  );
}
