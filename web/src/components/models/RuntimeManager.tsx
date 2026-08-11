import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ModelDownloadModal from "@/components/models/ModelDownloadModal";
import { DownloadsProvider } from "@/features/downloads/useDownloads";
import {
  HardDrive, Trash2, Cpu, CloudDownload, RefreshCw,
  Loader2, CheckCircle, XCircle, Server, Search, FolderOpen,
  ChevronDown, Image, Copy, ScanLine, ExternalLink, Download,
  Cpu as ChipIcon, Zap, Eye, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/utils/api";

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
    toast.success("Refreshed");
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
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

  // Minimalist capability/runtime status icon: green check (ready) or yellow ! (needs action).
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
  // Capability/engine status (prompt10: one GGUF runtime, granular readiness).
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
        <div className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          <h2 className="text-lg font-semibold">Runtime Manager</h2>
        </div>
      ) : (
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Runtime Manager
          </DialogTitle>
          <DialogDescription>
            Manage local inference (GGUF) and connect external runtimes (MLX, ComfyUI).
            Ollama and vLLM are configured in Settings → API Providers.
          </DialogDescription>
        </DialogHeader>
      )}
      <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={scanExternals} disabled={scanning}>
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanLine className="h-4 w-4" />}
            {scanning ? "Scanning..." : "Scan Host"}
          </Button>
        </div>

        <Tabs defaultValue="gguf" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="gguf" className="gap-2"><HardDrive className="h-4 w-4" /> GGUF</TabsTrigger>
            <TabsTrigger value="mlx" className="gap-2"><Cpu className="h-4 w-4" /> MLX</TabsTrigger>
            <TabsTrigger value="comfyui" className="gap-2"><Image className="h-4 w-4" /> ComfyUI</TabsTrigger>
          </TabsList>

        <TabsContent value="gguf" className="m-0 overflow-y-auto scrollbar-hide flex-1">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                GGUF <span className="font-normal text-muted-foreground">llama.cpp</span>
                <span className="text-muted-foreground"> · </span>
                <span className="font-mono text-xs">{ggufBackend}</span>
              </CardTitle>
              <Badge className={ggufReady ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}>
                <CheckCircle className="h-3 w-3 mr-1" />
                {ggufReady ? "Ready" : "Not installed"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            {/* ── Capabilities ── */}
            <div className="rounded-xl border p-3">
              <Label className="text-xs font-medium mb-2 block">Capabilities</Label>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-muted-foreground" /> Chat</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-6 gap-1" onClick={() => setDownloadModal("gguf")}>
                      <CloudDownload className="h-3 w-3" /> Download text model
                    </Button>
                    <StatusIcon ready={chatHasModel} tip={chatHasModel ? "Ready to use, select a model" : "Download a model to activate. If this persists, refresh or reinstall."} />
                  </div>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><Eye className="h-3.5 w-3.5 text-muted-foreground" /> Vision</span>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="h-6 gap-1" onClick={() => setDownloadModal("vision")}>
                      <CloudDownload className="h-3 w-3" /> Download vision model
                    </Button>
                    <StatusIcon ready={visionHasModel} tip={visionHasModel ? "Ready to use, select a model" : "Download a model to activate. If this persists, refresh or reinstall."} />
                  </div>
                </div>
              </div>
            </div>

            {/* ── Engine Configuration ── */}
            <Collapsible className="mt-4">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                <ChevronDown className="h-4 w-4" />
                Performance
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                {/* GPU Acceleration */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs">GPU acceleration</Label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={ggufConfig.n_gpu_layers < 0}
                    onClick={() => setGgufConfig(prev => ({
                      ...prev,
                      n_gpu_layers: prev.n_gpu_layers < 0 ? 0 : -1
                    }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      ggufConfig.n_gpu_layers < 0 ? "bg-blue-600" : "bg-neutral-300 dark:bg-neutral-600"
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                      ggufConfig.n_gpu_layers < 0 ? "translate-x-[18px]" : "translate-x-[3px]"
                    }`} />
                  </button>
                </div>

                {/* Detected GPU + install */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-xs">Detected GPU</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {gpuInfo?.has_gpu
                        ? `🎮 ${gpuInfo.gpu?.device || "GPU"} (${gpuInfo.gpu?.backend?.toUpperCase()})`
                        : "🖥️ No discrete GPU detected — using CPU"}
                    </p>
                  </div>
                  {gpuInfo?.has_gpu && !gpuInfo?.gpu_accelerated && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1"
                      onClick={installGpuAcceleration}
                      disabled={installingGpu}
                    >
                      {installingGpu ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
                      {installingGpu ? "Installing..." : "Install GPU Acceleration"}
                    </Button>
                  )}
                  {gpuInfo?.gpu_accelerated && (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> GPU Accelerated
                    </Badge>
                  )}
                </div>

                {/* Context Window */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label className="text-xs">Context window</Label>
                    <span className="text-xs font-mono text-muted-foreground">{(ggufConfig.n_ctx / 1024).toFixed(0)}K</span>
                  </div>
                  <input
                    type="range"
                    min="1024"
                    max="131072"
                    step="1024"
                    value={ggufConfig.n_ctx}
                    onChange={(e) => setGgufConfig(prev => ({ ...prev, n_ctx: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>1K</span>
                    <span>128K</span>
                  </div>
                  {gpuInfo?.vram_gb > 0 && (
                    <div className="mt-2 text-[10px] leading-tight rounded-md px-2 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <span className="font-medium">⚠️ {gpuInfo.gpu?.device}</span>
                      <span className="text-muted-foreground">
                        {" "}at {(ggufConfig.n_ctx / 1024).toFixed(0)}K context ({ggufConfig.cache_type_k} KV): max model ≈{" "}
                        <span className="font-mono">{estimateMaxModel(8).toFixed(1)}B (Q8)</span>,{" "}
                        <span className="font-mono">{estimateMaxModel(4).toFixed(1)}B (Q4)</span>
                      </span>
                    </div>
                  )}
                </div>

                {/* KV Cache Quality */}
                <div>
                  <Label className="text-xs">KV cache quality</Label>
                  <select
                    value={ggufConfig.cache_type_k}
                    onChange={(e) => setGgufConfig(prev => ({
                      ...prev,
                      cache_type_k: e.target.value,
                      cache_type_v: e.target.value,
                    }))}
                    className="w-full mt-1 h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    <option value="q8_0">Balanced (q8_0) — saves 50% memory</option>
                    <option value="f16">Maximum (f16) — full precision</option>
                  </select>
                </div>

                {/* Apply Button */}
                <Button
                  size="sm"
                  className="w-full gap-1"
                  onClick={applyGgufConfig}
                  disabled={applyingConfig}
                >
                  {applyingConfig ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {applyingConfig ? "Applying..." : "Apply & Reload"}
                </Button>
              </CollapsibleContent>
            </Collapsible>

            {/* ── Runtime Details ── */}
            <Collapsible className="mt-2">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                <ChevronDown className="h-4 w-4" />
                Runtime Details
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-1 text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>llama-cpp-python</span>
                  <span className="font-mono">{ggufRuntime?.version ? `v${ggufRuntime.version}` : "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>llama-server</span>
                  <span className={llamaServerPresent ? "text-green-600" : "text-amber-600"}>
                    {llamaServerPresent ? "available" : "not on PATH"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Build backend</span>
                  <span className="font-mono">{ggufBackend}</span>
                </div>
                {llamaServerPresent && ggufHealth?.version?.length > 0 && (
                  <div className="flex items-center justify-between">
                    <span>llama-server version</span>
                    <span className="font-mono truncate max-w-[60%]">{ggufHealth.version[0]}</span>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>

            {/* ── Models ── */}
            <div className="relative mt-4 mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search GGUF models..." value={ggufQuery}
                onChange={(e) => setGgufQuery(e.target.value)} className="pl-9" />
            </div>
            {loadingModels ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : ggufRows.length === 0 && visionRows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No GGUF models loaded</p>
                <p className="text-xs mt-1">Download a model from HuggingFace or place .gguf files in .lmwebui/models/</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                {ggufRows.map((model) => (
                  <div key={model.path} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{model.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{formatFileSize(model.size_bytes ?? model.size)}</span>
                          <Badge variant="outline" className="text-[0.5rem] h-4">text</Badge>
                          {model.quantization && <Badge variant="outline" className="text-[0.5rem] h-4">{model.quantization}</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteModel(model.name)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      <Button size="sm" onClick={() => { onModelLoad?.(model.name, "gguf"); onOpenChange(false); toast.success("Switched to " + model.name); }}>
                        Load
                      </Button>
                    </div>
                  </div>
                ))}
                {visionRows.map((b: any) => (
                  <div key={b.path} className="flex items-center justify-between p-3 rounded-lg border border-purple-200 dark:border-purple-800/50 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Eye className="h-4 w-4 text-purple-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{b.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{b.size}</span>
                          <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 text-[0.5rem] h-4">vision</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteVisionModel(b.name)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setDefaultVision(b.name)}>
                        Set default vision
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </TabsContent>

          <TabsContent value="mlx" className="m-0 overflow-y-auto scrollbar-hide flex-1">
        {/* ---------- MLX SECTION ---------- */}
        {mlxStatus?.available === false ? (
          /* MLX unsupported — hidden on non-Apple */
          null
        ) : (
          <Card className={mlxStatus?.mlx_installed ? "border-green-200 dark:border-green-800" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  MLX <span className="font-normal text-muted-foreground">Apple Silicon</span>
                </CardTitle>
                {mlxStatus?.mlx_installed ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" /> Ready
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-amber-300 text-amber-600">
                    <ChipIcon className="h-3 w-3 mr-1" /> Not Installed
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loadingMlx ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : (
                <>
                  {/* ── Capabilities ── */}
                  <div className="rounded-xl border p-3">
                    <Label className="text-xs font-medium mb-2 block">Capabilities</Label>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-muted-foreground" /> Chat</span>
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-6 gap-1" onClick={() => setDownloadModal("mlx")}>
                            <CloudDownload className="h-3 w-3" /> Download model
                          </Button>
                          <StatusIcon ready={(mlxStatus?.models_available || 0) > 0} tip={(mlxStatus?.models_available || 0) > 0 ? "Ready to use, select a model" : "Download a model to activate. If this persists, refresh or reinstall."} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ── Not installed callout ── */}
                  {!mlxStatus?.mlx_installed && (
                    <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/40 p-3 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        MLX needs to be installed via pip, then download a model from HuggingFace.
                      </p>
                      <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1">
                        <div className="flex items-center justify-between">
                          <span><span className="text-muted-foreground">$</span> pip install mlx mlx-lm mlx-optiq</span>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                            onClick={() => copyToClipboard("pip install mlx mlx-lm mlx-optiq")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between">
                          <span><span className="text-muted-foreground">$</span> mlx_lm.fetch --hf-path mlx-community/Llama-3.2-3B-Instruct-4bit</span>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                            onClick={() => copyToClipboard("mlx_lm.fetch --hf-path mlx-community/Llama-3.2-3B-Instruct-4bit")}>
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <Button size="sm" onClick={installMlx} disabled={installingMlx} className="w-full gap-1">
                        {installingMlx ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                        {installingMlx ? "Installing..." : "Install MLX"}
                      </Button>
                    </div>
                  )}

                  {/* ── Runtime Details ── */}
                  <Collapsible className="mt-4">
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                      <ChevronDown className="h-4 w-4" />
                      Runtime Details
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-2 pt-1 text-xs text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Hardware</span>
                        <span>{mlxStatus?.hardware_detected ? "Apple Silicon (M-series)" : "—"}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>mlx installed</span>
                        <span className={mlxStatus?.mlx_installed ? "text-green-600" : "text-amber-600"}>
                          {mlxStatus?.mlx_installed ? "yes" : "no"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Models</span>
                        <span>{mlxStatus?.models_available ?? 0}</span>
                      </div>
                      {mlxStatus?.models_dir && (
                        <div className="flex items-center justify-between">
                          <span>Models dir</span>
                          <span className="font-mono truncate max-w-[60%]">{mlxStatus.models_dir}</span>
                        </div>
                      )}
                    </CollapsibleContent>
                  </Collapsible>

                  {/* ── Models ── */}
                  {mlxStatus?.mlx_installed && (
                    <div className="mt-4">
                      <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search MLX models..." value={mlxQuery}
                          onChange={(e) => setMlxQuery(e.target.value)} className="pl-9" />
                      </div>
                      {mlxRows.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No MLX models loaded</p>
                          <p className="text-xs mt-1">Download a model from HuggingFace.</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                          {mlxRows.map((m: string) => (
                            <div key={m} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <Cpu className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                <span className="font-medium text-sm truncate">{m}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => deleteMlxModel(m)}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                                <Button size="sm" onClick={() => { onModelLoad?.(m, "mlx"); onOpenChange(false); toast.success("Switched to " + m); }}>
                                  Load
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}
          </TabsContent>

          <TabsContent value="comfyui" className="m-0 overflow-y-auto scrollbar-hide flex-1">
        {/* ---------- COMFYUI SECTION ---------- */}
        <Card className={comfyuiConnected ? "border-green-200 dark:border-green-800" : ""}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Image className="h-5 w-5 text-pink-500" />
                <CardTitle className="text-base">ComfyUI</CardTitle>
                {comfyuiConnected || detectedExternals.find(d => d.type === "comfyui") ? (
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    <CheckCircle className="h-3 w-3 mr-1" /> Running
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <XCircle className="h-3 w-3 mr-1" /> Not Detected
                  </Badge>
                )}
              </div>
            </div>
            <CardDescription>
              AI image generation with ComfyUI workflows. Install on host, then connect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {comfyuiConnected || detectedExternals.find(d => d.type === "comfyui") ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  ComfyUI running at {comfyuiEndpoint}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 gap-1"
                    onClick={() => window.open(comfyuiEndpoint, "_blank")}>
                    <ExternalLink className="h-3 w-3" /> Open ComfyUI
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 gap-1"
                    onClick={disconnectComfyui}>
                    <Trash2 className="h-3 w-3" /> Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <Input value={comfyuiEndpoint} onChange={(e) => setComfyuiEndpoint(e.target.value)}
                    placeholder="http://host.docker.internal:8188" className="flex-1" />
                  <Button size="sm" onClick={connectComfyui}>Connect</Button>
                </div>

                <Collapsible>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronDown className="h-3 w-3" />
                    Setup Instructions
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1 mt-2">
                      <div className="flex items-center justify-between">
                        <span><span className="text-muted-foreground">$</span> git clone https://github.com/comfyanonymous/ComfyUI</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard("git clone https://github.com/comfyanonymous/ComfyUI")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span><span className="text-muted-foreground">$</span> cd ComfyUI && pip install -r requirements.txt</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard("cd ComfyUI && pip install -r requirements.txt")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex items-center justify-between">
                        <span><span className="text-muted-foreground">$</span> python main.py --port 8188 --listen 0.0.0.0</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                          onClick={() => copyToClipboard("python main.py --port 8188 --listen 0.0.0.0")}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
    </>
  );

  if (inline) {
    return (
      <div className="h-full overflow-y-auto p-6 space-y-4">
        {body}
        <DownloadsProvider onComplete={() => { fetchModels(); fetchRuntimes(); fetchMlxInfo(); fetchVisionInfo(); }}>
          <ModelDownloadModal
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
        <ModelDownloadModal
          open={downloadModal !== null}
          onOpenChange={(o) => !o && setDownloadModal(null)}
          modelType={downloadModal === "mlx" ? "mlx" : "gguf"}
          variant={downloadModal === "vision" ? "vision" : "text"}
        />
      </DownloadsProvider>
    </Dialog>
  );
}
