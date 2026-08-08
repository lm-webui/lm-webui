/**
 * ModelDownloadModal — resolve a HuggingFace repo and download GGUF or MLX models.
 * Shared by GGUF and MLX tabs in RuntimeManager.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Search, Check, HardDrive, Cpu } from "lucide-react";
import { toast } from "sonner";
import { notifyModelsChanged } from "@/features/models/modelEvents";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelType: "gguf" | "mlx";
  onComplete: () => void;
  /** Which model the user is downloading — drives the HuggingFace reference link. */
  variant?: "text" | "vision";
}

export default function ModelDownloadModal({ open, onOpenChange, modelType, onComplete, variant = "text" }: Props) {
  const [repoInput, setRepoInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState("");
  const [progressPct, setProgressPct] = useState(0);
  const BASE = import.meta.env.VITE_BACKEND_URL || "";
  const isGGUF = modelType === "gguf";

  const handleResolve = async () => {
    if (!repoInput.trim()) return;
    setResolving(true);
    setRepoInfo(null);
    try {
      if (isGGUF) {
        const res = await fetch(`${BASE}/api/models/resolve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ input: repoInput.trim() }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        setRepoInfo(data);
      } else {
        const res = await fetch(`${BASE}/api/mlx/resolve`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ repo_id: repoInput.trim() }),
        });
        if (!res.ok) throw new Error("Repo not found");
        setRepoInfo(await res.json());
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to resolve repo");
    } finally {
      setResolving(false);
    }
  };

  const handleDownload = async (url?: string, filename?: string) => {
    setDownloading(true);
    setProgress("Starting download...");
    try {
      if (isGGUF) {
        const res = await fetch(`${BASE}/api/models/download`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ file_url: url, filename }),
        });
        if (!res.ok) throw new Error("Download failed");
        const { task_id } = await res.json();
        const poll = setInterval(async () => {
          const s = await fetch(`${BASE}/api/models/download/status/${task_id}`, { credentials: "include" });
          const st = await s.json();
          const pct = st.progress || 0;
          setProgressPct(pct);
          setProgress(st.status === "completed" ? "✅ Complete" : `Downloading ${pct.toFixed(0)}%`);
          if (st.status === "completed" || st.status === "failed" || st.status === "exists") {
            clearInterval(poll);
            setProgressPct(st.status === "completed" ? 100 : 0);
            if (st.status === "completed") toast.success("Model downloaded");
            else if (st.status === "exists") toast.info("Model already exists");
            else toast.error(st.error || "Download failed");
            setDownloading(false);
            onComplete();
            notifyModelsChanged();
            onOpenChange(false);
          }
        }, 800);
      } else {
        setProgress("Downloading model files...");
        setProgressPct(30);
        const res = await fetch(`${BASE}/api/mlx/download`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ repo_id: repoInput.trim() }),
        });
        if (!res.ok) throw new Error("Download failed");
        setProgressPct(80);
        setProgress("Processing...");
        const result = await res.json();
        setProgressPct(100);
        setProgress("✅ Complete");
        if (result.status === "exists") toast.info("Already downloaded");
        else toast.success("Model downloaded");
        await new Promise(r => setTimeout(r, 500));
        setDownloading(false);
        onComplete();
        notifyModelsChanged();
        onOpenChange(false);
      }
    } catch (e: any) {
      toast.error(e.message || "Download failed");
      setDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-neutral-100/90 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-xl">
        <DialogTitle className="flex items-center gap-2 text-lg">
          {isGGUF ? <HardDrive className="h-5 w-5" /> : <Cpu className="h-5 w-5" />}
          Download {isGGUF ? "GGUF" : "MLX"} Model
        </DialogTitle>
        <DialogDescription>
          Enter a HuggingFace repo ID{isGGUF ? " or direct .gguf URL" : ""}
        </DialogDescription>

        {isGGUF && (
          <div className="-mt-1 text-xs text-muted-foreground">
            model reference:{" "}
            <a
              href={variant === "vision"
                ? "https://huggingface.co/models?pipeline_tag=image-text-to-text&library=gguf&sort=downloads"
                : "https://huggingface.co/models?pipeline_tag=text-generation&library=gguf&sort=downloads"}
              target="_blank"
              rel="noreferrer"
              className="text-blue-500 hover:underline"
            >
              {variant === "vision"
                ? "huggingface.co/models (image-text-to-text · gguf)"
                : "huggingface.co/models (text-generation · gguf)"}
            </a>
          </div>
        )}

        <div className="flex gap-2">
          <input value={repoInput} onChange={(e) => setRepoInput(e.target.value)}
            placeholder={isGGUF ? "e.g. QuantFactory/Meta-Llama-3.2-3B-Instruct-GGUF" : "e.g. mlx-community/Llama-3.2-3B-Instruct-4bit"}
            className="flex-1 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2 text-sm outline-none"
            onKeyDown={(e) => e.key === "Enter" && handleResolve()} />
          <Button onClick={handleResolve} disabled={resolving || !repoInput.trim()} size="sm" className="rounded-xl">
            {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Resolve
          </Button>
        </div>

        {/* GGUF file list */}
        {isGGUF && repoInfo?.files?.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <p className="text-xs text-zinc-500">{repoInfo.files.length} files found</p>
            {repoInfo.files.map((f: any) => (
              <div key={f.filename} className="flex items-center justify-between p-2 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{f.filename}</div>
                  <div className="text-xs text-zinc-500">{f.human_size}</div>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl shrink-0 ml-2"
                  onClick={() => handleDownload(f.url, f.filename)} disabled={downloading}>
                  <Download className="h-3 w-3 mr-1" /> Download
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* MLX repo info */}
        {!isGGUF && repoInfo && (
          <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700">
            <div className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-green-500" />
              <span className="font-medium">{repoInfo.repo_id}</span>
            </div>
            <Button size="sm" className="mt-3 rounded-xl" onClick={() => handleDownload()} disabled={downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              {downloading ? progress || "Downloading..." : "Download Model"}
            </Button>
          </div>
        )}

        {downloading && progress && !isGGUF && (
          <div className="text-xs text-zinc-500 text-center">{progress}</div>
        )}
      {downloading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>{progress}</span>
              <span>{progressPct.toFixed(0)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
              <div className="h-full rounded-full bg-zinc-500 transition-all duration-300"
                style={{ width: `${Math.max(progressPct, 5)}%` }} />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
