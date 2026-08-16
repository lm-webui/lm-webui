import { useState, useEffect } from "react";
import { fetchModels, listApiKeys } from "@/utils/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wifi, Eye, EyeOff, Boxes } from "lucide-react";
import { PROVIDERS } from "@/utils/modelProviders";

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context_window?: number;
  supports_vision?: boolean;
  type?: string;
}

// Local runtimes managed by the Runtime Manager — never stored as API keys,
// so they're always considered connected regardless of the api_keys table.
const KEYLESS_RUNTIMES = ["gguf", "mlx"];

export function ModelsTab() {
  const [selectedProvider, setSelectedProvider] = useState("");
  const [providers, setProviders] = useState<Record<string, { models: ModelInfo[] }>>({});
  const [connectedProviders, setConnectedProviders] = useState<Set<string>>(new Set());
  const [modelVisibility, setModelVisibility] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Derive all providers from the centralized PROVIDERS config (not a hardcoded list)
  const providerConfig: Record<string, { name: string; icon: any }> = Object.fromEntries(
    Object.entries(PROVIDERS).map(([id, p]) => [id, { name: p.name, icon: p.icon }]),
  );

  // Single source of truth for "connected": a provider is connected if it has a
  // stored API key/endpoint, OR it's a keyless local runtime (gguf, mlx).
  const isProviderConnected = (id: string): boolean =>
    KEYLESS_RUNTIMES.includes(id) || connectedProviders.has(id);

  // Only providers that are connected appear in the dropdown.
  const visibleProviderIds = Object.keys(providerConfig).filter(isProviderConnected);

  // Load model visibility preferences from localStorage
  useEffect(() => {
    const loadVisibilityPrefs = () => {
      const prefs: Record<string, boolean> = {};
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('model-visibility-')) {
          const modelId = key.replace('model-visibility-', '');
          prefs[modelId] = localStorage.getItem(key) === 'true';
        }
      });
      setModelVisibility(prefs);
    };

    loadVisibilityPrefs();
  }, []);

  // Load models and connection status
  useEffect(() => {
    const loadModelsAndConnections = async () => {
      setIsLoading(true);
      try {
        // Get stored API keys to determine connected providers (backend provider names)
        const storedKeys = await listApiKeys();
        const connected = new Set(storedKeys.map((key: any) => key.provider));
        setConnectedProviders(connected);

        const backendToFrontendMapping: Record<string, string> = {
          'openai': 'openai',
          'google': 'google',
          'anthropic': 'anthropic',
          'xai': 'xai',
          'deepseek': 'deepseek',
          'vllm': 'vllm',
          'ollama': 'ollama',
          'gguf': 'gguf',
          'mlx': 'mlx',
        };

        // Fetch all models from backend
        const allModelsResponse = await fetchModels(undefined, { allProviders: true });
        const modelsByProvider = allModelsResponse as Record<string, string[]>;

        // Convert to our format
        const providerData: Record<string, { models: ModelInfo[] }> = {};

        Object.entries(modelsByProvider).forEach(([backendProvider, modelNames]) => {
          // Map backend provider name to frontend provider name
          const frontendProvider = backendToFrontendMapping[backendProvider] || backendProvider;

          // Convert model names to ModelInfo objects
          const models: ModelInfo[] = modelNames.map(name => ({
            id: name,
            name: name,
            provider: frontendProvider,
          }));

          providerData[frontendProvider] = { models };
        });

        setProviders(providerData);
      } catch (error: any) {
        console.error("Failed to load models:", error);
        toast.error("Failed to load models from providers");
      } finally {
        setIsLoading(false);
      }
    };

    loadModelsAndConnections();
  }, []);

  // Keep the selected provider on a connected one once the key list is known.
  useEffect(() => {
    if (!visibleProviderIds.includes(selectedProvider)) {
      setSelectedProvider(visibleProviderIds[0] ?? "");
    }
  }, [connectedProviders]);

  // Toggle individual model visibility
  const toggleModelVisibility = (modelId: string) => {
    setModelVisibility(prev => {
      const currentVisibility = prev[modelId];
      const newVisibility = currentVisibility === false ? true : false; // Explicitly handle the toggle

      // Save to localStorage
      localStorage.setItem(`model-visibility-${modelId}`, newVisibility.toString());

      toast.success(newVisibility ? "Model shown in selector" : "Model hidden from selector");

      return { ...prev, [modelId]: newVisibility };
    });
  };

  // Get visibility status for a model
  const isModelVisible = (modelId: string): boolean => {
    // Default to visible if not set
    return modelVisibility[modelId] !== false;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-8">
            <div className="text-center text-zinc-500 dark:text-zinc-400">
              <div className="text-sm">Loading models...</div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No connected providers to manage — prompt the user to add an API key first.
  if (!visibleProviderIds.length) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="py-8 text-center">
            <div className="text-sm text-zinc-500 dark:text-zinc-400">No connected providers yet.</div>
            <div className="text-xs mt-1 text-zinc-400">
              Add an API key in the API Keys tab to manage its models here.
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentProviderData = providers[selectedProvider];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Boxes className="h-4 w-4" /> Model Management</CardTitle>
          <CardDescription>
            Control which models appear in the model selector. Toggle visibility for each model.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">AI Provider</label>
              <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {visibleProviderIds.map((providerId) => {
                    const config = providerConfig[providerId]!;
                    return (
                      <SelectItem key={providerId} value={providerId}>
                        <div className="flex items-center gap-2 w-full">
                          <config.icon className="h-4 w-4" />
                          <span className="flex-1">{config.name}</span>
                          <Wifi className="h-3 w-3 text-green-500" />
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Model Visibility Toggles */}
            <div className="space-y-3 p-4 border border-zinc-200 dark:border-zinc-700 rounded-3xl">
              <div className="space-y-2">
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {currentProviderData && currentProviderData.models.length > 0 ? (
                    currentProviderData.models.map((model: ModelInfo) => {
                      const modelId = `${selectedProvider}:${model.id}`;
                      const isVisible = isModelVisible(modelId);

                      return (
                        <div
                          key={modelId}
                          className="flex items-center justify-between p-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate ml-2">
                              {model.name || model.id}
                            </div>
                            <div className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                              {model.context_window && `Context: ${model.context_window.toLocaleString()}`}
                              {model.supports_vision && " • Vision"}
                              {model.type && ` • ${model.type}`}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 ml-4">
                            <div className="flex items-center gap-2">
                              {isVisible ? (
                                <Eye className="h-4 w-4 text-zinc-400" />
                              ) : (
                                <EyeOff className="h-4 w-4 text-zinc-400" />
                              )}
                              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                                {isVisible ? "Visible" : "Hidden"}
                              </span>
                            </div>

                            <button
                              onClick={() => {
                                console.log(`Toggling ${modelId} from ${isVisible}`);
                                toggleModelVisibility(modelId);
                              }}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                                isVisible ? 'bg-blue-500' : 'bg-zinc-300 dark:bg-zinc-600'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  isVisible ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-4 text-zinc-500 dark:text-zinc-400">
                      <div className="text-sm">No models available</div>
                    </div>
                  )}
                </div>

                {currentProviderData && currentProviderData.models.length > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-200 dark:border-zinc-700">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {currentProviderData.models.filter((model: ModelInfo) =>
                        isModelVisible(`${selectedProvider}:${model.id}`)
                      ).length} of {currentProviderData.models.length} models visible
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Show all models
                          currentProviderData.models.forEach((model: ModelInfo) => {
                            const modelId = `${selectedProvider}:${model.id}`;
                            setModelVisibility(prev => ({ ...prev, [modelId]: true }));
                            localStorage.setItem(`model-visibility-${modelId}`, "true");
                          });
                          toast.success("All models shown");
                        }}
                        className="text-xs h-7"
                      >
                        Show All
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // Hide all models
                          currentProviderData.models.forEach((model: ModelInfo) => {
                            const modelId = `${selectedProvider}:${model.id}`;
                            setModelVisibility(prev => ({ ...prev, [modelId]: false }));
                            localStorage.setItem(`model-visibility-${modelId}`, "false");
                          });
                          toast.success("All models hidden");
                        }}
                        className="text-xs h-7"
                      >
                        Hide All
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
