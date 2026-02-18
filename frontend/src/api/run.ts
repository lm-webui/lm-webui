import { authFetch } from "../utils/api";

export async function startRun(sessionId: string, type: "local" | "api", payload: any) {
  return authFetch("/api/run/start", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, type, ...payload })
  });
}

export async function stopRun(sessionId: string) {
  return authFetch("/api/run/stop", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId })
  });
}

export async function getStatus(sessionId: string) {
  return authFetch(`/api/run/status?session_id=${encodeURIComponent(sessionId)}`);
}
