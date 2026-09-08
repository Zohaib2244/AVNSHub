"use client";

import "./AboutCard.css";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Github, Info, Server } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { ThemeToggle } from "@/components/widgets/default/identity/ThemeToggle";
import { CUSTOM_WIDGETS } from "@/config/customWidgets";
import { WIDGETS } from "@/config/widgets";
import { getServerSlotLayout, getSlotLayout, subscribeSlotLayout } from "@/lib/slotLayout";

const DEFAULT_REPO_URL = "https://github.com/Zohaib2244/AVNSHub";
const DEFAULT_ABOUT =
  "A self-hosted, infinitely extensible dashboard framework — an empty canvas you fill with whatever you want. " +
  "Widgets are a component plus a manifest, and NutBot scaffolds brand-new ones from a single prompt.";

function textSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const mins = Math.floor((seconds % 3_600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

type Uptime = { sessionSeconds: number; totalSeconds: number | null };

/** Session + cumulative uptime. The wallpaper build ships no API routes at all,
    so a failed fetch is an expected state here, not an error — the card just
    shows em-dashes rather than breaking. */
function useUptime(): Uptime | null {
  const [uptime, setUptime] = useState<Uptime | null>(null);
  useEffect(() => {
    const load = () =>
      fetch("/api/uptime")
        .then((r) => r.json())
        .then((d: { sessionSeconds?: number; totalSeconds?: number | null }) => {
          if (typeof d.sessionSeconds !== "number") return;
          setUptime({ sessionSeconds: d.sessionSeconds, totalSeconds: d.totalSeconds ?? null });
        })
        .catch(() => {});
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, []);
  return uptime;
}

/** placed on the active canvas / every widget the registry knows about */
function useWidgetCount(): { placed: number; total: number } {
  const layout = useSyncExternalStore(subscribeSlotLayout, getSlotLayout, getServerSlotLayout);
  const total = Object.keys(WIDGETS).length + Object.keys(CUSTOM_WIDGETS).length;
  return { placed: layout.widgets.length, total };
}

function Stats() {
  const uptime = useUptime();
  const { placed, total } = useWidgetCount();

  return (
    <div className="about-stats">
      <div className="about-stat">
        <div className="about-stat-key">total uptime</div>
        <div className="about-stat-value">
          {uptime?.totalSeconds != null ? formatUptime(uptime.totalSeconds) : "—"}
        </div>
        <div className="about-stat-sub">
          {uptime ? `this session ${formatUptime(uptime.sessionSeconds)}` : "across every restart"}
        </div>
      </div>
      <div className="about-stat">
        <div className="about-stat-key">widgets</div>
        <div className="about-stat-value">
          {placed}
          <span className="about-stat-denom">/{total}</span>
        </div>
        <div className="about-stat-sub">placed on this canvas</div>
      </div>
    </div>
  );
}

export function AboutCard() {
  const { settings, size } = useWidget();
  const displayName = textSetting(settings.displayName, "AVN Hub");
  const tagline = textSetting(settings.tagline, "front page to your life");
  const initials = textSetting(settings.initials, "AVN").slice(0, 4).toUpperCase();
  const aboutText = textSetting(settings.aboutText, DEFAULT_ABOUT);
  const repoUrl = textSetting(settings.repoUrl, DEFAULT_REPO_URL);

  return (
    <div className="namecard about-card">
      <div className="namecard-main">
        <div className="namecard-mark" aria-hidden="true">
          <Info size={16} strokeWidth={1.75} />
          <span>{initials}</span>
        </div>
        <div className="namecard-identity">
          <div className="namecard-logo">{displayName}</div>
          <div className="namecard-tagline">{tagline}</div>
        </div>
        <div className="namecard-sub about-links">
          <a href={repoUrl} target="_blank" rel="noopener noreferrer">
            <Github size={14} strokeWidth={1.75} /> source
          </a>
          <span aria-hidden="true">·</span>
          <a href="#homelab">
            <Server size={14} strokeWidth={1.75} /> homelab
          </a>
        </div>
      </div>

      <div className="about-body">
        {size === "L" && <p className="about-text">{aboutText}</p>}
        <Stats />
      </div>

      <div className="namecard-right">
        <div className="about-controls">
          <ThemeToggle />
          <span className="live-badge">
            <span className="live-dot" />
            live
          </span>
        </div>
      </div>
    </div>
  );
}
