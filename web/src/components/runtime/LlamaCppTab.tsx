/**
 * LlamaCppTab — local llama.cpp / GGUF engine (chat + vision) management.
 * Controlled component: state + handlers live in RuntimeManager and are passed in.
 */
import { ComponentType } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  HardDrive, Trash2, Cpu, CloudDownload, Loader2, CheckCircle, Search, FolderOpen,
  ChevronDown, Eye, Zap, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

interface GGUFModel {
  name: string;
  path: string;
  size: number | string;
  size_bytes?: number;
  quantization?: string;
}

interface StatusIconProps { ready: boolean; tip: string; }

interface LlamaCppTabProps {
  loadingModels: boolean;
  ggufQuery: string;
  setGgufQuery: (v: string) => void;
  ggufRows: GGUFModel[];
  visionRows: any[];
  ggufHealth: any;
  ggufConfig: { n_ctx: number; n_gpu_layers: number; cache_type_k: string; cache_type_v: string };
  setGgufConfig: (fn: (p: any) => any) => void;
  applyingConfig: boolean;
  applyGgufConfig: () => void;
  gpuInfo: any;
  installingGpu: boolean;
  installGpuAcceleration: () => void;
  ggufRuntime?: any;
  ggufReady: boolean;
  ggufBackend: string;
  llamaServerPresent: boolean;
  chatHasModel: boolean;
  visionHasModel: boolean;
  setDownloadModal: (v: "gguf" | "vision" | "mlx" | null) => void;
  deleteModel: (name: string) => void;
  deleteVisionModel: (name: string) => void;
  setDefaultVision: (name: string) => void;
  estimateMaxModel: (qBits: number) => number;
  formatFileSize: (bytes: number | string) => string;
  StatusIcon: ComponentType<StatusIconProps>;
  onModelLoad?: ((model: string, provider?: string) => void) | undefined;
  onOpenChange: (open: boolean) => void;
}

export function LlamaCppTab({
  loadingModels, ggufQuery, setGgufQuery, ggufRows, visionRows,
  ggufHealth, ggufConfig, setGgufConfig, applyingConfig, applyGgufConfig,
  gpuInfo, installingGpu, installGpuAcceleration, ggufRuntime, ggufReady,
  ggufBackend, llamaServerPresent, chatHasModel, visionHasModel,
  setDownloadModal, deleteModel, deleteVisionModel,
  setDefaultVision, estimateMaxModel, formatFileSize, StatusIcon,
  onModelLoad, onOpenChange,
}: LlamaCppTabProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            llama.cpp
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
        {/* Capabilities */}
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

        {/* Engine Configuration */}
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

        {/* Runtime Details */}
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

        {/* Models */}
        <div className="relative mt-4 mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input aria-label="Search llama.cpp models" placeholder="Search llama.cpp models…" value={ggufQuery}
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
  );
}
