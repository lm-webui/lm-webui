import { PROVIDER_MAPPING, LOCAL_STORAGE_API_KEY_MAPPING } from './modelProviders';
import { authFetch } from "../utils/api";

export async function getApiKeyForProvider(
  provider: string,
  providedKey?: string,
  isAuthenticated?: boolean
): Promise<string | undefined> {
  // If key is provided, use it
  if (providedKey) {
    return providedKey;
  }

  // Try backend first if authenticated
  if (isAuthenticated) {
    try {
      const backendProvider = PROVIDER_MAPPING[provider as keyof typeof PROVIDER_MAPPING] || provider;
      const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8008';
      
      const data = await authFetch(`${API_BASE_URL}/api/api_keys/${backendProvider}`);
      return data.api_key;
    } catch (error) {
      console.warn(`Failed to fetch API key from backend for ${provider}:`, error);
    }
  }

  // Fallback to localStorage
  const localStorageKey = LOCAL_STORAGE_API_KEY_MAPPING[provider as keyof typeof LOCAL_STORAGE_API_KEY_MAPPING];
  if (localStorageKey) {
    return localStorage.getItem(localStorageKey) || undefined;
  }

  return undefined;
}

/**
 * Get backend provider name from frontend provider name
 */
export function getBackendProviderName(frontendProvider: string): string {
  return PROVIDER_MAPPING[frontendProvider as keyof typeof PROVIDER_MAPPING] || frontendProvider;
}

/**
 * Get frontend provider name from backend provider name
 */
export function getFrontendProviderName(backendProvider: string): string {
  return PROVIDER_MAPPING[backendProvider as keyof typeof PROVIDER_MAPPING] || backendProvider;
}
