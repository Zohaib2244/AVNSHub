"use client";

import { useEffect, type RefObject } from "react";

/** A hidden textarea mirror locates the caret, including wraps and scrolling. */
export function useChatGaze(screenRef: RefObject<HTMLDivElement | null>, inputRef: RefObject<HTMLTextAreaElement | null>) {
  useEffect(() => {
    const screen = screenRef.current;
    const input = inputRef.current;
    if (!screen || !input) return;
    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    const marker = document.createElement("span");
    document.body.append(mirror);
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;
    let active = false;
    let visible = true;
    function gaze(x: number, y: number) {
      screen!.style.setProperty("--gaze-x", x.toFixed(1) + "px");
      screen!.style.setProperty("--gaze-y", y.toFixed(1) + "px");
    }
    function track() {
      if (!active) return;
      const style = getComputedStyle(input!);
      mirror.style.cssText = "position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none;white-space:pre-wrap;overflow-wrap:break-word;";
      for (const prop of ["fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing", "lineHeight", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "borderStyle", "boxSizing", "tabSize"] as const) {
        mirror.style[prop] = style[prop];
      }
      mirror.style.width = input!.offsetWidth + "px";
      const caret = input!.selectionDirection === "backward" ? input!.selectionStart : input!.selectionEnd;
      mirror.textContent = input!.value.slice(0, caret);
      marker.textContent = input!.value.slice(caret, caret + 1) || ".";
      mirror.append(marker);
      mirror.append(document.createTextNode(input!.value.slice(caret + 1)));
      const mark = marker.getBoundingClientRect();
      const mirrored = mirror.getBoundingClientRect();
      const box = input!.getBoundingClientRect();
      const face = screen!.getBoundingClientRect();
      const x = box.left + Math.max(0, Math.min(box.width, mark.left - mirrored.left - input!.scrollLeft));
      const y = box.top + Math.max(0, Math.min(box.height, mark.top - mirrored.top - input!.scrollTop + mark.height / 2));
      gaze(Math.max(-1, Math.min(1, (x - face.left - face.width / 2) / (face.width / 2))) * 26,
        Math.tanh((y - face.top - face.height / 2) / 100) * 26);
    }
    function queueTrack() { cancelAnimationFrame(frame); frame = requestAnimationFrame(track); }
    function idle() {
      if (active || !visible || document.hidden) return;
      if (screen!.dataset.expression !== "idle") return;
      gaze(reduced.matches ? 0 : (Math.random() - .5) * 30, reduced.matches ? 0 : (Math.random() - .5) * 14);
      if (!reduced.matches) timer = setTimeout(idle, 1800 + Math.random() * 2400);
    }
    function sync() {
      clearTimeout(timer);
      active = visible && !document.hidden && document.hasFocus() && document.activeElement === input && !input!.disabled && screen!.dataset.expression === "idle";
      screen!.dataset.attention = active ? "typing" : "idle";
      screen!.dataset.motion = visible && !document.hidden ? "running" : "paused";
      if (active) queueTrack();
      else {
        const thinking = screen!.dataset.expression === "thinking";
        gaze(thinking ? -9 : 0, thinking ? -14 : 0);
        if (visible && !document.hidden) timer = setTimeout(idle, 900);
      }
    }
    const resize = new ResizeObserver(queueTrack);
    resize.observe(input);
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    intersection.observe(screen);
    const expressionObserver = new MutationObserver(sync);
    expressionObserver.observe(screen, { attributes: true, attributeFilter: ["data-expression"] });
    expressionObserver.observe(input, { attributes: true, attributeFilter: ["disabled"] });
    const events = ["input", "keyup", "click", "select", "scroll"];
    events.forEach(event => input.addEventListener(event, queueTrack));
    input.addEventListener("focus", sync);
    input.addEventListener("blur", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    document.addEventListener("visibilitychange", sync);
    document.addEventListener("selectionchange", queueTrack);
    reduced.addEventListener("change", sync);
    sync();
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      resize.disconnect();
      intersection.disconnect();
      expressionObserver.disconnect();
      events.forEach(event => input.removeEventListener(event, queueTrack));
      input.removeEventListener("focus", sync);
      input.removeEventListener("blur", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
      document.removeEventListener("visibilitychange", sync);
      document.removeEventListener("selectionchange", queueTrack);
      reduced.removeEventListener("change", sync);
      mirror.remove();
    };
  }, [screenRef, inputRef]);
}
