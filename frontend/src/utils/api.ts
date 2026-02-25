import { PROVIDER_MAPPING } from './modelProviders';
import { useAuth } from '../hooks/useAuth';
import { SSEService } from '../services/SSEService';

// In production, we use relative paths since the backend serves the frontend.
// In development, VITE_BACKEND_URL can be used for HMR/cross-origin.
const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';

// Helper function to handle token refresh
async function handleTokenRefresh(): Promise<void> {
  console.log('🔐 401 detected, attempting token refresh...');
  
  try {
    const refreshResponse = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    
    if (refreshResponse.ok) {
      console.log('✅ Token refreshed successfully');
      return;
    } else {
      console.warn('⚠️ Token refresh failed with status:', refreshResponse.status);
      throw new Error('Token refresh failed');
    }
  } catch (refreshError) {
    console.error('❌ Token refresh error:', refreshError);
    useAuth.getState().logout();
    throw new Error('Authentication failed. Please login again.');
  }
}

// Helper function to parse response based on content type
async function parseResponse(response: Response, url: string): Promise<any> {
  const contentType = response.headers.get('content-type');
  
  if (contentType?.includes('application/json')) {
    return response.json();
  } else if (contentType?.includes('application/octet-stream') ||
             url.includes('/download/') ||
             url.includes('/api/download/')) {
    return response.blob();
  } else {
    return response.text();
  }
}

// Helper function to create standardized fetch options
function createFetchOptions(options: RequestInit = {}): RequestInit {
  return {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  };
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<any> {
  const fetchOptions = createFetchOptions(options);

  try {
    const response = await fetch(url, fetchOptions);
    
    // Handle 401 Unauthorized - attempt token refresh
    if (response.status === 401) {
      await handleTokenRefresh();
      // Retry the original request with fresh token
      return fetch(url, fetchOptions);
    }
    
    // Handle non-401 errors
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || errorData.detail || `HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await parseResponse(response, url);
  } catch (error: any) {
    // Re-throw with enhanced error info
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to server');
    }
    throw error;
  }
}

function isAuthenticated(): boolean {
  return useAuth.getState().isAuthenticated;
}

interface ChatRequest {
  message: string;
  provider: string;
  model: string;
  api_key?: string;
  endpoint?: string;
  conversation_history?: any[];
  signal?: AbortSignal; 
  show_raw_response?: boolean; 
  deep_thinking_mode?: boolean; 
  conversation_id?: string;
  file_references?: any[];
  web_search?: boolean;
  search_provider?: string;
}

// Validate ChatRequest before sending
function validateChatRequest(req: ChatRequest): void {
  if (!req.message || !req.message.trim()) {
    throw new Error("Message is required");
  }
  if (!req.provider || !req.provider.trim()) {
    throw new Error("Provider is required");
  }
  if (!req.model || !req.model.trim()) {
    throw new Error("Model is required");
  }
}

export async function chatWithModel(req: ChatRequest): Promise<string> {
  validateChatRequest(req);
  return await _chatWithModel(req, false, false);
}

export async function chatWithModelStream(req: ChatRequest, onChunk?: (chunk: string) => void, onStatus?: (status: string) => void): Promise<string> {
  validateChatRequest(req);
  return await _chatWithModel(req, true, false, onChunk, onStatus);
}

export async function chatWithRAG(req: ChatRequest): Promise<string> {
  validateChatRequest(req);
  return await _chatWithModel(req, false, true);
}

export async function chatWithRAGStream(req: ChatRequest, onChunk?: (chunk: string) => void, onStatus?: (status: string) => void): Promise<string> {
  validateChatRequest(req);
  return await _chatWithModel(req, true, true, onChunk, onStatus);
}

async function _chatWithModel(
  req: ChatRequest, 
  stream: boolean = false, 
  useRAG: boolean = false,
  onChunk?: (chunk: string) => void,
  onStatus?: (status: string) => void
): Promise<string> {
  // Create request - API keys will be retrieved from backend database
  const requestWithKey = {
    ...req,
    api_key: req.api_key,
    use_rag: useRAG,  // Add use_rag parameter for enhanced endpoint
  };

  console.log('🔍 DEBUG _chatWithModel requestWithKey:', {
    hasConversationId: 'conversation_id' in requestWithKey,
    conversationId: requestWithKey.conversation_id,
    keys: Object.keys(requestWithKey),
    messagePreview: requestWithKey.message?.substring(0, 50)
  });

  // Always use the enhanced chat endpoint which handles both regular and RAG
  const endpoint = '/api/chat';

  try {
    // Check if we expect streaming response (when raw/deep modes are enabled)
    const shouldStream = req.show_raw_response || req.deep_thinking_mode;

    if (shouldStream && stream) {
      // Use the production-ready SSEService for streaming
      // Ensure api_key is a string (not undefined) for SSEService compatibility
      const streamingRequest = {
        ...requestWithKey,
        api_key: requestWithKey.api_key || '',
      };
      
      // Build streaming options, only including defined callbacks
      const streamingOptions: any = {
        signal: req.signal,
        timeout: 30000,
        maxRetries: 2,
      };
      
      if (onChunk) streamingOptions.onChunk = onChunk;
      if (onStatus) streamingOptions.onStatus = onStatus;
      
      return await SSEService.streamChat(streamingRequest, streamingOptions);
    } else {
      // Handle regular non-streaming response
      const response = await authFetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestWithKey)
      });

      // Handle errors from the backend
      if (response.error) {
        throw new Error(response.message || response.error);
      }

      return response.response;
    }
  } catch (error: any) {
    // Handle fetch errors (network, HTTP status codes)
    throw error;
  }
}

export async function searchQuery(query: string): Promise<Array<{title: string, link: string, snippet: string}>> {
  const url = new URL(`${API_BASE_URL}/api/search`);
  url.searchParams.set('q', query);
  const response = await authFetch(url.toString());
  return response;
}

export async function generateDocx(req: ChatRequest): Promise<string> {
  // Retrieve API key for document generation
  let apiKeyToUse = req.api_key;
  if (!apiKeyToUse && isAuthenticated()) {
    try {
      // For authenticated users, try to get from backend first
      if (req.provider === "openai") {
        const apiKeyData = await authFetch(`${API_BASE_URL}/api/api_keys/openai`);
        apiKeyToUse = apiKeyData.api_key;
      }
    } catch (error) {
      // Fallback to localStorage for authenticated users if backend fails
      apiKeyToUse = localStorage.getItem("openAIKey") || undefined;
    }
  } else if (!apiKeyToUse) {
    // For unauthenticated users, try localStorage
    apiKeyToUse = localStorage.getItem("openAIKey") || undefined;
  }

  const requestWithKey = { ...req, api_key: apiKeyToUse };
  const response = await authFetch(`${API_BASE_URL}/api/generate/docx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestWithKey)
  });
  return response.file;
}

