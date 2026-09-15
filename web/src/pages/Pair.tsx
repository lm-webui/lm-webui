import { useEffect, useState } from "react";
import { authFetch } from "@/utils/api";

export default function Pair() {
  const [state, setState] = useState<"loading" | "error">("loading");
  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token) { setState("error"); return; }
    authFetch(`/api/auth/pairing/exchange?token=${encodeURIComponent(token)}`, { method: "POST" })
      .then(() => { window.history.replaceState({}, "", "/"); window.location.href = "/"; })
      .catch(() => setState("error"));
  }, []);
  return state === "error" ? <div className="p-8 text-center">This pairing link is invalid or expired.</div> : <div className="p-8 text-center">Connecting this device…</div>;
}
