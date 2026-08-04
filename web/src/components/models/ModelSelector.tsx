import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Bot,
  Wifi,
  WifiOff,
  ChevronDown,
  Search,
  RefreshCw,
} from "lucide-react";
import { notifyModelsChanged } from "@/features/models/modelEvents";
import { PROVIDERS } from "@/utils/modelProviders";

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
  // External mode: an ancestor owns the <Popover> root (e.g. anchored to the composer).
  // Render only trigger + content; the root controls open state and position.
  external?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: "top" | "bottom";
}

const providerConfig: Record<
  string,
  { name: string; icon: any; color?: string }
> = {
  openai: { ...PROVIDERS.openai! },
  google: { ...PROVIDERS.google! },
  ollama: { ...PROVIDERS.ollama! },
  gguf: { ...PROVIDERS.gguf! },
  mlx: { ...PROVIDERS.mlx! },
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
  external = false,
  open,
  onOpenChange,
  side = "top",
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
    if (external) onOpenChange?.(false);
    else setIsOpen(false);
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

  const trigger = (
    <Button
      variant="outline"
      className="gap-1 md:gap-2 min-w-[70px] md:min-w-[140px] justify-between rounded-3xl
     bg-neutral-100/90 dark:bg-neutral-900/10 border-neutral-300/50 dark:border-neutral-600/50 hover:bg-neutral-800/50 shadow-inner"
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
  );

  const panel = (
    <div className="py-4 px-6 space-y-4 bg-neutral-300 dark:bg-neutral-900">
      {/* Search + refresh — no outline, minimal */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-3 py-2 text-sm bg-transparent border-b border-zinc-300/50 dark:border-zinc-800/50 text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:border-zinc-500 dark:focus:border-zinc-400 transition-colors"
          />
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-full text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
          onClick={notifyModelsChanged}
          title="Refresh models"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Models grouped by provider */}
      <div className="space-y-3 max-h-60 md:max-h-80 overflow-y-auto">
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
  );

  // External mode: an ancestor owns the <Popover> root, so render only trigger + content.
  // Content spans the composer width (max-w-3xl = 48rem) and is a bottom sheet on mobile.
  if (external) {
    return (
      <>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          side={side}
          align="center"
          sideOffset={8}
          className="z-50 w-[min(48rem,calc(100vw-1rem))] max-h-[70vh] overflow-hidden rounded-2xl border bg-popover p-0 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
        >
          {panel}
        </PopoverContent>
      </>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        className="bg-neutral-300/70 dark:bg-neutral-900/90 backdrop-blur-md w-80 md:w-96 p-0 mt-4 mr-[1rem] rounded-3xl border border-white/10"
        align="start"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
