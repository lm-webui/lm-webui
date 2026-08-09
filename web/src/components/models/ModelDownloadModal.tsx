/**
 * ModelDownloadModal — resolve a HuggingFace repo and download GGUF or MLX models.
 * GGUF (text + vision) downloads run through the global DownloadsProvider so they
 * survive modal/runtime close and resync on reopen. MLX stays a simple inline download.
 */
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Search, Check, HardDrive, Cpu, Clock } from "lucide-react";
import { toast } from "sonner";
import { notifyModelsChanged } from "@/features/models/modelEvents";
import { useDownloads } from "@/features/downloads/useDownloads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelType: "gguf" | "mlx";
  /** Which model the user is downloading — drives the HuggingFace reference link. */
  variant?: "text" | "vision";
}

export default function ModelDownloadModal({ open, onOpenChange, modelType, variant = "text" }: Props) {
  const [repoInput, setRepoInput] = useState("");
  const [resolving, setResolving] = useState(false);
  const [repoInfo, setRepoInfo] = useState<any>(null);
  const [selectedFiles, setSelectedFiles] = useState<Record<string, boolean>>({});
  const [mlxDownloading, setMlxDownloading] = useState(false);
  const [mlxProgress, setMlxProgress] = useState(0);
  const { downloads, startDownload } = useDownloads();
  const BASE = import.meta.env.VITE_BACKEND_URL || "";
  const isGGUF = modelType === "gguf";
  const isVision = isGGUF && variant === "vision";
  const isMmproj = (name: string) => name.toLowerCase().includes("mmproj");
  const repoFiles = repoInfo?.files || [];
  const selectedMain = isVision ? repoFiles.filter((f: any) => selectedFiles[f.filename] && !isMmproj(f.filename)) : [];
  const selectedMmproj = isVision ? repoFiles.filter((f: any) => selectedFiles[f.filename] && isMmproj(f.filename)) : [];
  const canDownload = selectedMain.length > 0 && selectedMmproj.length > 0;
  const toggleFile = (filename: string) => setSelectedFiles(prev => ({ ...prev, [filename]: !prev[filename] }));
  const activeDownloads = Object.values(downloads).filter(d => d.status === "queued" || d.status === "downloading");

  // Reset on each open — the modal is a single shared instance for text/vision/mlx,
  // so a leftover repoInput would otherwise leak across variants.
  useEffect(() => {
    if (open) {
      setRepoInput("");
      setRepoInfo(null);
      setSelectedFiles({});
      setMlxProgress(0);
    }
  }, [open]);

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
        setRepoInfo(await res.json());
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

  // GGUF text: start a background download (tracked globally).
  const handleDownload = async (url?: string, filename?: string) => {
    try {
      await startDownload(url || "", filename || "");
    } catch (e: any) {
      toast.error(e.message || "Download failed");
    }
  };

  // Vision: start the selected main + mmproj as background downloads.
  const handleDownloadSelected = async () => {
    if (!canDownload) return;
    const subdir = `vision/${repoInput.trim().split("/").pop()}`;
    try {
      await Promise.all([...selectedMain, ...selectedMmproj].map((f: any) => startDownload(f.url, f.filename, subdir)));
    } catch {
      toast.error("Download failed. Check your connection.");
    }
  };

  // MLX: simple inline download (not background-managed).
  const handleDownloadMLX = async () => {
    setMlxDownloading(true);
    setMlxProgress(30);
    try {
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
        setMlxProgress(pct);
        if (st.status === "completed" || st.status === "failed" || st.status === "exists") {
          clearInterval(poll);
          if (st.status === "completed") toast.success("Model downloaded");
          else if (st.status === "exists") toast.info("Model already exists");
          else toast.error(st.error || "Download failed");
          setMlxDownloading(false);
          notifyModelsChanged();
          onOpenChange(false);
        }
      }, 800);
    } catch (e: any) {
      toast.error(e.message || "Download failed");
      setMlxDownloading(false);
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
        {isVision && repoInfo?.files?.length > 0 && (
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
              return (
                <div key={f.filename} className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
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
                        onClick={() => handleDownload(f.url, f.filename)}>
                        <Download className="h-3 w-3 mr-1" /> Download
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Vision: download selected pair */}
        {isVision && repoInfo?.files?.length > 0 && (
          <>
            <Button size="sm" className="w-full rounded-xl gap-1" onClick={handleDownloadSelected} disabled={!canDownload}>
              <Download className="h-4 w-4" />
              {`Download selected (${selectedMain.length + selectedMmproj.length})`}
            </Button>
            {!canDownload && (
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
            <Button size="sm" className="mt-3 rounded-xl" onClick={handleDownloadMLX} disabled={mlxDownloading}>
              {mlxDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
              {mlxDownloading ? `Downloading ${mlxProgress.toFixed(0)}%` : "Download Model"}
            </Button>
          </div>
        )}

        {/* Active GGUF downloads (global, survives modal close) */}
        {activeDownloads.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500">Downloads</p>
            {activeDownloads.map((d) => (
              <div key={d.task_id} className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="w-36 truncate shrink-0">{d.filename}</span>
                {d.status === "queued" ? (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Clock className="h-3 w-3" /> In queue — another model is downloading
                  </span>
                ) : (
                  <>
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                      <div className="h-full rounded-full bg-zinc-500 transition-all" style={{ width: `${Math.max(d.progress || 0, 2)}%` }} />
                    </div>
                    <span>{Math.round(d.progress || 0)}%</span>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
