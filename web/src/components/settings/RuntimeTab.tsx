import { useEffect, useState } from "react";
import { authFetch } from "@/utils/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Monitor,
  HardDrive,
  Cpu,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Server
} from "lucide-react";
import { RiImageAiFill } from "react-icons/ri";
import { toast } from "sonner";

interface Runtime {
  type: string;
  name: string;
  installed: boolean;
  status: string;
  version?: string;
  path?: string;
  port?: number;
  detection_method?: string;
  install_hint?: string;
  manual_install?: boolean;
}

interface HardwareInfo {
  backend: string;
  device: string;
  vram_mb: number;
  system_ram_mb: number;
  cpu_cores: number;
  available_backends: string[];
}

interface RuntimeTabProps {
  onOpenRuntimeManager?: () => void;
}

export function RuntimeTab({ onOpenRuntimeManager }: RuntimeTabProps) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modelCounts, setModelCounts] = useState({ text: 0, vision: 0, mlx: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const BASE = import.meta.env.VITE_BACKEND_URL || "";
    setLoading(true);
    setError("");
    try {
      const [runtimeData, hardwareData, localModels, vision, mlx] = await Promise.all([
        authFetch(`${BASE}/api/runtimes`),
        authFetch(`${BASE}/api/hardware`),
        authFetch(`${BASE}/api/models/local`),
        authFetch(`${BASE}/api/runtimes/vision/status`),
        authFetch(`${BASE}/api/runtimes/mlx/status`),
      ]);
      setRuntimes(runtimeData.runtimes || []);
      setHardware(hardwareData);
      setModelCounts({ text: localModels.models?.length || 0, vision: vision.bundles?.length || 0, mlx: mlx.models?.length || 0 });
    } catch (error) {
      console.error("Failed to fetch runtime data:", error);
      setError("Couldn’t refresh runtime status. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchData();
    toast.info("Refreshing runtime status...");
  };

  const getRuntimeIcon = (type: string) => {
    switch (type) {
      case "gguf":
        return <HardDrive className="h-5 w-5 text-gray-500" />;
      case "mlx":
        return <Cpu className="h-5 w-5 text-purple-500" />;
      case "comfyui":
        return <RiImageAiFill className="h-5 w-5 text-pink-500" />;
      default:
        return <Cpu className="h-5 w-5" />;
    }
  };

  const getStatusBadge = (runtime: Runtime) => {
    if (runtime.installed && runtime.status === "running") {
      return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Active</Badge>;
    }
    if (runtime.installed) {
      return <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"><RefreshCw className="h-3 w-3 mr-1" />Installed</Badge>;
    }
    return <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"><XCircle aria-hidden="true" className="h-3 w-3 mr-1" />Not installed</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 p-2">
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/20 dark:text-amber-200"><span>{error}</span><Button size="sm" variant="outline" className="h-7" onClick={fetchData}>Retry</Button></div>}
      {/* Hardware Status */}
      <Card className="bg-gradient-to-r from-neutral-50 to-neutral-100 dark:from-neutral-900 dark:to-neutral-800 border-neutral-200 dark:border-neutral-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            Hardware Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hardware && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{hardware.device || "Unknown Device"}</span>
                <Badge variant="outline" className="capitalize">
                  {hardware.backend.toUpperCase()}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>VRAM: {hardware.vram_mb >= 1000 ? (hardware.vram_mb / 1024).toFixed(1) + " GB" : hardware.vram_mb + " MB"}</div>
                <div>RAM: {hardware.system_ram_mb >= 1000 ? (hardware.system_ram_mb / 1024).toFixed(1) + " GB" : hardware.system_ram_mb + " MB"}</div>
                <div>Cores: {hardware.cpu_cores}</div>
                <div>Backends: {hardware.available_backends.join(", ") || "cpu"}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Runtime List (model availability is shown inline per runtime — no duplicate card) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">Runtime Status</h3>
            <p className="text-xs text-muted-foreground">Live runtime and model status. Open the manager for configuration.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-8 gap-1">
            <RefreshCw aria-hidden="true" className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        <div className="space-y-2">
          {runtimes.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No runtime data available</p>
          ) : runtimes.map((runtime) => (
            <Card key={runtime.type} className="border-neutral-200 dark:border-neutral-800">
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getRuntimeIcon(runtime.type)}
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">{runtime.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {runtime.version && <span>v{runtime.version}</span>}
                        {runtime.port && <span className="ml-2">Port: {runtime.port}</span>}
                        {runtime.path && <span className="ml-2 truncate max-w-[150px]">{runtime.path}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground whitespace-nowrap">
                      {runtime.type === "gguf" && `${modelCounts.text} text · ${modelCounts.vision} vision`}
                      {runtime.type === "mlx" && `${modelCounts.mlx} models`}
                      {runtime.type === "comfyui" && (runtime.installed ? "Managed in Image Gen" : "Connect to check")}
                      {!(["gguf", "mlx", "comfyui"] as string[]).includes(runtime.type) && "See Manager"}
                    </span>
                    {getStatusBadge(runtime)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Open Runtime Manager Button */}
      <div className="pt-2 border-t border-neutral-200 dark:border-neutral-800">
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => onOpenRuntimeManager?.()}
        >
          <Server aria-hidden="true" className="h-4 w-4" />
          Open Runtime Manager
        </Button>
      </div>
    </div>
  );
}
