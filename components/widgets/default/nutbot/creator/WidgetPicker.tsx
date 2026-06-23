"use client";

// Fuzzy-search combobox for picking a widget id — replaces a bare <select>
// in SettingsPane's edit-mode picker so it matches the rest of the creator's
// theme and scales past a handful of widgets. Visual language borrowed from
// SlotPlacementPopover (same drawer-search / slot-popover-* classes).

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChevronDown, Search } from "lucide-react";
import { fuzzyFilter } from "@/lib/fuzzy";

type Option = { id: string; label: string };

export function WidgetPicker({
  value,
  options,
  onChange,
  placeholder = "select a widget...",
}: {
  value: string;
  options: Option[];
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selected = options.find((o) => o.id === value);
  const filtered = fuzzyFilter(options, query, (o) => o.label);
  const clampedIndex = filtered.length ? Math.min(activeIndex, filtered.length - 1) : 0;

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Element)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    itemRefs.current[clampedIndex]?.scrollIntoView({ block: "nearest" });
  }, [clampedIndex]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
  }

  function toggleOpen() {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setQuery("");
        const selIdx = options.findIndex((o) => o.id === value);
        setActiveIndex(selIdx >= 0 ? selIdx : 0);
      }
      return next;
    });
  }

  function handleKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(Math.min(clampedIndex + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(Math.max(clampedIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(filtered[clampedIndex].id);
    }
  }

  return (
    <div className="wc-combo" ref={wrapRef}>
      <button type="button" className="wc-combo-trigger" onClick={toggleOpen}>
        <span className="wc-combo-trigger-label">{selected?.label ?? placeholder}</span>
        <ChevronDown size={12} strokeWidth={2} className={open ? "wc-chevron open" : "wc-chevron"} />
      </button>

      {open && (
        <div className="wc-combo-dropdown">
          <div className="slot-popover-search">
            <input
              ref={inputRef}
              type="text"
              className="drawer-search"
              placeholder="search widgets..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              autoComplete="off"
            />
            <Search size={13} strokeWidth={1.75} className="slot-popover-search-icon" />
          </div>
          {filtered.length === 0 ? (
            <div className="slot-popover-empty">no matches for &ldquo;{query.trim()}&rdquo;</div>
          ) : (
            <div className="slot-popover-list">
              {filtered.map((o, i) => (
                <button
                  key={o.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  className={`slot-popover-item${i === clampedIndex ? " active" : ""}`}
                  onClick={() => pick(o.id)}
                  onMouseMove={() => setActiveIndex(i)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
