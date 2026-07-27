import { ModelModality } from "@/features/models/types/modelModality";

export const detectModelModality = (modelName: string): ModelModality => {
  const lowerName = modelName.toLowerCase();
  
  // Image generation detection
  if (lowerName.includes('diffusion') || 
      lowerName.includes('stable-diffusion') ||
      lowerName.includes('dalle') ||
      lowerName.includes('midjourney') ||
      lowerName.includes('pixart') ||
      lowerName.includes('image')) {
    return { imageGeneration: true };
  }
  
  // Reasoning model detection
  if (lowerName.includes('reasoning') ||
      lowerName.includes('cot') ||
      lowerName.includes('r1') ||
      lowerName.includes('think') ||
      lowerName.includes('thinking') ||
      lowerName.includes('deepseek-r1') ||
      lowerName.includes('deepseek-reasoning')) {
    return { text: true, reasoning: true };
  }
  
  // Default to text model
  return { text: true };
};

export const isImageModel = (modelName: string): boolean => {
  const modality = detectModelModality(modelName);
  return modality.imageGeneration === true;
};

export const isReasoningModel = (modelName: string): boolean => {
  const modality = detectModelModality(modelName);
  return modality.reasoning === true;
};

export const isTextModel = (modelName: string): boolean => {
  const modality = detectModelModality(modelName);
  return modality.text === true && !modality.imageGeneration;
};
