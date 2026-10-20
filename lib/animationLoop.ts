"use client";

// Shared scheduler for decorative/interactive widget animation. A raw recursive
// requestAnimationFrame loop runs at the display refresh rate even when a
// widget is below the fold. This helper caps the actual draw rate and fully
// stops scheduling frames while the page is hidden or the element is outside
// the viewport.

export type AnimationFrameHandler = (time: number, deltaMs: number) => void;

export type AnimationLoopOptions = {
  element: Element;
  fps?: number;
  onFrame: AnimationFrameHandler;
};

export function startAnimationLoop({
  element,
  fps = 30,
  onFrame,
}: AnimationLoopOptions): () => void {
  const frameInterval = 1000 / Math.max(1, Math.min(60, fps));
  let disposed = false;
  let frameId: number | null = null;
  let lastDrawAt = 0;
  let inViewport = true;

  const isPageVisible = () => document.visibilityState !== "hidden";
  const isActive = () => !disposed && inViewport && isPageVisible();

  const stop = () => {
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    lastDrawAt = 0;
  };

  const tick = (time: number) => {
    frameId = null;
    if (!isActive()) return;

    const elapsed = lastDrawAt === 0 ? frameInterval : time - lastDrawAt;
    if (elapsed >= frameInterval - 1) {
      const deltaMs = lastDrawAt === 0 ? frameInterval : Math.min(elapsed, 250);
      lastDrawAt = time;
      onFrame(time, deltaMs);
    }

    frameId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (!isActive() || frameId !== null) return;
    frameId = requestAnimationFrame(tick);
  };

  const onVisibilityChange = () => {
    if (isPageVisible()) start();
    else stop();
  };

  document.addEventListener("visibilitychange", onVisibilityChange);

  const observer = typeof IntersectionObserver === "undefined"
    ? null
    : new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        inViewport = entry.isIntersecting;
        if (inViewport) start();
        else stop();
      });

  observer?.observe(element);
  start();

  return () => {
    disposed = true;
    stop();
    observer?.disconnect();
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
