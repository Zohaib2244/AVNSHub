// Copy the current canvas to the clipboard as a PNG. Extracted from
// HubCorePanel so the command palette can run the same action.

/** @returns true if the image reached the clipboard */
export async function snapshotCanvas(): Promise<boolean> {
  const el = document.querySelector<HTMLElement>(".frame-inner");
  if (!el) return false;
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(el, {
      pixelRatio: window.devicePixelRatio ?? 1,
      skipFonts: false,
    });
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch {
    return false;
  }
}
