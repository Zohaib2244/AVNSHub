import "./IdentityBlock.css";
import { Github, IdCard, Server } from "lucide-react";
import { useWidget } from "@/components/framework/WidgetContext";
import { ThemeToggle } from "@/components/widgets/default/identity/ThemeToggle";
import { UptimeStat } from "@/components/widgets/default/identity/UptimeStat";

function textSetting(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function IdentityBlock() {
  const { settings } = useWidget();
  const displayName = textSetting(settings.displayName, "AVN Hub");
  const tagline = textSetting(settings.tagline, "front page to your life");
  const initials = textSetting(settings.initials, "AVN").slice(0, 4).toUpperCase();

  return (
    <div className="namecard">
      <div className="namecard-main">
        <div className="namecard-mark" aria-hidden="true">
          <IdCard size={16} strokeWidth={1.75} />
          <span>{initials}</span>
        </div>
        <div className="namecard-identity">
          <div className="namecard-logo">{displayName}</div>
          <div className="namecard-tagline">{tagline}</div>
        </div>
        <div className="namecard-sub flex flex-wrap items-center gap-2">
          <a
            href="https://github.com/Zohaib2244"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1"
          >
            <Github size={14} strokeWidth={1.75} /> github
          </a>
          <span>·</span>
          <a href="#homelab" className="inline-flex items-center gap-1">
            <Server size={14} strokeWidth={1.75} /> homelab
          </a>
          <span>·</span>
          <UptimeStat />
        </div>
      </div>
      <div className="namecard-right">
        <div className="flex items-center gap-2">
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
