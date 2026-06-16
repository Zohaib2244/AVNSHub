export function NutMagLogo({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 24"
      fill="none"
      aria-label="NutMag"
      className={className}
    >
      {/*
        Dot-matrix "N M" letterforms.
        Each letter is a 5×5 dot grid; dots are 2×2 squares with 1.5px gap.
        "N" uses orange, "M" uses cyan. Combined = NutMag mark.
      */}

      {/* ── N (cols 0-4, rows 0-4) ── */}
      {/* col 0 — full vertical stroke */}
      <rect x="0"   y="0"   width="2" height="2" fill="var(--accent-orange)" />
      <rect x="0"   y="3.5" width="2" height="2" fill="var(--accent-orange)" />
      <rect x="0"   y="7"   width="2" height="2" fill="var(--accent-orange)" />
      <rect x="0"   y="10.5" width="2" height="2" fill="var(--accent-orange)" />
      <rect x="0"   y="14"  width="2" height="2" fill="var(--accent-orange)" />
      {/* diagonal — dots at (1,1) (2,2) (3,3) */}
      <rect x="3.5" y="3.5" width="2" height="2" fill="var(--accent-orange)" />
      <rect x="7"   y="7"   width="2" height="2" fill="var(--accent-orange)" />
      <rect x="10.5" y="10.5" width="2" height="2" fill="var(--accent-orange)" />
      {/* col 4 — full vertical stroke */}
      <rect x="14"  y="0"   width="2" height="2" fill="var(--accent-orange)" />
      <rect x="14"  y="3.5" width="2" height="2" fill="var(--accent-orange)" />
      <rect x="14"  y="7"   width="2" height="2" fill="var(--accent-orange)" />
      <rect x="14"  y="10.5" width="2" height="2" fill="var(--accent-orange)" />
      <rect x="14"  y="14"  width="2" height="2" fill="var(--accent-orange)" />

      {/* separator dot */}
      <rect x="19"  y="7"   width="2" height="2" fill="var(--accent-warm)" opacity="0.5" />

      {/* ── M (cols 0-4 offset by 23, rows 0-4) ── */}
      {/* col 0 — full vertical */}
      <rect x="23"  y="0"   width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="23"  y="3.5" width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="23"  y="7"   width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="23"  y="10.5" width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="23"  y="14"  width="2" height="2" fill="var(--accent-cyan)" />
      {/* left diagonal down */}
      <rect x="26.5" y="3.5" width="2" height="2" fill="var(--accent-cyan)" />
      {/* centre top peak */}
      <rect x="30"  y="7"   width="2" height="2" fill="var(--accent-cyan)" />
      {/* right diagonal down */}
      <rect x="33.5" y="3.5" width="2" height="2" fill="var(--accent-cyan)" />
      {/* col 4 — full vertical */}
      <rect x="37"  y="0"   width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="37"  y="3.5" width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="37"  y="7"   width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="37"  y="10.5" width="2" height="2" fill="var(--accent-cyan)" />
      <rect x="37"  y="14"  width="2" height="2" fill="var(--accent-cyan)" />

      {/* baseline rule */}
      <line x1="0" y1="20" x2="39" y2="20" stroke="var(--text-muted)" strokeWidth="0.5" opacity="0.4" />
    </svg>
  );
}
