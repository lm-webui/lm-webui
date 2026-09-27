const configured = (import.meta.env.VITE_BACKEND_URL || "").replace(/\/$/, "");

export function backendUrl(): string {
  if (configured) return configured;
  if (typeof window !== "undefined" && ["tauri:", "file:", "asset:"].includes(window.location.protocol)) {
    return "http://127.0.0.1:7070";
  }
  return "";
}

export function backendApiUrl(path: string): string {
  return `${backendUrl()}${path}`;
}
