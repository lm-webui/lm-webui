export interface ModelModality {
  text?: boolean;        // All text-based models (chat, completion)
  imageGeneration?: boolean; // Text-to-image, image-to-image models
  reasoning?: boolean;   // Models with built-in reasoning/CoT capabilities
}

export interface ModelWithModality {
  id: string;
  name: string;
  modality: ModelModality;
  provider?: string;
  contextLength?: number;
}

export interface ActiveModes {
  isImageMode: boolean;
  isReasoningMode: boolean;
  isCodingMode: boolean;
}