export async function generateXlsx(req: ChatRequest): Promise<string> {
  // Retrieve API key for spreadsheet generation
  let apiKeyToUse = req.api_key;
  if (!apiKeyToUse && isAuthenticated()) {
    try {
      // For authenticated users, try to get from backend first
      if (req.provider === "openai") {
        const apiKeyData = await authFetch(`${API_BASE_URL}/api/api_keys/openai`);
        apiKeyToUse = apiKeyData.api_key;
      }
    } catch (error) {
      // Fallback to localStorage for authenticated users if backend fails
      apiKeyToUse = localStorage.getItem("openAIKey") || undefined;
    }
  } else if (!apiKeyToUse) {
    // For unauthenticated users, try localStorage
    apiKeyToUse = localStorage.getItem("openAIKey") || undefined;
  }

  const requestWithKey = { ...req, api_key: apiKeyToUse };
  const response = await authFetch(`${API_BASE_URL}/api/generate/xlsx`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestWithKey)
  });
  return response.file;
}

export async function generateImage(req: ChatRequest, conversationId?: string): Promise<string> {
  // Retrieve API key based on provider for image generation
  let apiKeyToUse = req.api_key;
  if (!apiKeyToUse && isAuthenticated()) {
    try {
      // Use centralized provider mapping
      const backendProvider = (PROVIDER_MAPPING as any)[req.provider] || req.provider;

      const apiKeyData = await authFetch(`${API_BASE_URL}/api/api_keys/${backendProvider}`);
      apiKeyToUse = apiKeyData.api_key;
    } catch (error) {
      // Fallback mappings for localStorage
      const localStorageMapping: Record<string, string> = {
        'openai': 'openAIKey',
        'grok': 'xaiKey',
        'claude': 'anthropicKey',
        'google': 'googleKey'  // Frontend uses 'google', localStorage uses 'googleKey'
      };
      const localStorageKey = localStorageMapping[req.provider] || `${req.provider}Key`;
      apiKeyToUse = localStorage.getItem(localStorageKey) || undefined;
    }
  } else if (!apiKeyToUse) {
    // Fallback for unauthenticated users
    const localStorageMapping: Record<string, string> = {
      'openai': 'openAIKey',
      'grok': 'xaiKey',
      'claude': 'anthropicKey',
      'google': 'googleKey'  // Frontend uses 'google', localStorage uses 'googleKey'
    };
    const localStorageKey = localStorageMapping[req.provider] || `${req.provider}Key`;
    apiKeyToUse = localStorage.getItem(localStorageKey) || undefined;
  }

  // Create the correct request format for image generation
  // Backend expects: { prompt, model, api_key, size, quality, style, conversation_id }
  const imageRequest: any = {
    prompt: req.message, // Convert 'message' to 'prompt'
    model: req.model,
    api_key: apiKeyToUse,
    size: "1024x1024", // Default size
    quality: "standard", // Default quality
    style: "vivid" // Default style
  };

  // Add conversation_id if provided
  if (conversationId) {
    imageRequest.conversation_id = conversationId;
  }

  const response = await authFetch(`${API_BASE_URL}/api/images/generate/${req.provider}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(imageRequest)
  });

  // Handle errors from the backend
  if (response.error) {
    throw new Error(response.message || response.error);
  }

  return response.image_url;
}

export async function downloadFile(filename: string): Promise<Blob> {
  const response = await authFetch(`${API_BASE_URL}/api/download/${filename}`);
  return response;
}

export async function fetchSettings(): Promise<Record<string, any>> {
  const response = await authFetch(`${API_BASE_URL}/api/settings`);
  return response;
}

export async function updateSettings(settings: Record<string, any>): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/settings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(settings)
  });
}

export interface FetchModelsOptions {
  /** Whether to use dynamic model fetching (default: true) */
  dynamic?: boolean;
  /** Whether to fetch all providers at once (default: false) */
  allProviders?: boolean;
  /** API key to use (for unauthenticated requests) */
  apiKey?: string | undefined;
  /** Whether to force a refresh (bypass cache) */
  forceRefresh?: boolean;
}

// Cache for model fetching to prevent redundant requests
const modelsCache: Record<string, { timestamp: number, data: string[] | Record<string, string[]> }> = {};
const activeFetchPromises: Record<string, Promise<string[] | Record<string, string[]>>> = {};
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

/**
 * Unified model fetching function
 * 
 * @param provider - Provider name (e.g., 'openai', 'google', 'gguf'). If not provided, fetches all providers.
 * @param options - Fetch options
 * @returns Array of model names or record of provider->models
 */
export async function fetchModels(
  provider?: string, 
  options: FetchModelsOptions = {}
): Promise<string[] | Record<string, string[]>> {
  const { dynamic = true, allProviders = false, apiKey, forceRefresh = false } = options;
  
  // Create a unique cache key based on params
  const cacheKey = `models_${provider || 'all'}_${dynamic ? 'dynamic' : 'static'}_${allProviders ? 'all' : 'single'}_${apiKey ? 'with_key' : 'no_key'}`;
  
  // Return cached result if valid and not forcing refresh
  if (!forceRefresh && modelsCache[cacheKey]) {
    const cached = modelsCache[cacheKey];
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }
  
  // Return active promise if already fetching
  if (activeFetchPromises[cacheKey]) {
    return activeFetchPromises[cacheKey];
  }
  
  // Create new fetch promise
  const fetchPromise = (async () => {
    try {
      // Handle GGUF models
      if (provider === 'gguf') {
        const response = await authFetch(`${API_BASE_URL}/api/models/local`);
        
        if (Array.isArray(response.models)) {
          const models = response.models.map((model: any) => 
            typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
          );
          return models;
        }
        
        return [];
      }
      
      // Use centralized provider mapping
      const providerMapping = PROVIDER_MAPPING;
      
      // Fetch all providers if requested or no provider specified
      if (allProviders || !provider) {
        const [localModels, apiModels] = await Promise.all([
          authFetch(`${API_BASE_URL}/api/models/local`).catch(() => ({ models: [] })),
          authFetch(`${API_BASE_URL}/api/models/api/all`).catch(() => ({ models: [] }))
        ]);
        
        const transformedModels: Record<string, string[]> = {};
        
        // Add GGUF models
        if (Array.isArray(localModels.models)) {
          transformedModels['gguf'] = localModels.models.map((model: any) => 
            model.name || model.id || 'Unknown Model'
          );
        }
        
        // Add API models
        if (Array.isArray(apiModels.models)) {
          for (const model of apiModels.models) {
            const modelProvider = model.provider || 'unknown';
            if (!transformedModels[modelProvider]) {
              transformedModels[modelProvider] = [];
            }
            transformedModels[modelProvider].push(model.name || model.id || 'Unknown Model');
          }
        }
        
        return transformedModels;
      }
      
      // Single provider fetch
      const backendProvider = (providerMapping as any)[provider!] || provider;
      
      // Try dynamic endpoint first if enabled
      if (dynamic) {
        try {
          const dynamicUrl = new URL(`${API_BASE_URL}/api/models/api/dynamic`);
          dynamicUrl.searchParams.set('provider', provider);
          
          console.log(`🔄 Fetching dynamic models for ${provider} (backend: ${backendProvider})`);
          const response = await authFetch(dynamicUrl.toString());
          
          if (Array.isArray(response.models)) {
            const models = response.models.map((model: any) => 
              typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
            );
            console.log(`✅ Dynamic models fetched for ${provider}: (${models.length})`, models);
            return models;
          }
        } catch (error) {
          console.warn(`⚠️ Dynamic model fetch failed for ${provider}, falling back to static models:`, error);
        }
      }
      
      // Fallback to static endpoint
      const staticUrl = new URL(`${API_BASE_URL}/api/models/api`);
      staticUrl.searchParams.set('provider', backendProvider);

      const response = await authFetch(staticUrl.toString());
      
      if (Array.isArray(response.models)) {
        const models = response.models.map((model: any) => 
          typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
        );
        console.log(`📋 Static models fetched for ${provider}: (${models.length})`, models);
        return models;
      }
      
      return [];
    } finally {
      // Clean up active promise
      delete activeFetchPromises[cacheKey];
    }
  })();
  
  // Store promise
  activeFetchPromises[cacheKey] = fetchPromise;
  
  // Wait for result and update cache
  try {
    const result = await fetchPromise;
    modelsCache[cacheKey] = {
      timestamp: Date.now(),
      data: result
    };
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Refresh model cache for a provider
 * 
 * @param provider - Provider name (optional, refreshes all if not provided)
 */
export async function refreshModelsCache(provider?: string): Promise<void> {
  // For GGUF models, no refresh needed as they're local files
  if (provider === 'gguf') {
    return;
  }
  
  // For API providers, use the refresh endpoint
  const url = new URL(`${API_BASE_URL}/api/models/api/refresh`);
  if (provider) {
    url.searchParams.set('provider', provider);
  }
  await authFetch(url.toString(), {
    method: 'POST',
  });
}

// Backward compatibility alias (keep only the one that's actually used)
export const fetchModelsByProvider = (provider: string) => fetchModels(provider, { dynamic: true }) as Promise<string[]>;

export async function fetchImageModels(): Promise<string[]> {
  const response = await authFetch(`${API_BASE_URL}/api/images/models`);
  return response.models;
}


// History and Session Management APIs
export interface HistoryMessage {
  role: string;
  content: string;
  model?: string;
}

export interface Session {
  session_id: string;
  title: string;
  last_activity: string;
  message_count: number;
}

export interface SessionHistory {
  messages: Array<{
    id: number;
    session_id: string;
    role: string;
    content: string;
    model?: string;
    timestamp: string;
  }>;
  images: Array<{
    id: number;
    session_id: string;
    prompt: string;
    seed?: number;
    file_path: string;
    timestamp: string;
  }>;
}

export async function getConversationHistory(conversationId: string): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}`);
  return response;
}

