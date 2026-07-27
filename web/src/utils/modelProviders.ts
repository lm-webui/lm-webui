// Standardized to match backend provider names
export const PROVIDER_MAPPING = {
  'openai': 'openai',
  'google': 'google',
  'gemini': 'google',
  'ollama': 'ollama',
  'gguf': 'gguf',
  'mlx': 'mlx',
} as const;

export const LOCAL_STORAGE_API_KEY_MAPPING = {
  'openai': 'openAIKey',
  'google': 'googleKey',
} as const;

export const PROVIDERS_REQUIRING_API_KEY = [
  'openai',
  'google',
] as const;

export type ProviderId = keyof typeof PROVIDER_MAPPING;
