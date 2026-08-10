// Centralized provider metadata (name, icon, color, type, placeholder, categories).
// Single source of truth for provider UI config across the app.
import type { ComponentType } from "react";
import { RiOpenaiFill, RiAnthropicFill, RiGeminiFill, RiGrokAiFill, RiImageAiFill } from "react-icons/ri";
import { SiOllama, SiDeepseek, SiVllm, SiLmstudio, SiHuggingface, SiApple } from "react-icons/si";

export type ProviderType = "cloud" | "local";
export type ProviderCategory = "model" | "api" | "image";

export interface Provider {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string; size?: number }>;
  color?: string; // tailwind text-*
  type?: ProviderType;
  placeholder?: string;
  requiresApiKey?: boolean;
  categories: ProviderCategory[];
}

export const PROVIDERS: Record<string, Provider> = {
  ollama: {
    id: "ollama", name: "Ollama", icon: SiOllama, color: "text-cyan-500",
    type: "local", placeholder: "http://localhost:11434",
    categories: ["model", "api"],
  },
  gguf: {
    id: "gguf", name: "GGUF", icon: SiHuggingface, color: "text-gray-500",
    categories: ["model"],
  },
  mlx: {
    id: "mlx", name: "MLX", icon: SiApple, color: "text-purple-500",
    categories: ["model"],
  },
  openai: {
    id: "openai", name: "OpenAI", icon: RiOpenaiFill, color: "text-green-500",
    type: "cloud", placeholder: "sk-...", requiresApiKey: true,
    categories: ["model", "api", "image"],
  },
  google: {
    id: "google", name: "Google Gemini", icon: RiGeminiFill, color: "text-blue-500",
    type: "cloud", placeholder: "AIza...", requiresApiKey: true,
    categories: ["model", "api", "image"],
  },
  anthropic: {
    id: "anthropic", name: "Anthropic (Claude)", icon: RiAnthropicFill, type: "cloud",
    placeholder: "sk-ant-...", requiresApiKey: true, categories: ["api"],
  },
  xai: {
    id: "xai", name: "Grok (SpaceXAI)", icon: RiGrokAiFill, type: "cloud",
    placeholder: "xai-...", requiresApiKey: true, categories: ["api"],
  },
  deepseek: {
    id: "deepseek", name: "DeepSeek", icon: SiDeepseek, type: "cloud",
    placeholder: "sk-...", requiresApiKey: true, categories: ["api"],
  },
  vllm: {
    id: "vllm", name: "vLLM", icon: SiVllm, type: "local",
    placeholder: "http://localhost:8000", categories: ["api"],
  },
  lmstudio: {
    id: "lmstudio", name: "LM Studio", icon: SiLmstudio, type: "local",
    placeholder: "http://localhost:1234", categories: ["api"],
  },
  comfyui: {
    id: "comfyui", name: "ComfyUI", icon: RiImageAiFill, categories: ["image"],
  },
};

export const byCategory = (c: ProviderCategory): Provider[] =>
  Object.values(PROVIDERS).filter((p) => p.categories.includes(c));

export const MODEL_PROVIDERS: Provider[] = byCategory("model");
export const API_PROVIDERS: Provider[] = byCategory("api");

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
