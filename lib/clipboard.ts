/* navigator.clipboard only exists in a secure context (https or localhost), so
   over plain http on the LAN it is undefined and copy would fail silently.
   Fall back to the legacy selection + execCommand path, which still works
   inside a click handler on insecure origins. */
function fallbackCopy(text: string) {
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

/** copy text to the clipboard; resolves false when every path was refused */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // permission denied / document not focused — try the legacy path
    }
  }
  return fallbackCopy(text);
}
