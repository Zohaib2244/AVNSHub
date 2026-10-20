"use client";

// Auto-hide behaviour for Hub Core's control deck (components/dashboard/
// HubCorePanel.tsx). The deck has exactly two forms — a stub (three dots on
// the frame's bottom border) or the whole bar. It is never shown squeezed.
//
// The hot zone is the thing you can see, not a strip of screen. Collapsed,
// only the pill arms it: a small margin around .hub-core-stub. Open, the zone
// becomes the bar's own box (plus a margin), so the pointer can travel the
// whole bar without it closing. It used to be the full width of the frame's
// bottom 92px, which opened the deck whenever the pointer went anywhere near
// the bottom of the screen — reading the bottom row of widgets summoned it.
// Prototype: public/proto/control-deck.html.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** px around the collapsed pill that still counts as "at the pill" — enough
    to catch an approach, far short of the bottom row of widgets */
const STUB_REACH = 28;
/** px around the open bar before leaving it starts the grace timer */
const BAR_REACH = 18;
/** ms the pointer must stay in the zone before the deck comes out — without
    it, a pointer crossing the bottom row on its way elsewhere makes the deck
    flap open and shut */
const DWELL = 90;
/** ms after leaving before it collapses. Generous on purpose: leaving the
    deck is usually on the way back to it (pick a canvas, then reach for
    settings), and a deck that vanishes the instant the pointer drifts off
    has to be re-summoned for every second action. Escape still dismisses it
    at once. */
const GRACE = 500;
/** ms a peek (a canvas change made from outside the deck) stays up */
const PEEK = 1400;

export type DeckAutoHide = {
  open: boolean;
  show: () => void;
  /** collapse after the grace delay (or at once) */
  hide: (immediate?: boolean) => void;
  /** show it briefly, then put it away again */
  peek: () => void;
};

/**
 * @param deckRef  the deck's anchor element (must live inside `.frame`)
 * @param pinned   true while something must keep the deck out — a Hub Core
 *                 tab is open, edit mode is on, a popover is up. Pinning is
 *                 OR-ed into the result rather than written to state, so the
 *                 deck can never collapse out from under work in progress
 *                 and never needs an effect to push it back open.
 */
export function useDeckAutoHide(deckRef: RefObject<HTMLElement | null>, pinned: boolean): DeckAutoHide {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const open = pinned || hoverOpen || focusOpen;

  const hoverOpenRef = useRef(false);
  const inZoneRef = useRef(false);
  const dwellRef = useRef<number | null>(null);
  const graceRef = useRef<number | null>(null);
  const focusGraceRef = useRef<number | null>(null);
  const peekRef = useRef<number | null>(null);

  useEffect(() => {
    hoverOpenRef.current = hoverOpen;
  }, [hoverOpen]);

  const clearTimer = (ref: RefObject<number | null>) => {
    if (ref.current !== null) {
      window.clearTimeout(ref.current);
      ref.current = null;
    }
  };

  const show = useCallback(() => {
    clearTimer(dwellRef);
    clearTimer(graceRef);
    clearTimer(peekRef);
    setHoverOpen(true);
  }, []);

  const hide = useCallback((immediate = false) => {
    clearTimer(dwellRef);
    clearTimer(graceRef);
    graceRef.current = window.setTimeout(
      () => {
        graceRef.current = null;
        // never collapse out from under a pointer still resting on the deck
        if (inZoneRef.current) return;
        setHoverOpen(false);
      },
      immediate ? 0 : GRACE,
    );
  }, []);

  const peek = useCallback(() => {
    show();
    peekRef.current = window.setTimeout(() => {
      peekRef.current = null;
      hide(true);
    }, PEEK);
  }, [show, hide]);

  // proximity — skipped entirely on touch, where there is no hover to read
  // and the stub is a tap target like any other button
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;

    function onMove(e: PointerEvent) {
      const deck = deckRef.current;
      if (!deck) return;
      // the visible form decides the zone: the pill while collapsed, the bar
      // once it is out (the hidden one keeps a rect, so it must not be used)
      const open = hoverOpenRef.current || deck.classList.contains("deck-open");
      const target = deck.querySelector(open ? ".hub-core-bar" : ".hub-core-stub");
      if (!target) return;
      const r = target.getBoundingClientRect();
      const reach = open ? BAR_REACH : STUB_REACH;
      const inZone =
        e.clientX > r.left - reach &&
        e.clientX < r.right + reach &&
        e.clientY > r.top - reach &&
        e.clientY < r.bottom + reach;
      inZoneRef.current = inZone;

      if (inZone) {
        clearTimer(graceRef);
        if (hoverOpenRef.current || dwellRef.current !== null) return;
        dwellRef.current = window.setTimeout(() => {
          dwellRef.current = null;
          setHoverOpen(true);
        }, DWELL);
      } else {
        clearTimer(dwellRef);
        // start the grace ONCE, on the way out. hide() restarts its timer,
        // and calling it on every move meant a pointer that kept moving kept
        // pushing the deadline back — the deck only hid once you held still.
        // Coming back into the zone clears it above, so a later exit starts
        // a fresh one.
        if (hoverOpenRef.current && graceRef.current === null) hide();
      }
    }

    document.addEventListener("pointermove", onMove);
    return () => document.removeEventListener("pointermove", onMove);
  }, [deckRef, hide]);

  // tabbing into the deck brings it out; tabbing away lets it go. focusout
  // fires before focusin when moving between the deck's own buttons, so the
  // release is delayed by the same grace — otherwise the bar blinks on every
  // Tab press.
  //
  // :focus-visible, not plain focus: a CLICK also focuses the button it hit,
  // and treating that as "keyboard focus is in the deck" pinned the deck open
  // for good — after clicking anything in it, it could never put itself away
  // again. Only a keyboard-reached control should hold it out.
  useEffect(() => {
    const el = deckRef.current;
    if (!el) return;
    function onFocusIn(e: FocusEvent) {
      const target = e.target as Element | null;
      if (!target?.matches(":focus-visible")) return;
      clearTimer(focusGraceRef);
      setFocusOpen(true);
    }
    function onFocusOut() {
      clearTimer(focusGraceRef);
      focusGraceRef.current = window.setTimeout(() => {
        focusGraceRef.current = null;
        setFocusOpen(false);
      }, GRACE);
    }
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [deckRef]);

  useEffect(
    () => () => {
      clearTimer(dwellRef);
      clearTimer(graceRef);
      clearTimer(focusGraceRef);
      clearTimer(peekRef);
    },
    [],
  );

  return { open, show, hide, peek };
}
