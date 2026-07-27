import { useEffect, useState } from "react";
import { authFetch } from "@/utils/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Monitor, 
  Database, 
  HardDrive, 
  Cpu, 
  Download, 
  Trash2, 
  RefreshCw, 
  CheckCircle, 
  XCircle, 
  Loader2,
  ChevronRight,
  Server
} from "lucide-react";
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
  onOpenRuntimeManager?: (tab?: string) => void;
}

export function RuntimeTab({ onOpenRuntimeManager }: RuntimeTabProps) {
  const [runtimes, setRuntimes] = useState<Runtime[]>([]);
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const BASE = import.meta.env.VITE_BACKEND_URL || "";
    setLoading(true);
    try {
      const [runtimeData, hardwareData] = await Promise.all([
        authFetch(`${BASE}/api/runtimes`),
        authFetch(`${BASE}/api/hardware`),
      ]);
      setRuntimes(runtimeData.runtimes || []);
      setHardware(hardwareData);
    } catch (error) {
      console.error("Failed to fetch runtime data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (runtimeType: string) => {
    const BASE = import.meta.env.VITE_BACKEND_URL || "";
    setInstalling(runtimeType);
    try {
      const data = await authFetch(`${BASE}/api/runtimes/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runtime_type: runtimeType, options: {} })
      });
      if (data.requires_host_cli) {
        toast.info(`${data.message} Command: ${data.command}`);
      } else {
        toast.success(`${runtimeType} installed successfully`);
      }
      await fetchData();
    } catch (error) {
      toast.error(`Failed to install ${runtimeType}`);
    } finally {
      setInstalling(null);
    }
  };

  const handleRefresh = () => {
    fetchData();
    toast.info("Refreshing runtime status...");
  };

  const getRuntimeIcon = (type: string) => {
    switch (type) {
      case "ollama":
        return <Database className="h-5 w-5 text-cyan-500" />;
      case "vllm":
        return <Monitor className="h-5 w-5 text-emerald-500" />;
      case "gguf":
        return <HardDrive className="h-5 w-5 text-gray-500" />;
      case "mlx":
        return <Cpu className="h-5 w-5 text-purple-500" />;
      case "qdrant":
        return <Server className="h-5 w-5 text-blue-500" />;
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
    if (runtime.manual_install) {
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Manual</Badge>;
    }
    return <Badge className="bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"><XCircle className="h-3 w-3 mr-1" />Not Installed</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2">
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

      {/* Runtime List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Installed Runtimes</h3>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-8 gap-1">
            <RefreshCw className="h-3 w-3" />
            Refresh
          </Button>
        </div>

        <div className="space-y-2">
          {runtimes.filter(r => r.installed).length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">No runtimes installed</p>
          ) : runtimes.filter(r => r.installed).map((runtime) => (
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
                    {getStatusBadge(runtime)}
                    {!runtime.installed && !runtime.manual_install && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleInstall(runtime.type)}
                        disabled={installing === runtime.type}
                        className="h-7 gap-1"
                      >
                        {installing === runtime.type ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        Install
                      </Button>
                    )}
                    {runtime.installed && (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => onOpenRuntimeManager?.(runtime.type)}>
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
                {runtime.install_hint && !runtime.installed && (
                  <p className="text-xs text-muted-foreground mt-2">{runtime.install_hint}</p>
                )}
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
          <Server className="h-4 w-4" />
          Manage Runtimes
        </Button>
      </div>
    </div>
  );
}
