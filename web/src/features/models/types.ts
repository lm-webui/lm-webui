export type ConnectionStatus = "connected" | "disconnected" | "testing";

export interface ModelInfo {
  id: string;
  name?: string;
}

export interface UseModelManagementOptions {
  selectedLLM: string;
  selectedModel: string;
  isAuthenticated: boolean;
  storedApiKeys: Record<string, boolean>;
  isImageMode?: boolean;
  onModelsUpdate: (models: string[]) => void;
  onModelMappingUpdate: (mapping: Record<string, string>) => void;
  onConnectionStatusUpdate: (status: ConnectionStatus) => void;
  onSelectedModelUpdate: (model: string) => void;
  onSupportedImageModelsUpdate: (models: string[]) => void;
}

export interface ProviderMapping {
  [key: string]: string;
}

export interface ModelFetchResult {
  models: ModelInfo[];
  modelMapping: Record<string, string>;
  modelNames: string[];
}
