import { useEffect, useState } from "react";
import { Cpu, AlertCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HardwareInfo {
  backend: string;
  device: string;
  vram_mb: number;
  system_ram_mb: number;
  cpu_cores: number;
  available_backends: string[];
  cuda_version?: string;
  rocm_version?: string;
  metal_support?: boolean;
}

export function HardwareStatus() {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const BASE = import.meta.env.VITE_BACKEND_URL || "";
    const fetchHardware = async () => {
      try {
        const res = await fetch(`${BASE}/api/hardware`);
        if (!res.ok) return;
        const text = await res.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          return;
        }
        if (data?.backend) setHardware(data);
      } catch {
        // transient
      } finally {
        setLoading(false);
      }
    };

    fetchHardware();
    const id = setInterval(fetchHardware, 30000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-neutral-200 dark:bg-neutral-800">
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hardware) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 px-2 py-2 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-500">
              <AlertCircle className="h-3 w-3" />
              <span className="text-xs">Unknown</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Unable to detect hardware</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  const getIcon = () => {
    switch (hardware.backend) {
      case "cuda":
        return <Cpu className="h-3 w-3" />;
      case "rocm":
        return <Cpu className="h-3 w-3" />;
      case "metal":
        return <Cpu className="h-3 w-3" />;
      default:
        return <Cpu className="h-3 w-3" />;
    }
  };

  const getColor = () => {
    switch (hardware.backend) {
      case "cuda":
      case "rocm":
      case "metal":
      case "sycl":
      default:
        return "bg-neutral-300 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400";
    }
  };

  const getLabel = () => {
    if (hardware.backend === "cuda") {
      return `${hardware.backend.toUpperCase()} ${hardware.vram_mb >= 1000 ? (hardware.vram_mb / 1024).toFixed(1) + "GB" : hardware.vram_mb + "MB"}`;
    }
    if (hardware.backend === "rocm") {
      return `ROCm ${hardware.vram_mb >= 1000 ? (hardware.vram_mb / 1024).toFixed(1) + "GB" : hardware.vram_mb + "MB"}`;
    }
    if (hardware.backend === "metal") {
      return `Metal ${(hardware.vram_mb / 1024).toFixed(1)}GB`;
    }
    return `CPU ${hardware.cpu_cores}C`;
  };

  const tooltipContent = (
    <div className="space-y-1 text-xs">
      <div className="font-semibold">{hardware.device || "Unknown Device"}</div>
      <div className="text-muted-foreground">
        Backend: {hardware.backend.toUpperCase()}
      </div>
      {hardware.vram_mb > 0 && (
        <div className="text-muted-foreground">
          VRAM:{" "}
          {hardware.vram_mb >= 1000
            ? (hardware.vram_mb / 1024).toFixed(1) + " GB"
            : hardware.vram_mb + " MB"}
        </div>
      )}
      <div className="text-muted-foreground">
        System RAM:{" "}
        {hardware.system_ram_mb >= 1000
          ? (hardware.system_ram_mb / 1024).toFixed(1) + " GB"
          : hardware.system_ram_mb + " MB"}
      </div>
      <div className="text-muted-foreground">
        CPU Cores: {hardware.cpu_cores}
      </div>
      {hardware.cuda_version && (
        <div className="text-muted-foreground">
          CUDA: {hardware.cuda_version}
        </div>
      )}
      {hardware.rocm_version && (
        <div className="text-muted-foreground">
          ROCm: {hardware.rocm_version}
        </div>
      )}
      <div className="pt-1 border-t border-border">
        <div className="text-muted-foreground">
          Available: {hardware.available_backends.join(", ") || "cpu"}
        </div>
      </div>
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-full cursor-help ${getColor()}`}
          >
            {getIcon()}
            <span className="text-xs font-medium">{getLabel()}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="bg-neutral-100 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700"
        >
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