export async function listConversations(): Promise<any[]> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversations`);
  return response.conversations;
}

export async function updateConversationTitle(conversationId: string, title: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title })
  });
}

export async function generateConversationTitle(conversationId: string): Promise<{ message: string; conversation_id: string; status: string }> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}/generate-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  return response;
}

export async function deleteConversation(conversationId: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}`, {
    method: 'DELETE',
  });
}

export async function saveMessage(conversationId: string, role: string, content: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/chat/message`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversation_id: conversationId,
      role: role,
      message: content
    })
  });
}

export async function getConversation(conversationId: string): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}`);
  return response.messages;
}

// File References API
export interface FileReference {
  id: number;
  conversation_id: string;
  user_id: number;
  message_id: number;
  file_type: string;
  file_path: string;
  metadata: any;
  created_at: string;
}

export async function getFileReferences(conversationId: string): Promise<FileReference[]> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}/files`);
  return response.files || [];
}

export async function getConversationWithFiles(conversationId: string): Promise<{
  messages: any[];
  files: FileReference[];
}> {
  const [messages, files] = await Promise.all([
    getConversation(conversationId),
    getFileReferences(conversationId)
  ]);
  
  return { messages, files };
}

export async function createConversation(
  title: string = "New Chat", 
  conversationId?: string
): Promise<{ conversation_id: string; title: string; created_at: string; exists?: boolean }> {
  const body: any = { title };
  if (conversationId) {
    body.conversation_id = conversationId;
  }
  
  const response = await authFetch(`${API_BASE_URL}/api/sessions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  return response;
}

