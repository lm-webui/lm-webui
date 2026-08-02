import { useState, useEffect, useCallback } from "react";
import { ModelService } from "./modelService";
import { MODELS_CHANGED_EVENT } from "./modelEvents";

interface UseAllModelsOptions {
  isAuthenticated: boolean;
  storedApiKeys: Record<string, boolean>;
  providers?: string[];
}

export interface ProviderModelGroup {
  provider: string;
  models: string[];
  modelMapping: Record<string, string>;
}

interface AllModelsState {
  allModels: string[];
  allModelMapping: Record<string, string>;
  providerGroups: ProviderModelGroup[];
  isLoading: boolean;
  error: string | null;
}

export function useAllModels({
  isAuthenticated,
  storedApiKeys,
  providers = ["openai", "google", "ollama", "gguf", "mlx"]
}: UseAllModelsOptions): AllModelsState {
  const [state, setState] = useState<AllModelsState>({
    allModels: [],
    allModelMapping: {},
    providerGroups: [],
    isLoading: false,
    error: null
  });

  const loadAllModels = useCallback(async () => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    const allModels: string[] = [];
    const allModelMapping: Record<string, string> = {};
    const providerGroups: ProviderModelGroup[] = [];
    let completed = 0;

    // Fire each provider independently — update state as each resolves
    // so connected providers don't wait for slow/disconnected ones
    providers.forEach(async (provider) => {
      try {
        const result = await ModelService.loadModels(
          provider,
          isAuthenticated,
          storedApiKeys
        );

        if (result.connectionStatus === "connected") {
          // Store provider group with original model names
          providerGroups.push({
            provider,
            models: result.modelNames,
            modelMapping: result.modelMapping
          });

          // Add provider prefix to model names for backward compatibility
          const prefixedModels = result.modelNames.map(model =>
            `${provider}:${model}`
          );

          allModels.push(...prefixedModels);

          // Update mapping with prefixed names for backward compatibility
          Object.entries(result.modelMapping).forEach(([displayName, modelId]) => {
            const prefixedDisplayName = `${provider}:${displayName}`;
            allModelMapping[prefixedDisplayName] = modelId;
          });
        }
      } catch (error) {
        console.warn(`Failed to load models for ${provider}:`, error);
        // Continue with other providers even if one fails
      }

      completed++;
      setState({
        allModels: [...new Set(allModels)],
        allModelMapping: { ...allModelMapping },
        providerGroups: [...providerGroups],
        isLoading: completed < providers.length,
        error: null,
      });
    });
  }, [isAuthenticated, storedApiKeys, providers.join(",")]);

  // Initial load on mount
  useEffect(() => {
    if (isAuthenticated || providers.includes("gguf")) {
      loadAllModels();
    }
  }, [loadAllModels]);

  // Re-fetch when models change elsewhere (GGUF download, provider save, manual refresh)
  useEffect(() => {
    const onChanged = () => loadAllModels();
    window.addEventListener(MODELS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(MODELS_CHANGED_EVENT, onChanged);
  }, [loadAllModels]);

  return state;
}

export function parsePrefixedModel(prefixedModel: string): { provider: string; model: string } {
  const [provider, ...modelParts] = prefixedModel.split(":");
  return {
    provider: provider || "",
    model: modelParts.join(":") || prefixedModel
  };
}

export function isModelAvailable(
  modelName: string, 
  allModels: string[]
): boolean {
  return allModels.some(prefixedModel => {
    const { model } = parsePrefixedModel(prefixedModel);
    return model.toLowerCase() === modelName.toLowerCase();
  });
}
