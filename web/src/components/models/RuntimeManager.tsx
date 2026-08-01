import React, { useEffect, useState } from "react";
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
import ModelDownloadModal from "@/components/models/ModelDownloadModal";
import {
  HardDrive, Trash2, Cpu, CloudDownload, RefreshCw,
  Loader2, CheckCircle, XCircle, Server, Search, FolderOpen,
  ChevronDown, Image, Copy, ScanLine, ExternalLink, Download,
  Cpu as ChipIcon, Zap,
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
  size: number;
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
  onModelLoad?: (modelName: string) => void;
  /** When true, renders the tabs inline as a page instead of in a Dialog modal. */
  inline?: boolean;
}

export default function RuntimeManager({ open, onOpenChange, onModelLoad, inline = false }: RuntimeManagerProps) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [models, setModels] = useState<GGUFModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [ggufQuery, setGgufQuery] = useState("");
  const [downloadModal, setDownloadModal] = useState<"gguf" | null>(null);
  const [mlxStatus, setMlxStatus] = useState<MLXStatus | null>(null);
  const [loadingMlx, setLoadingMlx] = useState(false);
  const [installingMlx, setInstallingMlx] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [detectedExternals, setDetectedExternals] = useState<DetectedExternal[]>([]);
  const [comfyuiConnected, setComfyuiConnected] = useState(false);
  const [comfyuiEndpoint, setComfyuiEndpoint] = useState("http://host.docker.internal:8188");
  const [ggufConfig, setGgufConfig] = useState({
    n_ctx: 4096,
    n_gpu_layers: -1,
    cache_type_k: "q8_0",
    cache_type_v: "q8_0",
  });
  const [applyingConfig, setApplyingConfig] = useState(false);
  const [gpuInfo, setGpuInfo] = useState<any>(null);
  const [installingGpu, setInstallingGpu] = useState(false);

  useEffect(() => {
    if (inline || open) {
      fetchRuntimes();
      fetchModels();
      fetchMlxInfo();
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
    await Promise.all([fetchRuntimes(), fetchModels(), fetchMlxInfo(), fetchGpuInfo()]);
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(ggufQuery.toLowerCase())
  );

  const ggufRuntime = runtimes.find(r => r.type === "gguf");
  const ggufReady = ggufRuntime?.installed;

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
              <div className="flex items-center gap-2">
                <HardDrive className="h-5 w-5 text-green-600" />
                <CardTitle className="text-base">GGUF (llama.cpp)</CardTitle>
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  {ggufReady ? "Ready" : "Loading..."}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 gap-1 rounded-xl"
                  onClick={() => setDownloadModal("gguf")}>
                  <CloudDownload className="h-3 w-3" /> Download Model
                </Button>
              </div>
            </div>
            <CardDescription>
              Local inference engine — bundled in-container. Always available.
              {ggufRuntime?.version && <> v{ggufRuntime.version}</>}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search GGUF models..." value={ggufQuery}
                onChange={(e) => setGgufQuery(e.target.value)} className="pl-9" />
            </div>
            {loadingModels ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : filteredModels.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No GGUF models loaded</p>
                <p className="text-xs mt-1">Download a model from HuggingFace or place .gguf files in .lmwebui/models/</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                {filteredModels.map((model) => (
                  <div key={model.path} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <HardDrive className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{model.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2">
                          <span>{formatFileSize(model.size)}</span>
                          {model.quantization && <Badge variant="outline" className="text-[0.5rem] h-4">{model.quantization}</Badge>}
                        </div>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => { onModelLoad?.(model.name); onOpenChange(false); toast.success("Switched to " + model.name); }}>
                      Load
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Engine Configuration ── */}
            <Collapsible className="mt-4">
              <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors w-full py-2">
                <ChevronDown className="h-4 w-4" />
                Engine Configuration
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
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

                {/* GPU Acceleration Install */}
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
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-base">MLX (Apple Silicon)</CardTitle>
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
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={fetchMlxInfo} disabled={loadingMlx}>
                  {loadingMlx ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
              <CardDescription>
                In-process inference on Apple Silicon. Models in ~/.lmwebui/models/mlx/.
                {mlxStatus?.models_available ? ` ${mlxStatus.models_available} model(s) available.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMlx ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : mlxStatus?.mlx_installed ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    MLX ready — {mlxStatus.models_available} model(s) available
                  </div>
                  {mlxStatus.models && mlxStatus.models.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {mlxStatus.models.map((m: string) => (
                        <div key={m} className="flex items-center gap-2 py-1">
                          <Cpu className="h-3 w-3 text-purple-500" />
                          {m}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
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
        <ModelDownloadModal
          open={downloadModal !== null}
          onOpenChange={(o) => !o && setDownloadModal(null)}
          modelType={downloadModal || "gguf"}
          onComplete={() => { fetchModels(); fetchRuntimes(); }}
        />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl min-h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        {body}
      </DialogContent>
      <ModelDownloadModal
        open={downloadModal !== null}
        onOpenChange={(o) => !o && setDownloadModal(null)}
        modelType={downloadModal || "gguf"}
        onComplete={() => { fetchModels(); fetchRuntimes(); }}
      />
    </Dialog>
  );
}
