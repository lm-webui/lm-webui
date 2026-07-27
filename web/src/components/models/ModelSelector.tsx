import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bot,
  Cpu,
  Wifi,
  WifiOff,
  ChevronDown,
  Search,
  HardDrive,
  Globe,
} from "lucide-react";

interface ModelSelectorProps {
  selectedLLM: string;
  selectedModel: string;
  availableModels: string[];
  onModelChange: (model: string) => void;
  onLLMChange: (llm: string) => void;
  connectionStatus?: "connected" | "disconnected" | "testing";
  providerGroups?: Array<{
    provider: string;
    models: string[];
    modelMapping?: Record<string, string>;
  }>;
}

const providerConfig: Record<
  string,
  { name: string; icon: any; color: string }
> = {
  openai: { name: "OpenAI", icon: Globe, color: "text-green-500" },
  google: { name: "Google Gemini", icon: Globe, color: "text-blue-500" },
  ollama: { name: "Ollama", icon: Cpu, color: "text-cyan-500" },
  gguf: { name: "GGUF", icon: HardDrive, color: "text-gray-500" },
  mlx: { name: "MLX", icon: Cpu, color: "text-purple-500" },
};

const parsePrefixedModel = (
  prefixedModel: string,
): { provider: string; model: string } => {
  const [provider, ...modelParts] = prefixedModel.split(":");
  return {
    provider: provider || "",
    model: modelParts.join(":") || prefixedModel,
  };
};

export function ModelSelector({
  selectedLLM,
  selectedModel,
  availableModels,
  onModelChange,
  onLLMChange,
  connectionStatus = "connected",
  providerGroups = [],
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  // Group models by provider
  const groupedModels = useMemo(() => {
    const groups: Record<string, string[]> = {};
    Object.keys(providerConfig).forEach((p) => (groups[p] = []));
    availableModels.forEach((prefixed) => {
      const { provider, model } = parsePrefixedModel(prefixed);
      const hidden =
        localStorage.getItem(`model-visibility-${provider}:${model}`) ===
        "false";
      if (!hidden && groups[provider]) groups[provider].push(model);
    });
    return groups;
  }, [availableModels]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedModels;
    const q = searchQuery.toLowerCase();
    const out: typeof groupedModels = {};
    Object.entries(groupedModels).forEach(([prov, models]) => {
      const filtered = models.filter(
        (m) =>
          m.toLowerCase().includes(q) ||
          providerConfig[prov]?.name.toLowerCase().includes(q),
      );
      if (filtered.length) out[prov] = filtered;
    });
    return out;
  }, [groupedModels, searchQuery]);

  const handleModelSelect = (provider: string, model: string) => {
    if (provider !== selectedLLM) onLLMChange(provider);
    onModelChange(model);
    setIsOpen(false);
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case "connected":
        return <Wifi className="h-3 w-3 text-green-500" />;
      case "testing":
        return <Wifi className="h-3 w-3 text-yellow-500 animate-pulse" />;
      default:
        return <WifiOff className="h-3 w-3 text-red-500" />;
    }
  };

  const formatModelName = (model: string) => {
    if (!model || model === "Select Model") return "Select Model";
    return model.length > 20 ? model.substring(0, 20) + "..." : model;
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="gap-1 md:gap-2 min-w-[70px] md:min-w-[140px] justify-between rounded-3xl
          bg-neutral-100/90 dark:bg-black/5 border-slate-500/10 hover:bg-neutral-800/50 shadow-inner"
          size="sm"
        >
          <div className="flex items-center gap-1 md:gap-2">
            {(() => {
              const Icon = providerConfig[selectedLLM]?.icon || Bot;
              return <Icon className="h-4 w-4" />;
            })()}
            <span className="text-[0.7rem] md:text-sm font-medium whitespace-nowrap overflow-hidden">
              {formatModelName(selectedModel)}
            </span>
          </div>
          <div className="flex items-center gap-0.5 md:gap-1">
            {getConnectionIcon()}
            <ChevronDown className="h-1 w-1 md:h-3 md:w-3" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="bg-neutral-300/70 dark:bg-neutral-900/90 backdrop-blur-md w-80 md:w-96 p-0 mt-4 mr-[1rem] rounded-3xl border border-white/10"
        align="start"
      >
        <div className="p-4 space-y-4">
          {/* Search — no outline, minimal */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3 py-2 text-sm bg-transparent border-b border-zinc-300 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-colors"
            />
          </div>

          {/* Models grouped by provider */}
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {Object.entries(filteredGroups).map(([provider, models]) => {
              if (!models.length) return null;
              const config = providerConfig[provider];
              const Icon = config?.icon || Bot;

              return (
                <div key={provider} className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/50 px-1">
                    <Icon className={`h-3 w-3 ${config?.color || ""}`} />
                    <span>{config?.name || provider}</span>
                  </div>
                  {models.map((model) => (
                    <div
                      key={model}
                      className={`flex items-center justify-between py-1.5 px-2 cursor-pointer transition-colors ml-5 ${
                        selectedModel === model
                          ? "text-zinc-900 dark:text-white font-medium"
                          : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200"
                      }`}
                      onClick={() => handleModelSelect(provider, model)}
                    >
                      <span className="text-sm truncate">{model}</span>
                      {selectedModel === model && (
                        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-2">
                          Active
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}

            {Object.values(filteredGroups).every((m) => !m.length) && (
              <div className="text-center py-4 text-white/50">
                <div className="text-sm">No models found</div>
                {searchQuery && (
                  <div className="text-xs mt-1">
                    Try a different search term
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
