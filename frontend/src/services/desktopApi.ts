/**
 * Thin wrapper around the pywebview JS API.
 * Falls back to standard browser behaviour when running outside the desktop app.
 */

interface PywebviewApi {
  open_anima_manager: () => Promise<void>;
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
