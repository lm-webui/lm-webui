import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ModelDownloader from "./ModelDownloader";
import { DownloadsProvider } from "@/features/downloads/useDownloads";
import { LlamaCppTab } from "./LlamaCppTab";
import { MLXTab } from "./MLXTab";
import { ImageGenTab } from "./ImageGenTab";
import { Loader2, CheckCircle, Server, ScanLine, Download, AlertTriangle, RefreshCw } from "lucide-react";
import { RiImageAiFill } from "react-icons/ri";
import { SiHuggingface, SiApple } from "react-icons/si";
import { toast } from "sonner";
import { authFetch } from "@/utils/api";
import { copyText } from "@/lib/clipboard";

interface Runtime {
  type: string;
  name: string;
  installed: boolean;
  status: string;
  version?: string;
  port?: number;
  endpoint?: string;
  install_hint?: string;
  managed?: boolean;
  models_count?: number;
}

interface GGUFModel {
  name: string;
  path: string;
  size: number | string;
  size_bytes?: number;
  quantization?: string;
}

interface MLXStatus {
  runtime: string;
  available: boolean;
  hardware_detected: boolean;
  mlx_installed: boolean;
  models_available: number;
  models?: string[];
  models_dir?: string;
  reason?: string;
}

interface DetectedExternal {
  type: string;
  installed: boolean;
  status: string;
  port?: number;
  endpoint?: string;
}

interface RuntimeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelLoad?: (modelName: string, provider?: string) => void;
  /** When true, renders the tabs inline as a page instead of in a Dialog modal. */
  inline?: boolean;
}

