"use client";

import { useEffect, useRef } from "react";

const NEAR_BOTTOM_PX = 80;

/**
 * Keeps a scrollable chat/log container pinned to the bottom while new
 * content streams in (tokens, polling updates), but only while the user
 * hasn't manually scrolled away from the bottom — a plain
 * `scrollTop = scrollHeight` effect on every update fights a deliberate
 * scroll-up mid-generation, snapping the view back down.
 *
 * Usage: `const { ref, onScroll, scrollToBottom } = useStickToBottom<HTMLDivElement>([messages, phase]);`
 * then spread `ref`/`onScroll` onto the scrollable element. Call
 * `scrollToBottom(true)` after a deliberate user action (e.g. sending a
 * message) to force back to the bottom regardless of current scroll position.
 */
export function useStickToBottom<T extends HTMLElement>(deps: unknown[]) {
  const ref = useRef<T | null>(null);
  const stickRef = useRef(true);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
  }

  function scrollToBottom(force = false) {
    if (force) stickRef.current = true;
    if (!stickRef.current) return;
    requestAnimationFrame(() => {
      if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    });
  }

  useEffect(() => {
    scrollToBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ref, onScroll, scrollToBottom };
}
