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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ModelDownloadModal from "@/components/models/ModelDownloadModal";
import {
  HardDrive, Trash2, Cpu, CloudDownload, RefreshCw,
  Loader2, CheckCircle, XCircle, Server, Search, FolderOpen,
  ChevronDown, Image, Copy, ScanLine, ExternalLink, Terminal,
  Cpu as ChipIcon,
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

interface MLXScripts {
  install: string;
  uninstall: string;
  server_start: string;
  server_stop: string;
  server_status: string;
  version: string;
  detect_hardware: string;
  list_models: string;
}

interface MLXStatus {
  runtime: string;
  available: boolean;
  hardware_detected: boolean;
  server_running: boolean;
  endpoint?: string;
  port?: number;
  reason?: string;
}

interface MLXSetupGuide {
  steps: { order: number; action: string; command: string; description: string }[];
  cleanup: { description: string; commands: string[] };
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
}

export default function RuntimeManager({ open, onOpenChange, onModelLoad }: RuntimeManagerProps) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [models, setModels] = useState<GGUFModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [ggufQuery, setGgufQuery] = useState("");
  const [downloadModal, setDownloadModal] = useState<"gguf" | null>(null);
  const [mlxStatus, setMlxStatus] = useState<MLXStatus | null>(null);
  const [mlxScripts, setMlxScripts] = useState<MLXScripts | null>(null);
  const [mlxSetupGuide, setMlxSetupGuide] = useState<MLXSetupGuide | null>(null);
  const [loadingMlx, setLoadingMlx] = useState(false);
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

  useEffect(() => {
    if (open) {
      fetchRuntimes();
      fetchModels();
      fetchMlxInfo();
      fetchGgufConfig();
      scanExternals();
    }
  }, [open]);

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
      const [statusRes, scriptsRes] = await Promise.all([
        authFetch("/api/runtimes/mlx/status"),
        authFetch("/api/runtimes/mlx/scripts"),
      ]);
      setMlxStatus(statusRes);
      setMlxScripts(scriptsRes.scripts);
      setMlxSetupGuide(scriptsRes.setup_guide);
    } catch (error) {
      console.error("Failed to fetch MLX info:", error);
    } finally {
      setLoadingMlx(false);
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
    await Promise.all([fetchRuntimes(), fetchModels(), fetchMlxInfo()]);
    setLoading(false);
    toast.success("Refreshed");
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl min-h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
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

        {/* ---------- GGUF SECTION ---------- */}
        <Card className="border-green-200 dark:border-green-800">
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
                    <span className="text-xs font-mono text-muted-foreground">{ggufConfig.n_ctx}</span>
                  </div>
                  <input
                    type="range"
                    min="1024"
                    max="32768"
                    step="1024"
                    value={ggufConfig.n_ctx}
                    onChange={(e) => setGgufConfig(prev => ({ ...prev, n_ctx: parseInt(e.target.value) }))}
                    className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                    <span>1K</span>
                    <span>32K</span>
                  </div>
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

        {/* ---------- MLX SECTION ---------- */}
        {mlxStatus?.available === false ? (
          /* MLX unsupported on this hardware — hidden */
          null
        ) : (
          <Card className={mlxStatus?.server_running ? "border-green-200 dark:border-green-800" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="h-5 w-5 text-purple-500" />
                  <CardTitle className="text-base">MLX (Apple Silicon)</CardTitle>
                  {mlxStatus?.server_running ? (
                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      <CheckCircle className="h-3 w-3 mr-1" /> Running
                    </Badge>
                  ) : mlxStatus?.hardware_detected ? (
                    <Badge variant="outline" className="border-amber-300 text-amber-600">
                      <ChipIcon className="h-3 w-3 mr-1" /> Not Running
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <XCircle className="h-3 w-3 mr-1" /> Unavailable
                    </Badge>
                  )}
                </div>
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={fetchMlxInfo} disabled={loadingMlx}>
                  {loadingMlx ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                </Button>
              </div>
              <CardDescription>
                {mlxStatus?.hardware_detected
                  ? "Apple Silicon detected — MLX is the recommended runtime for best performance."
                  : "MLX requires Apple Silicon (M-series) hardware."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMlx ? (
                <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : mlxStatus?.server_running ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-green-600">
                    <CheckCircle className="h-4 w-4" />
                    MLX server running at {mlxStatus.endpoint || `host.docker.internal:${mlxStatus.port}`}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 gap-1"
                      onClick={() => copyToClipboard(mlxScripts?.server_stop || "")}>
                      <Terminal className="h-3 w-3" /> Stop Server
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1"
                      onClick={() => copyToClipboard(mlxScripts?.server_status || "")}>
                      <ExternalLink className="h-3 w-3" /> Check Status
                    </Button>
                  </div>
                </div>
              ) : mlxStatus?.hardware_detected ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Install MLX on your macOS host, then start the inference server.
                    lm-webui will auto-detect it.
                  </p>

                  {/* Install Guide */}
                  {mlxSetupGuide && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-accent-foreground transition-colors mb-2">
                        <ChevronDown className="h-4 w-4" />
                        Setup Guide
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="space-y-2">
                          {mlxSetupGuide.steps.map((step) => (
                            <div key={step.order} className="flex items-start gap-3 p-2 rounded-lg bg-neutral-50 dark:bg-neutral-900">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs flex items-center justify-center font-medium">
                                {step.order}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium">{step.description}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  <code className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 px-2 py-1 rounded flex-1 truncate">
                                    {step.command}
                                  </code>
                                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0"
                                    onClick={() => copyToClipboard(step.command)}>
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}

                          {/* Cleanup section */}
                          <Collapsible>
                            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mt-4">
                              <ChevronDown className="h-3 w-3" />
                              Cleanup / Uninstall
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="space-y-1 mt-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                                <p className="text-xs font-medium text-red-600 dark:text-red-400 mb-2">{mlxSetupGuide.cleanup.description}</p>
                                {mlxSetupGuide.cleanup.commands.map((cmd, i) => (
                                  <div key={i} className="flex items-center gap-2">
                                    <code className="text-xs font-mono bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded flex-1">{cmd}</code>
                                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0"
                                      onClick={() => copyToClipboard(cmd)}>
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}

                  {/* Quick commands */}
                  <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <span><span className="text-muted-foreground">$</span> {mlxScripts?.install || "pip install mlx mlx-lm mlx-optiq"}</span>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                        onClick={() => copyToClipboard(mlxScripts?.install || "")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between">
                      <span><span className="text-muted-foreground">$</span> {mlxScripts?.server_start || "mlx_lm.server --port 8090 --model <name>"}</span>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0"
                        onClick={() => copyToClipboard(mlxScripts?.server_start || "")}>
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

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
