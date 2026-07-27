import { ActiveModes } from "./types/modelModality";
import { detectModelModality, isReasoningModel, isImageModel } from "@/utils/modelDetection";
import { parsePrefixedModel } from "./useAllModels";

// Extract base model name from prefixed format
export const extractBaseModelName = (modelName: string): string => {
  // Handle prefixed model names (provider:model)
  const { model } = parsePrefixedModel(modelName);
  return model;
};

const shouldIncludeModel = (modelName: string, activeModes: ActiveModes): boolean => {
  const modality = detectModelModality(modelName);
  
  // Image mode: only show image generation models
  if (activeModes.isImageMode) {
    return modality.imageGeneration === true;
  }
  
  // Reasoning mode: only show reasoning-capable models
  if (activeModes.isReasoningMode) {
    return modality.reasoning === true;
  }
  
  // Normal mode: show all models except image generation models
  return modality.imageGeneration !== true;
};

export const getFilteredModels = (
  models: string[],
  activeModes: ActiveModes,
  searchQuery: string = ""
): string[] => {
  // First filter by modality using base model names
  const modalityFiltered = models.filter(model => {
    const baseModelName = extractBaseModelName(model);
    return shouldIncludeModel(baseModelName, activeModes);
  });

  // Then apply search filter if provided
  if (!searchQuery.trim()) {
    return modalityFiltered;
  }

  const query = searchQuery.toLowerCase();
  return modalityFiltered.filter(model =>
    model.toLowerCase().includes(query)
  );
};

// Get models for specific modality
export const getModelsByModality = (
  models: string[],
  modality: "image" | "reasoning" | "text"
): string[] => {
  return models.filter(model => {
    const baseName = extractBaseModelName(model);
    switch (modality) {
      case "image":
        return isImageModel(baseName);
      case "reasoning":
        return isReasoningModel(baseName);
      case "text":
        return !isImageModel(baseName);
      default:
        return true;
    }
  });
};

/**
 * Check if current model selection is valid for active modes
 */
export const validateModelSelection = (
  selectedModel: string,
  availableModels: string[],
  activeModes: ActiveModes
): { isValid: boolean; suggestedModel?: string } => {
  // If no model selected, suggest first available
  if (!selectedModel) {
    const filtered = getFilteredModels(availableModels, activeModes);
    const suggestedModel = filtered[0];
    return suggestedModel ? { isValid: false, suggestedModel } : { isValid: false };
  }

  // Check if selected model is in filtered list
  const filtered = getFilteredModels(availableModels, activeModes);
  const isValid = filtered.includes(selectedModel);

  if (!isValid) {
    // Suggest first available model
    const suggestedModel = filtered[0];
    return suggestedModel ? { isValid: false, suggestedModel } : { isValid: false };
  }

  return { isValid: true };
};

export const getModelModalityInfo = (modelName: string): {
  isImageModel: boolean;
  isReasoningModel: boolean;
  isTextModel: boolean;
} => {
  const baseModelName = extractBaseModelName(modelName);
  const modality = detectModelModality(baseModelName);
  
  return {
    isImageModel: modality.imageGeneration === true,
    isReasoningModel: modality.reasoning === true,
    isTextModel: modality.text === true && !modality.imageGeneration,
  };
};