export async function getUserSessions(): Promise<Session[]> {
  const response = await authFetch(`${API_BASE_URL}/api/sessions`);
  return response.sessions;
}

export async function getCurrentSession(): Promise<any> {
  const response = await authFetch(`${API_BASE_URL}/api/sessions/current`);
  return response.session;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}


// API Key Management Functions
export interface ApiKey {
  provider: string;
  created_at: string;
}

export async function addApiKey(provider: string, apiKey: string): Promise<void> {
  // For local providers (lmstudio, ollama), the apiKey is actually a URL
  const localProviders = ["lmstudio", "ollama"];
  const requestBody: any = {
    provider,
    api_key: apiKey
  };
  
  if (localProviders.includes(provider)) {
    // For local providers, we should send the URL as the api_key
    // The backend will handle it appropriately
    requestBody.api_key = apiKey;
  }
  
  await authFetch(`${API_BASE_URL}/api/api_keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody)
  });
}

export async function testApiKey(provider: string): Promise<{ valid: boolean; message: string }> {
  const response = await authFetch(`${API_BASE_URL}/api/api_keys/${provider}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  return response;
}

export async function getApiKey(provider: string): Promise<string> {
  const response = await authFetch(`${API_BASE_URL}/api/api_keys/${provider}`);
  return response.api_key;
}

export async function deleteApiKey(provider: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/api_keys/${provider}`, {
    method: 'DELETE',
  });
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const response = await authFetch(`${API_BASE_URL}/api/api_keys`);
  return response.keys || [];
}

// Conversation management functions
export async function deleteConversationFromBackend(conversationId: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}`, {
    method: 'DELETE',
  });
}