export default function RuntimeManager({ open, onOpenChange, onModelLoad, inline = false }: RuntimeManagerProps) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [models, setModels] = useState<GGUFModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [ggufQuery, setGgufQuery] = useState("");
  const [mlxQuery, setMlxQuery] = useState("");
  const [downloadModal, setDownloadModal] = useState<"gguf" | "vision" | "mlx" | null>(null);
  const [mlxStatus, setMlxStatus] = useState<MLXStatus | null>(null);
  const [loadingMlx, setLoadingMlx] = useState(false);
  const [visionStatus, setVisionStatus] = useState<any>(null);
  const [ggufHealth, setGgufHealth] = useState<any>(null);
  const [installingMlx, setInstallingMlx] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detectedExternals, setDetectedExternals] = useState<DetectedExternal[]>([]);
  const [comfyuiConnected, setComfyuiConnected] = useState(false);
  const [comfyuiEndpoint, setComfyuiEndpoint] = useState("http://host.docker.internal:8188");
  const [comfyDownloadOpen, setComfyDownloadOpen] = useState(false);
  const [comfyPresets, setComfyPresets] = useState<any[]>([]);
  const [comfyProgress, setComfyProgress] = useState<Record<string, number>>({});
  const [comfyDownloading, setComfyDownloading] = useState<string | null>(null);
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [gpuInfo, setGpuInfo] = useState<any>(null);
  const [installingGpu, setInstallingGpu] = useState(false);
  const [ggufConfig, setGgufConfig] = useState({
    n_ctx: 4096,
    n_gpu_layers: -1,
    cache_type_k: "q8_0",
    cache_type_v: "q8_0",
  });

  useEffect(() => {
    if (inline || open) {
      fetchRuntimes();
      fetchModels();
      fetchMlxInfo();
      fetchVisionInfo();
      fetchGgufHealth();
      fetchGgufConfig();
      scanExternals();
      fetchGpuInfo();
    }
  }, [inline, open]);

  const fetchRuntimes = async () => {
    try {
      const data = await authFetch("/api/runtimes");
      setRuntimes(data.runtimes || []);
    } catch (error) {
      console.error("Failed to fetch runtimes:", error);
    }
  };

  const fetchModels = async () => {
    setLoadingModels(true);
    try {
      const data = await authFetch("/api/models/local");
      setModels(data.models || []);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    } finally {
      setLoadingModels(false);
    }
  };

  const fetchMlxInfo = async () => {
    setLoadingMlx(true);
    try {
      const data = await authFetch("/api/runtimes/mlx/status");
      setMlxStatus(data);
    } catch (error) {
      console.error("Failed to fetch MLX info:", error);
    } finally {
      setLoadingMlx(false);
    }
  };

  const fetchVisionInfo = async () => {
    try {
      const data = await authFetch("/api/runtimes/vision/status");
      setVisionStatus(data);
    } catch (error) {
      console.error("Failed to fetch vision info:", error);
    }
  };

  const installMlx = async () => {
    setInstallingMlx(true);
    try {
      await authFetch("/api/runtimes/mlx/install", { method: "POST" });
      toast.success("MLX installed. Refresh to verify.");
      await fetchMlxInfo();
    } catch (error: any) {
      toast.error(error.message || "MLX install failed");
    } finally {
      setInstallingMlx(false);
    }
  };

  const scanExternals = async () => {
    setScanning(true);
    try {
      const data = await authFetch("/api/runtimes/scan", { method: "POST" });
      const detected = Object.entries(data.detected || {}).map(([type, info]: [string, any]) => ({
        type,
        installed: info.installed,
        status: info.status,
        port: info.port,
        endpoint: info.endpoint,
      }));
      setDetectedExternals(detected);

      // Auto-detect ComfyUI
      const comfy = detected.find((d: DetectedExternal) => d.type === "comfyui");
      setComfyuiConnected(!!comfy);
      if (comfy?.endpoint) setComfyuiEndpoint(comfy.endpoint);
    } catch (error) {
      console.error("Scan failed:", error);
    } finally {
      setScanning(false);
    }
  };

  const fetchGgufHealth = async () => {
    try {
      const data = await authFetch("/api/runtimes/gguf/health");
      setGgufHealth(data);
    } catch (error) {
      console.error("Failed to fetch GGUF runtime health:", error);
    }
  };

  const fetchGgufConfig = async () => {
    try {
      const data = await authFetch("/api/models/gguf/config");
      if (data) {
        setGgufConfig({
          n_ctx: data.n_ctx ?? 4096,
          n_gpu_layers: data.n_gpu_layers ?? -1,
          cache_type_k: data.cache_type_k ?? "q8_0",
          cache_type_v: data.cache_type_v ?? "q8_0",
        });
      }
    } catch (error) {
      console.error("Failed to fetch GGUF config:", error);
    }
  };

  const applyGgufConfig = async () => {
    setApplyingConfig(true);
    try {
      await authFetch("/api/models/gguf/config", {
        method: "POST",
        body: JSON.stringify({
          n_ctx: ggufConfig.n_ctx,
          n_gpu_layers: ggufConfig.n_gpu_layers,
          cache_type_k: ggufConfig.cache_type_k,
          cache_type_v: ggufConfig.cache_type_v,
        }),
      });
      toast.success("GGUF config applied. Model will reload on next load.");
    } catch (error: any) {
      toast.error(error.message || "Failed to apply config");
    } finally {
      setApplyingConfig(false);
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchRuntimes(), fetchModels(), fetchMlxInfo(), fetchGpuInfo(), fetchVisionInfo(), fetchGgufHealth()]);
    setLoading(false);
    toast.success("Runtime status refreshed");
  };

  const fetchGpuInfo = async () => {
    try {
      const data = await authFetch("/api/models/gguf/gpu");
      setGpuInfo(data);
    } catch (error) {
      console.error("Failed to fetch GPU info:", error);
    }
  };

  const installGpuAcceleration = async () => {
    setInstallingGpu(true);
    try {
      await authFetch("/api/models/gguf/gpu-install", { method: "POST" });
      toast.success("GPU acceleration installed. Restart to take effect.");
      await fetchGpuInfo();
    } catch (error: any) {
      toast.error(error.message || "GPU acceleration install failed");
    } finally {
      setInstallingGpu(false);
    }
  };

  const connectComfyui = async () => {
    try {
      await authFetch("/api/runtimes/external", {
        method: "POST",
        body: JSON.stringify({ runtime_type: "comfyui", endpoint: comfyuiEndpoint }),
      });
      setComfyuiConnected(true);
      toast.success("ComfyUI connected");
      await fetchRuntimes();
    } catch (error: any) {
      toast.error(error.message || "Failed to connect ComfyUI");
    }
  };

  const disconnectComfyui = async () => {
    toast.info("ComfyUI disconnected (remove endpoint to fully unregister)");
    setComfyuiConnected(false);
  };

  const openComfyDownload = async () => {
    setComfyDownloadOpen(true);
    try {
      const res = await authFetch("/api/comfyui/presets");
      setComfyPresets(res?.presets || []);
    } catch {
      toast.error("Failed to load diffusion model presets");
    }
  };

  const downloadComfyModel = async (preset: any) => {
    setComfyDownloading(preset.id);
    setComfyProgress((p) => ({ ...p, [preset.id]: 0 }));
    try {
      const res = await authFetch("/api/comfyui/download", {
        method: "POST",
        body: JSON.stringify({ model_id: preset.id }),
      });
      const { task_id } = res;
      const poll = setInterval(async () => {
        try {
          const s = await authFetch(`/api/models/download/status/${task_id}`);
          const pct = s.progress || 0;
          setComfyProgress((p) => ({ ...p, [preset.id]: pct }));
          if (s.status === "completed" || s.status === "exists") {
            clearInterval(poll);
            setComfyDownloading(null);
            toast.success(s.status === "exists" ? "Model already exists" : "Model downloaded");
          } else if (s.status === "failed" || s.status === "cancelled") {
            clearInterval(poll);
            setComfyDownloading(null);
            toast.error(s.error || "Download failed");
          }
        } catch {
          clearInterval(poll);
          setComfyDownloading(null);
          toast.error("Download failed");
        }
      }, 800);
    } catch (e: any) {
      setComfyDownloading(null);
      toast.error(e.message || "Download failed");
    }
  };

  const copyToClipboard = async (text: string) => {
    const ok = await copyText(text);
    if (ok) toast.success("Copied to clipboard");
    else toast.error("Failed to copy");
  };

  // Estimate max model size (billions of params) that fits GPU VRAM at a given context.
  const estimateMaxModel = (qBits: number) => {
    const vram = (gpuInfo?.vram_gb || 0) - 1.5;  // subtract system overhead
    const kvBits = ggufConfig.cache_type_k === "f16" ? 16 : 8;
    const modelFactor = (qBits / 8) * 1.15;
    const kvFactor = ggufConfig.n_ctx * (kvBits / 16) * 0.000012;
    return vram > 0 ? Math.max(0, vram / (modelFactor + kvFactor)) : 0;
  };

  const formatFileSize = (bytes: number | string) => {
    const n = Number(bytes);
    if (!Number.isFinite(n)) return String(bytes); // already a formatted string or NaN-safe
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    if (n < 1024 * 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
    return (n / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const deleteModel = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await authFetch(`/api/models/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success(`Deleted ${name}`);
      fetchModels();
      fetchVisionInfo();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    }
  };

  const setDefaultVision = async (name: string) => {
    try {
      await authFetch("/api/settings/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: name }),
      });
      toast.success(`Default vision model set to ${name}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to set default vision model");
    }
  };

  const deleteVisionModel = async (name: string) => {
    if (!confirm(`Delete vision model ${name} (bundle)?`)) return;
    try {
      await authFetch(`/api/models/vision/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success(`Deleted ${name}`);
      fetchVisionInfo();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    }
  };

  const deleteMlxModel = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    try {
      await authFetch(`/api/mlx/models/${encodeURIComponent(name)}`, { method: "DELETE" });
      toast.success(`Deleted ${name}`);
      fetchMlxInfo();
    } catch (error: any) {
      toast.error(error.message || "Delete failed");
    }
  };

  // Status icon: green = ready, yellow = needs action
  const StatusIcon = ({ ready, tip }: { ready: boolean; tip: string }) => (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          {ready ? (
            <CheckCircle className="h-4 w-4 text-green-600 cursor-help" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-500 cursor-help" />
          )}
        </TooltipTrigger>
        <TooltipContent>{tip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  const ggufRuntime = runtimes.find(r => r.type === "gguf");
  const ggufReady = !!ggufRuntime?.installed;
  // Capability/engine status
  const llamaServerPresent = !!ggufHealth?.executables?.llama_server;
  const ggufBackend = gpuInfo?.has_gpu ? (gpuInfo.gpu?.backend || "gpu").toUpperCase() : "CPU";

  // Combined model rows: GGUF (models/gguf) + vision bundles (models/vision/<m>/).
  const q = ggufQuery.toLowerCase();
  const ggufRows = models.filter(m => m.name.toLowerCase().includes(q));
  const visionRows = (visionStatus?.bundles || []).filter((b: any) => b.name.toLowerCase().includes(q));
  const mlxQueryL = mlxQuery.toLowerCase();
  const mlxRows = (mlxStatus?.models || []).filter((m: string) => m.toLowerCase().includes(mlxQueryL));
  // Capability readiness = a usable model exists (search-independent).
  const chatHasModel = models.length > 0;
  const visionHasModel = (visionStatus?.bundles || []).length > 0;

  const body = (
    <>
      {inline ? (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Server className="h-5 w-5" />
            <div>
              <h2 className="text-lg font-semibold">Runtime Manager</h2>
              <p className="text-xs text-muted-foreground">Configure inference engines, AI models, and hardware acceleration.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button variant="outline" size="sm" onClick={scanExternals} disabled={scanning}>
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4 mr-2" />}
              {scanning ? "Scanning…" : "Scan Host"}
            </Button>
          </div>
        </div>
      ) : (
        <DialogHeader>
          <div className="flex items-center justify-between pr-2">
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Runtime Manager
            </DialogTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={scanExternals} disabled={scanning}>
                {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
                {scanning ? "Scanning..." : "Scan Host"}
              </Button>
            </div>
          </div>
          <DialogDescription>
            Manage local inference (llama.cpp) and connect external runtimes (MLX, ComfyUI).
            Ollama and vLLM are configured in Settings → API Providers.
          </DialogDescription>
        </DialogHeader>
      )}

        <Tabs defaultValue="gguf" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="gguf" className="gap-2"><SiHuggingface className="h-4 w-4" /> llama.cpp</TabsTrigger>
            <TabsTrigger value="mlx" className="gap-2"><SiApple className="h-4 w-4" /> MLX</TabsTrigger>
            <TabsTrigger value="comfyui" className="gap-2"><RiImageAiFill className="h-4 w-4" /> Image-Gen</TabsTrigger>
          </TabsList>

        <TabsContent value="gguf" className="m-0 overflow-y-auto scrollbar-hide flex-1">
          <LlamaCppTab
            loadingModels={loadingModels}
            ggufQuery={ggufQuery}
            setGgufQuery={setGgufQuery}
            ggufRows={ggufRows}
            visionRows={visionRows}
            ggufHealth={ggufHealth}
            ggufConfig={ggufConfig}
            setGgufConfig={setGgufConfig}
            applyingConfig={applyingConfig}
            applyGgufConfig={applyGgufConfig}
            gpuInfo={gpuInfo}
            installingGpu={installingGpu}
            installGpuAcceleration={installGpuAcceleration}
            ggufRuntime={ggufRuntime}
            ggufReady={ggufReady}
            ggufBackend={ggufBackend}
            llamaServerPresent={llamaServerPresent}
            chatHasModel={chatHasModel}
            visionHasModel={visionHasModel}
            setDownloadModal={setDownloadModal}
            deleteModel={deleteModel}
            deleteVisionModel={deleteVisionModel}
            setDefaultVision={setDefaultVision}
            estimateMaxModel={estimateMaxModel}
            formatFileSize={formatFileSize}
            StatusIcon={StatusIcon}
            onModelLoad={onModelLoad}
            onOpenChange={onOpenChange}
          />
        </TabsContent>

          <TabsContent value="mlx" className="m-0 overflow-y-auto scrollbar-hide flex-1">
          <MLXTab
            mlxStatus={mlxStatus}
            loadingMlx={loadingMlx}
            mlxQuery={mlxQuery}
            setMlxQuery={setMlxQuery}
            mlxRows={mlxRows}
            installingMlx={installingMlx}
            installMlx={installMlx}
            deleteMlxModel={deleteMlxModel}
            setDownloadModal={setDownloadModal}
            copyToClipboard={copyToClipboard}
            StatusIcon={StatusIcon}
            onModelLoad={onModelLoad}
            onOpenChange={onOpenChange}
          />
          </TabsContent>

          <TabsContent value="comfyui" className="m-0 overflow-y-auto scrollbar-hide flex-1">
          <ImageGenTab
            comfyuiConnected={comfyuiConnected}
            comfyuiEndpoint={comfyuiEndpoint}
            setComfyuiEndpoint={setComfyuiEndpoint}
            detectedExternals={detectedExternals}
            connectComfyui={connectComfyui}
            disconnectComfyui={disconnectComfyui}
            openComfyDownload={openComfyDownload}
            copyToClipboard={copyToClipboard}
          />
          </TabsContent>
        </Tabs>


        {/* Image-gen UI checkpoint download */}
        <Dialog open={comfyDownloadOpen} onOpenChange={setComfyDownloadOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Download Image-Gen model</DialogTitle>
              <DialogDescription>
                Downloads a checkpoint into the local ComfyUI models/checkpoints directory.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {comfyPresets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No presets available.</p>
              ) : (
                comfyPresets.map((p) => {
                  const progress = comfyProgress[p.id];
                  const isActive = comfyDownloading === p.id;
                  const done = progress !== undefined && progress >= 100;
                  return (
                    <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.filename} · {p.size}</div>
                        {isActive && (
                          <div className="mt-1 h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden">
                            <div className="h-full rounded-full bg-zinc-500 transition-all" style={{ width: `${Math.max(progress || 0, 2)}%` }} />
                          </div>
                        )}
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0 gap-1"
                        onClick={() => downloadComfyModel(p)} disabled={comfyDownloading !== null}>
                        {isActive ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        {isActive ? `${Math.round(progress || 0)}%` : done ? "Done" : "Download"}
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>
    </>
  );

  if (inline) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        {body}
        <DownloadsProvider onComplete={() => { fetchModels(); fetchRuntimes(); fetchMlxInfo(); fetchVisionInfo(); }}>
          <ModelDownloader
            open={downloadModal !== null}
            onOpenChange={(o) => !o && setDownloadModal(null)}
            modelType={downloadModal === "mlx" ? "mlx" : "gguf"}
            variant={downloadModal === "vision" ? "vision" : "text"}
          />
        </DownloadsProvider>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl min-h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        {body}
      </DialogContent>
      <DownloadsProvider onComplete={() => { fetchModels(); fetchRuntimes(); fetchMlxInfo(); fetchVisionInfo(); }}>
        <ModelDownloader
          open={downloadModal !== null}
          onOpenChange={(o) => !o && setDownloadModal(null)}
          modelType={downloadModal === "mlx" ? "mlx" : "gguf"}
          variant={downloadModal === "vision" ? "vision" : "text"}
        />
      </DownloadsProvider>
    </Dialog>
  );
}
