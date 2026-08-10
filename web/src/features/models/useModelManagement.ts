import { useState } from "react";
import { ModelService } from "./modelService";
import { UseModelManagementOptions } from "./types";

export function useModelManagement(options: UseModelManagementOptions) {
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  const loadModels = async () => {
    options.onConnectionStatusUpdate("testing");

    const result = await ModelService.loadModels(
      options.selectedLLM,
      options.isAuthenticated,
      options.storedApiKeys
    );

    options.onModelsUpdate(result.modelNames);
    options.onModelMappingUpdate(result.modelMapping);
    options.onConnectionStatusUpdate(result.connectionStatus);

    if (!result.modelNames.includes(options.selectedModel)) {
      options.onSelectedModelUpdate(result.modelNames[0] || "");
    }
  };

  const loadImageModels = async () => {
    const imageModels = await ModelService.loadImageModels();
    options.onSupportedImageModelsUpdate(imageModels);
  };

  const refreshModels = async () => {
    setIsLoadingModels(true);
    try {
      await loadModels();
    } finally {
      setIsLoadingModels(false);
    }
  };

  const validateModelSupport = (modelId: string, supportedModels: string[]): boolean => {
    return supportedModels.some(model => model.toLowerCase() === modelId.toLowerCase());
  };

  return {
    isLoadingModels,
    setIsLoadingModels,
    loadModels,
    loadImageModels,
    refreshModels,
    validateModelSupport,
  };
}
