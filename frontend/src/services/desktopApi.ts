/**
 * Thin wrapper around the pywebview JS API.
 * Falls back to standard browser behaviour when running outside the desktop app.
 */

interface PywebviewApi {
  open_anima_manager: () => Promise<void>;
  open_settings: () => Promise<void>;
  refresh_all_pages: () => void;
}

interface Pywebview {
  api: PywebviewApi;
}

function getPywebview(): Pywebview | null {
  return (window as unknown as { pywebview?: Pywebview }).pywebview ?? null;
}

export function openAnimaManager(): void {
  const pw = getPywebview();
  if (pw?.api?.open_anima_manager) {
    pw.api.open_anima_manager();
  } else {
    window.open("/animas.html", "animas");
  }
}

export function openSettings(): void {
  const pw = getPywebview();
  if (pw?.api?.open_settings) {
    pw.api.open_settings();
  } else {
    window.open("/settings.html", "settings");
  }
}

export function refreshAllPages(): void {
  const pw = getPywebview();
  if (pw?.api?.refresh_all_pages) {
    pw.api.refresh_all_pages();
  } else {
    window.location.reload();
  }
}