export async function updateConversationTitleInBackend(conversationId: string, title: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}/title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title })
  });
}

export async function generateConversationTitleInBackend(conversationId: string): Promise<{ message: string; conversation_id: string; status: string }> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}/generate-title`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    }
  });
  return response;
}

// SSE (Server-Sent Events) for real-time title updates
export interface TitleUpdateEvent {
  title: string;
  type: 'title_update' | 'timeout' | 'error';
  message?: string;
  timestamp?: string;
}

export interface TitleUpdateOptions {
  onTitleUpdate: (title: string) => void;
  onTimeout?: () => void;
  onError?: (error: Error) => void;
  timeoutMs?: number;
}

/**
 * Listen for real-time title updates via SSE
 * Returns a cleanup function to close the connection
 */
export function listenForTitleUpdates(
  conversationId: string,
  options: TitleUpdateOptions
): () => void {
  const { onTitleUpdate, onTimeout, onError, timeoutMs = 30000 } = options;
  
  const url = `${API_BASE_URL}/api/conversations/${conversationId}/title-updates`;
  const eventSource = new EventSource(url, { withCredentials: true });
  
  let timeoutId: NodeJS.Timeout | null = null;
  
  // Set timeout
  if (timeoutMs > 0) {
    timeoutId = setTimeout(() => {
      eventSource.close();
      if (onTimeout) onTimeout();
    }, timeoutMs);
  }
  
  eventSource.onmessage = (event) => {
    try {
      const data: TitleUpdateEvent = JSON.parse(event.data);
      
      if (data.type === 'title_update' && data.title) {
        onTitleUpdate(data.title);
        eventSource.close();
        if (timeoutId) clearTimeout(timeoutId);
      } else if (data.type === 'timeout') {
        if (onTimeout) onTimeout();
        eventSource.close();
        if (timeoutId) clearTimeout(timeoutId);
      } else if (data.type === 'error') {
        throw new Error(data.message || 'SSE error');
      }
    } catch (error) {
      console.error('Error parsing SSE event:', error);
      if (onError) onError(error as Error);
      eventSource.close();
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    if (onError) onError(new Error('SSE connection failed'));
    eventSource.close();
    if (timeoutId) clearTimeout(timeoutId);
  };
  
  // Return cleanup function
  return () => {
    eventSource.close();
    if (timeoutId) clearTimeout(timeoutId);
  };
}

