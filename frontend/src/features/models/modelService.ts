import { fetchModelsByProvider, fetchImageModels, authFetch } from "@/utils/api";
import { PROVIDER_MAPPING, PROVIDERS_REQUIRING_API_KEY } from "@/utils/modelProviders";
import { ConnectionStatus, ModelInfo, ModelFetchResult, ProviderMapping } from "./types";

// Model capabilities interface
interface ModelCapabilities {
  name: string;
  capabilities: {
    supports_reasoning: boolean;
    reasoning_strength: 'basic' | 'advanced' | 'expert';
    max_reasoning_tokens: number;
    optimal_temperature: number;
    reasoning_capabilities: string[];
    recommended_for: string[];
    limitations: string[];
  };
  reasoning_score: number;
}

export class ModelService {
  private static readonly PROVIDER_MAPPING: ProviderMapping = PROVIDER_MAPPING as any;

  private static readonly PROVIDERS_REQUIRING_API_KEY = PROVIDERS_REQUIRING_API_KEY as any;

// Load GGUF models from local API
  private static async loadGGUFModels(): Promise<ModelFetchResult> {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
      const response = await authFetch(`${API_BASE_URL}/api/models/local`);
      
      // Robust handling for both wrapped {"models": [...]} and direct [...] responses
      const ggufModels = response?.models || (Array.isArray(response) ? response : []);
      
      const modelNames = ggufModels.map((model: any) => model.name || model.id || 'Unknown');

      // Transform GGUF models to ModelInfo format
      const modelInfos: ModelInfo[] = ggufModels.map((model: any) => ({
        id: model.name || model.id || 'unknown',
        name: model.name || model.id || 'Unknown Model'
      }));

      return {
        models: modelInfos,
        modelMapping: Object.fromEntries(modelNames.map((name: string) => [name, name])),
        modelNames
      };
    } catch (error) {
      console.error("Failed to fetch GGUF models:", error);
      throw error;
    }
  }

  /**
   * Load models from external provider API
   */
  private static async loadProviderModels(provider: string): Promise<ModelFetchResult> {
    const rawModels: any[] = await fetchModelsByProvider(provider);
    console.log(`Fetched models for ${provider}: (${rawModels.length})`, rawModels);

    const modelMapping: Record<string, string> = {};
    const modelNames: string[] = [];

    // Transform raw models to ModelInfo format
    const models: ModelInfo[] = rawModels.map((model: any) => {
      if (typeof model === 'string') {
        modelNames.push(model);
        modelMapping[model] = model;
        modelMapping[`${provider}:${model}`] = model;
        return { id: model, name: model };
      } else {
        const displayName = model.name || model.id || 'Unknown Model';
        const modelId = model.id || model.name || 'unknown';
        modelNames.push(displayName);
        // Store both display name and provider-prefixed display name for robust lookup
        modelMapping[displayName] = modelId;
        modelMapping[`${provider}:${displayName}`] = modelId;
        return { id: modelId, name: displayName };
      }
    });

    return {
      models,
      modelMapping,
      modelNames
    };
  }

  static requiresApiKey(provider: string): boolean {
    return this.PROVIDERS_REQUIRING_API_KEY.includes(provider);
  }

  static getBackendProvider(provider: string): string {
    return provider;
  }

  static async loadModels(
    provider: string,
    isAuthenticated: boolean,
    storedApiKeys: Record<string, boolean>
  ): Promise<ModelFetchResult & { connectionStatus: ConnectionStatus }> {
    // Handle GGUF models
    if (provider === "gguf") {
      try {
        const result = await this.loadGGUFModels();
        return {
          ...result,
          connectionStatus: "connected"
        };
      } catch (error) {
        return {
          models: [],
          modelMapping: {},
          modelNames: [],
          connectionStatus: "disconnected"
        };
      }
    }

    // Check API key requirements
    const needsApiKey = this.requiresApiKey(provider);

    if (needsApiKey && isAuthenticated) {
      const backendProvider = this.getBackendProvider(provider);
      const hasStoredApiKey = storedApiKeys[backendProvider];
      console.log(`Checking stored API keys for ${provider} (backend: ${backendProvider}):`, storedApiKeys, hasStoredApiKey);

      if (!hasStoredApiKey) {
        return {
          models: [],
          modelMapping: {},
          modelNames: [],
          connectionStatus: "disconnected"
        };
      }
    } else if (needsApiKey && !isAuthenticated) {
      return {
        models: [],
        modelMapping: {},
        modelNames: [],
        connectionStatus: "disconnected"
      };
    }

    // Load models
    try {
      if (isAuthenticated || !needsApiKey) {
        const result = await this.loadProviderModels(provider);

        const connectionStatus: ConnectionStatus =
          result.modelNames.length > 0 ? "connected" : "disconnected";

        if (result.modelNames.length === 0) {
          console.warn(`No models returned for ${provider}, even though API key exists`);
        }

        return {
          ...result,
          connectionStatus
        };
      } else {
        return {
          models: [],
          modelMapping: {},
          modelNames: [],
          connectionStatus: "disconnected"
        };
      }
    } catch (error: any) {
      console.error("Failed to fetch models:", error);
      return {
        models: [],
        modelMapping: {},
        modelNames: [],
        connectionStatus: "disconnected"
      };
    }
  }

  static async loadImageModels(): Promise<string[]> {
    try {
      const imageModels = await fetchImageModels();
      return imageModels;
    } catch (error) {
      console.error("Failed to fetch image models:", error);
      return [];
    }
  }

  static validateModelSupport(modelId: string, supportedModels: string[]): boolean {
    return supportedModels.some(model => model.toLowerCase() === modelId.toLowerCase());
  }

  static async loadReasoningModels(): Promise<ModelCapabilities[]> {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
      const data = await authFetch(`${API_BASE_URL}/api/search/models/capabilities`);
      return data.models || [];
    } catch (error) {
      console.error("Failed to fetch reasoning models:", error);
      return [];
    }
  }

  static async getReasoningModelNames(): Promise<string[]> {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
      const data = await authFetch(`${API_BASE_URL}/api/search/models/reasoning-capable`);
      return data.models || [];
    } catch (error) {
      console.error("Failed to fetch reasoning model names:", error);
      return [];
    }
  }

  static async recommendModelForQuery(query: string): Promise<{
    recommended_model: string;
    capabilities: any;
    scores: any;
    reasoning: string;
    complexity: string;
  } | null> {
    try {
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
      const data = await authFetch(`${API_BASE_URL}/api/search/models/recommend`, {
        method: 'POST',
        body: JSON.stringify({ query })
      });
      return data.recommendation || null;
    } catch (error) {
      console.error("Failed to get model recommendation:", error);
      return null;
    }
  }

  static filterModelsForDeepThinking(
    allModels: string[],
    isDeepThinkingEnabled: boolean
  ): Promise<string[]> {
    if (!isDeepThinkingEnabled) {
      return Promise.resolve(allModels);
    }

    return this.getReasoningModelNames().then(reasoningModels => {
      // Return intersection of all models and reasoning models
      return allModels.filter(model => reasoningModels.includes(model));
    }).catch(error => {
      console.error("Failed to filter reasoning models:", error);
      // Fallback to all models if filtering fails
      return allModels;
    });
  }
}
