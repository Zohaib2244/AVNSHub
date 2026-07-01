// Minimal module-level store for a single AVN Hub confirmation dialog.
// Avoids needing React context — any module can call showHubDialog() and
// the mounted HubDialog component (rendered inside LayoutProvider) reacts.

export type HubDialogConfig = {
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
};

let _config: HubDialogConfig | null = null;
let _listeners: (() => void)[] = [];

export function showHubDialog(config: HubDialogConfig) {
  _config = config;
  _listeners.forEach((fn) => fn());
}

export function dismissHubDialog() {
  _config = null;
  _listeners.forEach((fn) => fn());
}

export function getDialogConfig(): HubDialogConfig | null { return _config; }
export function getServerDialogConfig(): HubDialogConfig | null { return null; }

export function subscribeDialog(cb: () => void): () => void {
  _listeners.push(cb);
  return () => { _listeners = _listeners.filter((l) => l !== cb); };
}
