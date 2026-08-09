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
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [fileProgress, setFileProgress] = useState<Record<string, { pct: number; status: string }>>({});
  const BASE = import.meta.env.VITE_BACKEND_URL || "";
  const isGGUF = modelType === "gguf";
  const isVision = isGGUF && variant === "vision";
  const isMmproj = (name: string) => name.toLowerCase().includes("mmproj");
  const repoFiles = repoInfo?.files || [];
  const selectedMain = isVision ? repoFiles.filter((f: any) => selectedFiles[f.filename] && !isMmproj(f.filename)) : [];
  const selectedMmproj = isVision ? repoFiles.filter((f: any) => selectedFiles[f.filename] && isMmproj(f.filename)) : [];
  const canDownload = selectedMain.length > 0 && selectedMmproj.length > 0;
  const toggleFile = (filename: string) => setSelectedFiles(prev => ({ ...prev, [filename]: !prev[filename] }));

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
        // Vision downloads route into models/vision/<model>/ so the runtime can find the bundle.
        const visionSubdir = variant === "vision" && repoInput.trim()
          ? `vision/${repoInput.trim().split("/").pop()}`
          : undefined;
        const res = await fetch(`${BASE}/api/models/download`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ file_url: url, filename, ...(visionSubdir ? { subdir: visionSubdir } : {}) }),
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
        const res = await fetch(`${BASE}/api/mlx/download`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ repo_id: repoInput.trim() }),
        });
        if (!res.ok) throw new Error("Download failed");
        const { task_id } = await res.json();
        const poll = setInterval(async () => {
          const s = await fetch(`${BASE}/api/mlx/download/status/${task_id}`, { credentials: "include" });
          const st = await s.json();
          const pct = st.progress || 0;
          setProgressPct(pct);
          setProgress(st.status === "completed" ? "✅ Complete" : st.status === "exists" ? "Already exists" : `Downloading ${pct.toFixed(0)}%`);
          if (st.status === "completed" || st.status === "failed" || st.status === "exists") {
            clearInterval(poll);
            if (st.status === "completed") toast.success("Model downloaded");
            else if (st.status === "exists") toast.info("Model already exists");
            else toast.error(st.error || "Download failed");
            setDownloading(false);
            onComplete();
            notifyModelsChanged();
            onOpenChange(false);
          }
        }, 800);
      }
    } catch (e: any) {
      toast.error(e.message || "Download failed");
      setDownloading(false);
    }
  };

  // Download one file, tracking per-file progress; resolves to the terminal status.
  const startOneDownload = async (url: string, filename: string, subdir?: string): Promise<string> => {
    setFileProgress(prev => ({ ...prev, [filename]: { pct: 0, status: "starting" } }));
    const res = await fetch(`${BASE}/api/models/download`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ file_url: url, filename, ...(subdir ? { subdir } : {}) }),
    });
    if (!res.ok) throw new Error("Download failed");
    const { task_id } = await res.json();
    return new Promise((resolve) => {
      const poll = setInterval(async () => {
        try {
          const s = await fetch(`${BASE}/api/models/download/status/${task_id}`, { credentials: "include" });
          const st = await s.json();
          const pct = st.progress || 0;
          setFileProgress(prev => ({ ...prev, [filename]: { pct, status: st.status } }));
          if (st.status === "completed" || st.status === "exists" || st.status === "failed") {
            clearInterval(poll);
            resolve(st.status);
          }
        } catch { /* transient — keep polling */ }
      }, 800);
    });
  };

  // Vision: download the selected main + mmproj concurrently; close only when both complete.
  const handleDownloadSelected = async () => {
    if (!canDownload || downloading) return;
    setDownloading(true);
    const subdir = `vision/${repoInput.trim().split("/").pop()}`;
    try {
      const statuses = await Promise.all(
        [...selectedMain, ...selectedMmproj].map((f: any) => startOneDownload(f.url, f.filename, subdir)),
      );
      const ok = statuses.every(s => s === "completed" || s === "exists");
      if (ok) {
        toast.success("Vision model bundle downloaded");
        onComplete();
        notifyModelsChanged();
        onOpenChange(false);
      } else {
        toast.error("Some files failed to download — please retry.");
      }
    } catch {
      toast.error("Download failed. Check your connection.");
    } finally {
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

        <div className="-mt-1 text-xs text-muted-foreground">
          model reference:{" "}
          <a
            href={isGGUF
              ? (variant === "vision"
                ? "https://huggingface.co/models?pipeline_tag=image-text-to-text&library=gguf&sort=downloads"
                : "https://huggingface.co/models?pipeline_tag=text-generation&library=gguf&sort=downloads")
              : "https://huggingface.co/models?pipeline_tag=text-generation&apps=mlx-lm&sort=trending&search=mlx"}
            target="_blank"
            rel="noreferrer"
            className="text-blue-500 hover:underline"
          >
            {isGGUF
              ? (variant === "vision"
                ? "huggingface.co/models (image-text-to-text · gguf)"
                : "huggingface.co/models (text-generation · gguf)")
              : "huggingface.co/models (MLX · text-generation)"}
          </a>
        </div>

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

        {/* Vision guidance */}
        {isGGUF && variant === "vision" && repoInfo?.files?.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-200">
            <div className="font-semibold">Vision model</div>
            <p className="mt-1">
              Download the <b>main model</b> and its <b>mmproj</b> (multimodal projector) — both are required.
              They are saved together under <code className="font-mono">models/vision/&lt;model&gt;/</code>.
            </p>
          </div>
        )}

        {/* GGUF file list */}
        {isGGUF && repoInfo?.files?.length > 0 && (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <p className="text-xs text-zinc-500">{repoInfo.files.length} files found</p>
            {repoInfo.files.map((f: any) => {
              const isM = isMmproj(f.filename);
              const fp = fileProgress[f.filename];
              return (
                <div key={f.filename} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      disabled={downloading}
                      onClick={() => isVision && toggleFile(f.filename)}
                      className={`flex-1 min-w-0 text-left flex items-center gap-2 ${isVision ? "cursor-pointer" : "cursor-default"}`}
                    >
                      {isVision && (
                        <span className={`h-4 w-4 shrink-0 rounded border flex items-center justify-center ${selectedFiles[f.filename] ? "bg-zinc-600 border-zinc-600" : "border-zinc-400"}`}>
                          {selectedFiles[f.filename] && <Check className="h-3 w-3 text-white" />}
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="text-sm truncate block">{f.filename}</span>
                        <span className="text-xs text-zinc-500">{f.human_size}{isM ? " · mmproj" : " · model"}</span>
                      </span>
                    </button>
                    {!isVision && (
                      <Button size="sm" variant="outline" className="rounded-xl shrink-0 ml-2"
                        onClick={() => handleDownload(f.url, f.filename)} disabled={downloading}>
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                    )}
                  </div>
                  {isVision && fp && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-zinc-500">
                      <span className="w-24 shrink-0">{fp.status}</span>
                      <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                        <div className="h-full rounded-full bg-zinc-500 transition-all" style={{ width: `${Math.max(fp.pct, 2)}%` }} />
                      </div>
                      <span>{fp.pct.toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Vision: download selected pair */}
        {isVision && repoInfo?.files?.length > 0 && (
          <>
            <Button size="sm" className="w-full rounded-xl gap-1" onClick={handleDownloadSelected} disabled={!canDownload || downloading}>
              {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {downloading ? "Downloading..." : `Download selected (${selectedMain.length + selectedMmproj.length})`}
            </Button>
            {!canDownload && !downloading && (
              <p className="text-xs text-amber-600">Select one main model and one mmproj to download the bundle.</p>
            )}
          </>
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
      {downloading && !isVision && (
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
