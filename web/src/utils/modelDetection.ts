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
      lowerName.includes('thinking')) {
    return { text: true, reasoning: true };
  }

  // Default to text model
  return { text: true };
};
