import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { notifyModelsChanged } from "@/features/models/modelEvents";

export interface DownloadTask {
  task_id: string;
  filename: string;
  status: string;
  progress: number;
  error?: string;
}

interface DownloadsContextValue {
  downloads: Record<string, DownloadTask>;
  startDownload: (url: string, filename: string, subdir?: string) => Promise<string>;
}

const DownloadsContext = createContext<DownloadsContextValue | null>(null);

const BASE = import.meta.env.VITE_BACKEND_URL || "";
const TERMINAL = new Set(["completed", "exists", "failed", "cancelled"]);
const isActive = (t?: DownloadTask) => !!t && !TERMINAL.has(t.status);

/**
 * Global download manager. Downloads run in the backend regardless of UI;
 * this provider centrally polls active tasks so progress survives modal close
 * and resyncs on reopen. Fires onComplete/notifyModelsChanged when a download finishes.
 */
export function DownloadsProvider({ children, onComplete }: { children: ReactNode; onComplete?: () => void }) {
  const [downloads, setDownloads] = useState<Record<string, DownloadTask>>({});
  const [active, setActive] = useState(false); // any active download → poll
  const ref = useRef<Record<string, DownloadTask>>({});
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/models/downloads`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const activeList = (data.downloads || []) as DownloadTask[];
      const map: Record<string, DownloadTask> = {};
      activeList.forEach((d) => { map[d.task_id] = d; });
      const prev = ref.current;
      const prevActive = Object.keys(prev).filter((id) => isActive(prev[id]));
      // Backend is the source of truth — replace (drops stale optimistic entries,
      // so a finished/exists download no longer lingers as "In queue").
      ref.current = map;
      setDownloads(map);
      setActive(activeList.length > 0);

      const stillActive = new Set(activeList.map((d) => d.task_id));
      const completed = prevActive.filter((id) => !stillActive.has(id));
      if (completed.length) {
        onCompleteRef.current?.();
        notifyModelsChanged();
      }
    } catch { /* backend unreachable — ignore */ }
  }, []);

  // Resync on mount (survives modal close / runtime remount).
  useEffect(() => { refresh(); }, [refresh]);

  // Poll only while there is an active download.
  useEffect(() => {
    if (!active) return;
    const t = setInterval(refresh, 1000);
    return () => clearInterval(t);
  }, [active, refresh]);

  const startDownload = useCallback(async (url: string, filename: string, subdir?: string): Promise<string> => {
    const res = await fetch(`${BASE}/api/models/download`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ file_url: url, filename, ...(subdir ? { subdir } : {}) }),
    });
    if (!res.ok) throw new Error("Download failed");
    const { task_id } = await res.json();
    // Optimistically show as queued; the first poll reconciles with the backend.
    const task: DownloadTask = { task_id, filename, status: "queued", progress: 0 };
    ref.current = { ...ref.current, [task_id]: task };
    setDownloads(ref.current);
    setActive(true); // start polling
    return task_id;
  }, []);

  return (
    <DownloadsContext.Provider value={{ downloads, startDownload }}>
      {children}
    </DownloadsContext.Provider>
  );
}

export function useDownloads(): DownloadsContextValue {
  const ctx = useContext(DownloadsContext);
  if (!ctx) throw new Error("useDownloads must be used within DownloadsProvider");
  return ctx;
}
