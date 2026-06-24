"use client";
import "./GameLibrary.css";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Library, Search, X } from "lucide-react";
import type { GameLibrary as GameLibraryData, SteamCreds } from "@/lib/steam";

export function GameLibrary({ open, onClose, creds }: { open: boolean; onClose: () => void; creds?: SteamCreds }) {
  const [lib, setLib] = useState<GameLibraryData | null>(null);
  const [query, setQuery] = useState("");

  // Fetch once, the first time the drawer opens. POST the per-widget creds when
  // set (else GET, which falls back to STEAM_* env vars server-side).
  useEffect(() => {
    if (!open || lib) return;
    const init: RequestInit | undefined = creds
      ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creds) }
      : undefined;
    fetch("/api/steam-library", init)
      .then((r) => r.json())
      .then(setLib)
      .catch(() => {});
  }, [open, lib, creds]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = lib?.games.filter((g) => g.name.toLowerCase().includes(query.trim().toLowerCase())) ?? [];

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="drawer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            className="drawer"
            initial={{ x: "110%" }}
            animate={{ x: 0 }}
            exit={{ x: "110%" }}
            transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="drawer-head">
              <div>
                <div className="drawer-title">
                  <Library size={14} strokeWidth={1.75} />
                  game library
                </div>
                {lib && (
                  <div className="drawer-sub">
                    {lib.totalGames} games · {lib.totalHours.toLocaleString()}h played
                  </div>
                )}
              </div>
              <button type="button" className="drawer-close" onClick={onClose} aria-label="close library">
                <X size={12} strokeWidth={2} />
              </button>
            </div>

            <div className="relative">
              <input
                className="drawer-search"
                placeholder="search games..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                spellCheck={false}
                autoComplete="off"
              />
              <Search
                size={13}
                strokeWidth={1.75}
                className="pointer-events-none absolute right-3 top-[9px] opacity-50"
              />
            </div>

            <div className="lib-list">
              {!lib ? (
                <div className="block-sub">loading library...</div>
              ) : filtered.length === 0 ? (
                <div className="block-sub">no games match &ldquo;{query}&rdquo;</div>
              ) : (
                filtered.map((g) => (
                  <div className="lib-row" key={g.appid}>
                    <span>{g.name}</span>
                    <span className="more-meta">{g.hoursTotal > 0 ? `${g.hoursTotal}h` : "unplayed"}</span>
                  </div>
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
