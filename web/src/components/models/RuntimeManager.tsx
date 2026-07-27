import React, { useEffect, useState } from "react";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ModelDownloadModal from "@/components/models/ModelDownloadModal";
import {
  HardDrive, Download, Trash2, Cpu, CloudDownload, RefreshCw,
  Loader2, CheckCircle, XCircle, Server, Database, Monitor,
  Search, FolderOpen, ChevronDown, Image,
} from "lucide-react";
import { toast } from "sonner";
import { authFetch } from "@/utils/api";

interface Runtime {
  type: string;
  name: string;
  installed: boolean;
  status: string;
  version?: string;
  path?: string;
  port?: number;
  install_hint?: string;
  manual_install?: boolean;
  endpoint?: string;
  source?: string;
}

interface GGUFModel {
  name: string;
  path: string;
  size: number;
  quantization?: string;
}

interface MLXModel {
  name: string;
  path: string;
  model_type?: string;
  arch?: string;
}

interface RuntimeManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onModelLoad?: (modelName: string) => void;
  initialTab?: string;
}

export default function RuntimeManager({ open, onOpenChange, onModelLoad, initialTab }: RuntimeManagerProps) {
  const [activeTab, setActiveTab] = useState(initialTab || "ollama");
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [models, setModels] = useState<GGUFModel[]>([]);
  const [mlxModels, setMlxModels] = useState<MLXModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [loadingMlx, setLoadingMlx] = useState(false);
  const [ggufQuery, setGgufQuery] = useState("");
  const [mlxQuery, setMlxQuery] = useState("");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [loadingOllamaModels, setLoadingOllamaModels] = useState(false);
  const [downloadModal, setDownloadModal] = useState<"gguf" | "mlx" | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [externalType, setExternalType] = useState("ollama");
  const [externalEndpoint, setExternalEndpoint] = useState("http://host.docker.internal:11434");
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    if (open) {
      fetchRuntimes();
      fetchModels();
      fetchMlxModels();
      fetchOllamaModels();
    }
  }, [open]);

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

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

  const fetchMlxModels = async () => {
    setLoadingMlx(true);
    try {
      const data = await authFetch("/api/mlx/models");
      setMlxModels(data.models || []);
    } catch (error) {
      console.error("Failed to fetch MLX models:", error);
    } finally {
      setLoadingMlx(false);
    }
  };

  const fetchOllamaModels = async () => {
    setLoadingOllamaModels(true);
    try {
      const data = await authFetch("/api/models/api/dynamic?provider=ollama");
      setOllamaModels((data.models || []).map((m: any) => m.name || m.id));
    } catch (error) {
      console.error("Failed to fetch Ollama models:", error);
    } finally {
      setLoadingOllamaModels(false);
    }
  };

  const handleInstall = async (runtimeType: string) => {
    setInstalling(runtimeType);
    try {
      const data = await authFetch("/api/runtimes/install", {
        method: "POST",
        body: JSON.stringify({ runtime_type: runtimeType, options: {} })
      });
      if (data.success) {
        toast.success(`${runtimeType} installed successfully`);
        await fetchRuntimes();
      } else {
        toast.info(data.message || `Run ${data.command || `lm-webui-host runtime install ${runtimeType}`} on the host`);
      }
    } catch (error) {
      toast.error(`Failed to install ${runtimeType}`);
    } finally {
      setInstalling(null);
    }
  };

  const registerExternalRuntime = async () => {
    if (!externalEndpoint.trim()) return;
    setRegistering(true);
    try {
      await authFetch("/api/runtimes/external", {
        method: "POST",
        body: JSON.stringify({ runtime_type: externalType, endpoint: externalEndpoint.trim() }),
      });
      toast.success("External runtime registered");
      await fetchRuntimes();
    } catch (error: any) {
      toast.error(error.message || "Unable to register runtime");
    } finally {
      setRegistering(false);
    }
  };

  const testExternalRuntime = async (runtime: Runtime) => {
    try {
      const result = await authFetch(`/api/runtimes/${runtime.type}/test`, { method: "POST" });
      toast.success(`${runtime.name} is ${result.status}`);
      await fetchRuntimes();
    } catch (error: any) {
      toast.error(error.message || "Runtime test failed");
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    await Promise.all([fetchRuntimes(), fetchModels()]);
    setLoading(false);
    toast.success("Refreshed");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  };

  const getRuntimeIcon = (type: string) => {
    switch (type) {
      case "ollama": return <Database className="h-4 w-4 text-cyan-500" />;
      case "vllm": return <Monitor className="h-4 w-4 text-emerald-500" />;
      case "gguf": return <HardDrive className="h-4 w-4 text-gray-500" />;
      case "mlx": return <Cpu className="h-4 w-4 text-purple-500" />;
      case "comfyui": return <Image className="h-4 w-4 text-pink-500" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const filteredModels = models.filter(m =>
    m.name.toLowerCase().includes(ggufQuery.toLowerCase())
  );
  const filteredMlx = mlxModels.filter(m =>
    m.name.toLowerCase().includes(mlxQuery.toLowerCase())
  );

  const renderRuntimeCard = (runtime: Runtime) => (
    <div 
      key={runtime.type}
      className={`p-4 rounded-lg border ${
        runtime.installed 
          ? "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20" 
          : "border-neutral-200 dark:border-neutral-800"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {getRuntimeIcon(runtime.type)}
          <div>
            <div className="font-medium">{runtime.name}</div>
            <div className="text-xs text-muted-foreground">
              {runtime.version && <span>v{runtime.version}</span>}
              {runtime.port && <span className="ml-2">Port: {runtime.port}</span>}
              {runtime.endpoint && <span className="ml-2 truncate">{runtime.endpoint}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {runtime.endpoint && <Button size="sm" variant="outline" onClick={() => testExternalRuntime(runtime)}>Test</Button>}
          {runtime.installed ? (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="secondary">
              <XCircle className="h-3 w-3 mr-1" />
              Not Installed
            </Badge>
          )}
          {!runtime.installed && !runtime.manual_install && (
            <Button
              size="sm"
              onClick={() => handleInstall(runtime.type)}
              disabled={installing === runtime.type}
            >
              {installing === runtime.type ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
      {runtime.install_hint && !runtime.installed && (
        <p className="text-xs text-muted-foreground mt-2">{runtime.install_hint}</p>
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl min-h-[85vh] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Runtime Manager
          </DialogTitle>
          <DialogDescription>Manage approved external runtimes. Install host runtimes with the LM-WebUI host CLI.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-4">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-sm">Register external runtime</CardTitle><CardDescription>Configure a host or separate-service endpoint reachable by this app container.</CardDescription></CardHeader>
          <CardContent className="flex flex-col sm:flex-row gap-2">
            <select className="h-9 rounded-md border bg-background px-3 text-sm" value={externalType} onChange={(e) => setExternalType(e.target.value)}>
              <option value="ollama">Ollama</option><option value="openai_compatible">OpenAI-compatible</option><option value="vllm">vLLM</option><option value="llamacpp">llama.cpp</option>
            </select>
            <Input value={externalEndpoint} onChange={(e) => setExternalEndpoint(e.target.value)} placeholder="http://host.docker.internal:11434" aria-label="Runtime endpoint" />
            <Button onClick={registerExternalRuntime} disabled={registering || !externalEndpoint.trim()}>{registering ? <Loader2 className="h-4 w-4 animate-spin" /> : "Register"}</Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="ollama" className="gap-2"><Database className="h-4 w-4" /> Ollama</TabsTrigger>
            <TabsTrigger value="vllm" className="gap-2"><Monitor className="h-4 w-4" /> vLLM</TabsTrigger>
            <TabsTrigger value="mlx" className="gap-2"><Cpu className="h-4 w-4" /> MLX</TabsTrigger>
            <TabsTrigger value="gguf" className="gap-2"><HardDrive className="h-4 w-4" /> GGUF</TabsTrigger>
            <TabsTrigger value="comfyui" className="gap-2"><Image className="h-4 w-4" /> ComfyUI</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto scrollbar-hide mt-4 space-y-4">
            {[
              { value: "ollama", icon: Database, name: "Ollama", desc: "Run open-source models locally with a simple API.", runtime: "ollama", commands: ["ollama pull llama3.2", "ollama list", "ollama run llama3.2"] },
              { value: "vllm", icon: Monitor, name: "vLLM", desc: "High-performance inference with PagedAttention.", runtime: "vllm", commands: ["pip install vllm"] },
              { value: "mlx", icon: Cpu, name: "MLX (Apple Silicon)", desc: "MLX models run natively on Apple Silicon.", runtime: "mlx", commands: ["pip install mlx mlx-lm"] },
              { value: "gguf", icon: HardDrive, name: "GGUF / llama.cpp", desc: "Run GGUF quantized models locally.", runtime: "gguf", commands: ["pip install llama-cpp-python"] },
              { value: "comfyui", icon: Image, name: "ComfyUI", desc: "AI image generation with ComfyUI workflows.", runtime: "comfyui", commands: ["git clone https://github.com/comfyanonymous/ComfyUI", "cd ComfyUI && pip install -r requirements.txt", "python main.py --listen 0.0.0.0 --port 8288 --disable-auto-launch"] },
            ].map((tab) => (
              <TabsContent key={tab.value} value={tab.value} className="m-0 space-y-4">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <tab.icon className="h-5 w-5 text-muted-foreground" />
                        <CardTitle className="text-base">{tab.name}</CardTitle>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={handleRefresh} disabled={loading}>
                          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                          Refresh
                        </Button>
                        {(tab.value === "gguf" || tab.value === "mlx") && (
                          <Button size="sm" variant="outline" className="h-7 gap-1 rounded-xl"
                            onClick={() => setDownloadModal(tab.value)}>
                            <CloudDownload className="h-3 w-3" /> Download
                          </Button>
                        )}
                      </div>
                    </div>
                    <CardDescription>{tab.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {runtimes.filter(r => r.type === tab.runtime).map(renderRuntimeCard)}
                    {runtimes.filter(r => r.type === tab.runtime).length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">Not detected</p>
                    )}
                  </CardContent>
                </Card>

                {tab.commands.length > 0 && (
                  <Card>
                    <CardContent className="p-0">
                      <Collapsible className="w-full">
                        <CollapsibleTrigger className="flex items-center gap-2 w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors rounded-lg">
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          Quick Commands
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-4 pb-4">
                            <div className="text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg space-y-1">
                              {tab.commands.map((cmd, i) => <div key={i}><span className="text-muted-foreground">$</span> {cmd}</div>)}
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                )}

                                {tab.value === "ollama" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Pulled Models</CardTitle>
                      <CardDescription>Models available in your local Ollama instance</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {loadingOllamaModels ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : ollamaModels.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No Ollama models found</p>
                          <p className="text-xs mt-1">Pull a model with: ollama pull &lt;name&gt;</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                          {ollamaModels.map((model, i) => (
                            <div key={i} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <Database className="h-4 w-4 text-cyan-500 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{model}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

{tab.value === "mlx" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Installed Packages</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2 text-xs mb-4">
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" /> MLX
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                          <CheckCircle className="h-3 w-3" /> mlx-lm
                        </span>
                        <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
                          <Download className="h-3 w-3" /> optiq
                        </span>
                      </div>
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search MLX models..." value={mlxQuery}
                          onChange={(e) => setMlxQuery(e.target.value)} className="pl-9" />
                      </div>
                      {loadingMlx ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : filteredMlx.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <Cpu className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">No MLX models found</p>
                          <p className="text-xs mt-1">Download a model from HuggingFace to get started</p>
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-60 overflow-y-auto scrollbar-hide">
                          {filteredMlx.map((model) => (
                            <div key={model.path} className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                              <div className="flex items-center gap-3 min-w-0">
                                <Cpu className="h-4 w-4 text-purple-500 flex-shrink-0" />
                                <div className="min-w-0">
                                  <div className="font-medium text-sm truncate">{model.name}</div>
                                  <div className="text-xs text-muted-foreground">{model.model_type || model.arch || "unknown"}</div>
                                </div>
                              </div>
                              <Button size="sm" onClick={() => { onModelLoad?.(model.name); onOpenChange(false); toast.success("Switched to " + model.name); }}>Load</Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {tab.value === "gguf" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Local GGUF Models</CardTitle>
                      <CardDescription>Place .gguf files in backend/models/</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="relative mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search models..." value={ggufQuery}
                          onChange={(e) => setGgufQuery(e.target.value)} className="pl-9" />
                      </div>
                      {loadingModels ? (
                        <div className="flex items-center justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                      ) : filteredModels.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                          <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-xs mt-1">Place .gguf files in backend/models/</p>
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
                              <Button size="sm" onClick={() => { onModelLoad?.(model.name); onOpenChange(false); toast.success("Switched to " + model.name); }}>Load</Button>
                            </div>
                          ))}

                {tab.value === "vllm" && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">Serving Status</CardTitle>
                      <CardDescription>vLLM serves one model at a time, configured at startup</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {runtimes.filter(r => r.type === "vllm").length > 0 ? (
                        <div className="text-sm space-y-2">
                          <p>vLLM is configured on this system.</p>
                          <p className="text-xs text-muted-foreground">To change the serving model, restart vLLM with a different configuration.</p>
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                          <p className="text-sm">vLLM not detected</p>
                          <p className="text-xs mt-1">Install vLLM and start it with your desired model</p>
                        </div>
                      )}
                      <div className="mt-4 text-xs font-mono bg-neutral-100 dark:bg-neutral-800 p-3 rounded-lg">
                        vllm serve &lt;model_name&gt; --port 8000
                      </div>
                    </CardContent>
                  </Card>
                )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      </DialogContent>

      <ModelDownloadModal
        open={downloadModal !== null}
        onOpenChange={(o) => !o && setDownloadModal(null)}
        modelType={downloadModal || "gguf"}
        onComplete={() => { fetchModels(); fetchMlxModels(); fetchRuntimes(); }}
      />
    </Dialog>
  );
}
