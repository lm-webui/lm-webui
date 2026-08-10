import { fetchModelsByProvider, fetchImageModels, authFetch } from "@/utils/api";
import { PROVIDERS_REQUIRING_API_KEY } from "@/utils/modelProviders";
import { ConnectionStatus, ModelInfo, ModelFetchResult } from "./types";

// Model capabilities interface
export class ModelService {
  private static readonly PROVIDERS_REQUIRING_API_KEY = PROVIDERS_REQUIRING_API_KEY as any;

  /**
   * Safe URL construction helper
   */
  private static getApiUrl(path: string): string {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || '';
    // If path starts with / and baseUrl ends with /, remove one
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${cleanBase}${cleanPath}`;
  }

// Load GGUF models from local API
  private static async loadGGUFModels(): Promise<ModelFetchResult> {
    try {
      const response = await authFetch(this.getApiUrl('/api/models/local'));
      
      // Robust handling for both wrapped {"models": [...]} and direct [...] responses
      const ggufModels = Array.isArray(response?.models) 
        ? response.models 
        : (Array.isArray(response) ? response : []);
      
      const modelNames = ggufModels.map((model: any) => {
        const name = model.name || model.id || 'Unknown';
        return name.endsWith('.gguf') ? name : `${name}.gguf`;
      });

      // Transform GGUF models to ModelInfo format with consistent gguf: prefix
      const modelInfos: ModelInfo[] = ggufModels.map((model: any) => {
        const rawId = model.id || model.name || 'unknown';
        // Ensure consistent ID with gguf: prefix for ModelSelector filtering
        const id = rawId.startsWith('gguf:') ? rawId : `gguf:${rawId}`;
        const name = model.name || model.id || 'Unknown Model';
        return { id, name };
      });

      return {
        models: modelInfos,
        modelMapping: Object.fromEntries(modelInfos.map((m: any) => [m.name, m.id])),
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
    let rawModels: any = await fetchModelsByProvider(provider);
    if (!Array.isArray(rawModels)) {
      console.warn(`Invalid models response for ${provider}:`, rawModels);
      rawModels = [];
    }
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
    // Return empty when no provider is selected yet (e.g. before settings load)
    if (!provider) {
      return { models: [], modelMapping: {}, modelNames: [], connectionStatus: "disconnected" };
    }
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

}
