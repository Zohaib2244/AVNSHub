import { Github, Server } from "lucide-react";
import { NutMagLogo } from "@/components/NutMagLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { UptimeStat } from "@/components/UptimeStat";

export function IdentityBlock() {
  return (
    <div className="namecard">
      <div>
        <div className="namecard-logo flex items-center gap-2">
          <NutMagLogo className="h-5 w-auto" />
          NutMag2469
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
        <div className="namecard-tagline">nutting magnesium amounts of stuff</div>
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
