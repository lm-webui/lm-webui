import { PROVIDER_MAPPING } from './modelProviders';
import { useAuth } from '../hooks/useAuth';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL || '';
// new URL() requires an absolute base — use origin when API_BASE_URL is empty (native install)
const URL_BASE = API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : '');

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
  const isFormData = options.body instanceof FormData;
  return {
    ...options,
    credentials: 'include',
    headers: {
      // For FormData (multipart uploads), let the browser set the Content-Type
      // with the multipart boundary — forcing application/json breaks uploads.
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
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
      const detail = errorData.detail;
      let msg = errorData.message;
      if (!msg) {
        if (Array.isArray(detail)) {
          // FastAPI validation errors — surface field + message instead of [object Object]
          msg = detail.map((d: any) => `${(d?.loc || []).join('.')}: ${d?.msg}`).join('; ');
        } else if (detail && typeof detail === 'object') {
          msg = JSON.stringify(detail);
        } else {
          msg = detail || `HTTP ${response.status}: ${response.statusText}`;
        }
      }
      throw new Error(msg || `HTTP ${response.status}: ${response.statusText}`);
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
  conversation_id?: string;
  file_references?: any[];
  web_search?: boolean;
  search_provider?: string;
  is_image_mode?: boolean;
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

export async function chatWithModel(req: ChatRequest): Promise<any> {
  validateChatRequest(req);
  return await _chatWithModel(req);
}

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onStatus?: (stage: string, message: string) => void;
  onSources?: (data: { context_used?: any; sources?: any[]; retrieved_images?: string[] }) => void;
  onImage?: (imageUrl: string) => void;
  onDone?: () => void;
  onError?: (err: Error) => void;
}

// Shared SSE reader: POST `body` to `url`, parse `data: <json>` frames, dispatch each by type.
async function readSSE(
  url: string,
  body: any,
  dispatch: (ev: any) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE frames are separated by blank lines; each carries `data: <json>`.
      let sep = buffer.indexOf('\n\n');
      while (sep !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const dataLine = frame.split('\n').find(l => l.startsWith('data: '));
        if (dataLine) {
          try {
            dispatch(JSON.parse(dataLine.slice(6)));
          } catch {
            /* skip malformed frame */
          }
        }
        sep = buffer.indexOf('\n\n');
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') throw err;
  }
}

// SSE streaming chat. Reads the ModelEvent stream from /api/chat/stream and dispatches by type.
export async function streamChat(
  req: ChatRequest,
  cb: StreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  validateChatRequest(req);
  const requestWithKey = { ...req, api_key: req.api_key };
  try {
    await readSSE('/api/chat/stream', requestWithKey, (ev) => dispatchStreamEvent(ev, cb), signal);
  } catch (err) {
    cb.onError?.(err as Error);
  }
}

function dispatchStreamEvent(ev: any, cb: StreamCallbacks): void {
  switch (ev.type) {
    case 'token':
      if (ev.content) cb.onToken?.(ev.content);
      break;
    case 'status':
      if (ev.data) cb.onStatus?.(ev.data.stage, ev.data.message);
      break;
    case 'sources':
      if (ev.data) cb.onSources?.(ev.data);
      break;
    case 'image':
      if (ev.data?.image_url) cb.onImage?.(ev.data.image_url);
      break;
    case 'complete':
      cb.onDone?.();
      break;
    case 'error':
      cb.onError?.(new Error(ev.content || 'Stream error'));
      break;
    default:
      break;
  }
}

export interface AgentStreamCallbacks {
  onOutput?: (line: string) => void;
  onStatus?: (data: { status?: string; session_id?: string }) => void;
  onPrompt?: (prompt: { prompt_id: string; tool: string; input: any }) => void;
  onTool?: (tool: { tool: string; tool_use_id?: string; input: any }) => void;
  onToolResult?: (result: { tool: string; tool_use_id?: string; content: any; is_error?: boolean }) => void;
  onRun?: (run: any) => void;
  onError?: (err: Error) => void;
  onInstall?: (install: { agent: string; command: string }) => void;
}

// SSE chat with a host CLI agent (Agent Hub). Frames: status, output, prompt, run, complete, error.
export async function streamAgent(
  agent: string,
  body: { message: string; session_id?: string },
  cb: AgentStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  try {
    await readSSE(`/api/agents/${agent}/chat/stream`, body, (ev) => {
      switch (ev.type) {
        case 'status':
          if (ev.data) cb.onStatus?.(ev.data);
          break;
        case 'output':
          if (ev.content) cb.onOutput?.(ev.content);
          break;
        case 'prompt':
          if (ev.data) cb.onPrompt?.(ev.data);
          break;
        case 'tool':
          if (ev.data) cb.onTool?.(ev.data);
          break;
        case 'tool_result':
          if (ev.data) cb.onToolResult?.(ev.data);
          break;
        case 'run':
          if (ev.data) cb.onRun?.(ev.data);
          break;
        case 'install':
          if (ev.data) cb.onInstall?.(ev.data);
          break;
        case 'error':
          cb.onError?.(new Error(ev.content || 'Agent run failed'));
          break;
        default:
          break;
      }
    }, signal);
  } catch (err) {
    cb.onError?.(err as Error);
  }
}

export async function installAgent(agent: string): Promise<{
  launched: boolean; installed?: boolean; agent: string; command?: string;
}> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/install`, { method: 'POST' });
}

// Answer an interactive tool-use permission ask (approve/deny) for the agent's live session.
export async function answerAgent(agent: string, promptId: string, approve: boolean): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/agents/${agent}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_id: promptId, approve }),
  });
}

// Native "allow for this session" — auto-approve subsequent tool asks for the live session.
export async function autoApproveAgent(agent: string): Promise<void> {
  await authFetch(`${API_BASE_URL}/api/agents/${agent}/auto-approve`, { method: 'POST' });
}

// Read/write an agent's config/skill/memory files.
export async function getAgentFiles(agent: string): Promise<{ dir: string; files: any[] }> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/files`);
}
export async function getAgentTranscript(agent: string, sessionId: string): Promise<{
  session_id: string; transcript: { role: string; content: string }[];
}> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/sessions/${sessionId}`);
}
export async function getAgentSessions(agent: string): Promise<{ sessions: any[] }> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/sessions`);
}
export async function getAgentCommands(agent: string): Promise<{ skills: { id: string; label: string; hint?: string }[] }> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/commands`);
}
export async function getAgentUsage(agent: string): Promise<{
  run_count: number; last_run_at?: string;
  total_input_tokens: number; total_output_tokens: number; total_cost_usd: number;
  context_window?: number;
  session_count: number;
  sessions: { sid: string; created_at?: string; run_count: number }[];
}> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/usage`);
}
export async function saveAgentFile(agent: string, name: string, content: string): Promise<{ path: string }> {
  return authFetch(`${API_BASE_URL}/api/agents/${agent}/files/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

async function _chatWithModel(req: ChatRequest): Promise<string> {
  // Create request - API keys will be retrieved from backend database
  const requestWithKey = {
    ...req,
    api_key: req.api_key,
  };

  console.log('🔍 DEBUG _chatWithModel requestWithKey:', {
    hasConversationId: 'conversation_id' in requestWithKey,
    conversationId: requestWithKey.conversation_id,
    keys: Object.keys(requestWithKey),
    messagePreview: requestWithKey.message?.substring(0, 50)
  });

  // Always use the non-streaming REST endpoint. For streaming, use WebSocket.
  const response = await authFetch(`${API_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestWithKey)
  });

  if (response.error) {
    throw new Error(response.message || response.error);
  }

  return response;  // full object: { response, image_url?, conversation_id }
}

export async function searchQuery(query: string): Promise<Array<{title: string, link: string, snippet: string}>> {
  const url = new URL(`${URL_BASE}/api/search`);
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

  // Backend unified endpoint expects: { provider, model, prompt, params }
  const imageRequest: any = {
    provider: req.provider,
    model: req.model,
    prompt: (req as any).prompt || req.message,
    api_key: apiKeyToUse,
    params: (req as any).params || { size: "1024x1024" },
  };

  // img2img: forward uploaded image refs so the backend can resolve and attach them.
  if ((req as any).file_references && (req as any).file_references.length) {
    imageRequest.file_references = (req as any).file_references;
  }

  if (conversationId) {
    imageRequest.conversation_id = conversationId;
  } else if ((req as any).conversation_id) {
    imageRequest.conversation_id = (req as any).conversation_id;
  }

  const response = await authFetch(`${API_BASE_URL}/api/images/generate`, {
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

  return response.url || response.image_url;
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
        
        // Handle both standard {"models": [...]} and raw [...] responses
        const modelsData = Array.isArray(response?.models) 
          ? response.models 
          : (Array.isArray(response) ? response : []);
        
        const models = modelsData.map((model: any) => 
          typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
        );
        return Array.isArray(models) ? models : [];
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
      // Try dynamic endpoint first if enabled
      if (dynamic) {
        try {
          const dynamicUrl = new URL(`${URL_BASE}/api/models/api/dynamic`);
          dynamicUrl.searchParams.set('provider', provider);
          
          console.log(`🔄 Fetching dynamic models for ${provider} (backend: ${backendProvider})`);
          const response = await authFetch(dynamicUrl.toString());
          
          const modelsData = Array.isArray(response?.models) 
            ? response.models 
            : (Array.isArray(response) ? response : []);
          
          const models = modelsData.map((model: any) => 
            typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
          );
          console.log(`✅ Dynamic models fetched for ${provider}: (${models.length})`, models);
          return Array.isArray(models) ? models : [];
        } catch (error) {
          console.warn(`⚠️ Dynamic model fetch failed for ${provider}, falling back to static models:`, error);
        }
      }
      
      // Fallback to static endpoint
      const response = await authFetch(`/api/models/api?provider=${backendProvider}`);
      
      const modelsData = Array.isArray(response?.models) 
        ? response.models 
        : (Array.isArray(response) ? response : []);
      
      const models = modelsData.map((model: any) => 
        typeof model === 'string' ? model : model.name || model.id || 'Unknown Model'
      );
      console.log(`📋 Static models fetched for ${provider}: (${models.length})`, models);
      return Array.isArray(models) ? models : [];
      
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
  const url = new URL(`${URL_BASE}/api/models/api/refresh`);
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

export async function getConversation(conversationId: string): Promise<any[]> {
  const response = await authFetch(`${API_BASE_URL}/api/history/conversation/${conversationId}`);
  // Backend returns { conversation: { id, title, messages: [...] } }
  return response.conversation?.messages || response.messages || [];
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
  conversationId?: string,
  metadata?: Record<string, any>
): Promise<{ conversation_id: string; title: string; created_at: string; exists?: boolean }> {
  const body: any = { title };
  if (conversationId) {
    body.conversation_id = conversationId;
  }
  if (metadata) {
    body.metadata = JSON.stringify(metadata);
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

export async function addApiKey(provider: string, apiKey: string, baseUrl?: string): Promise<void> {
  const requestBody: any = {
    provider,
    api_key: apiKey,
    ...(baseUrl ? { base_url: baseUrl } : {}),
  };

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

export async function testSearxngUrl(baseUrl: string): Promise<{ valid: boolean; message: string }> {
  const response = await authFetch(`${API_BASE_URL}/api/settings/search/connectivity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_url: baseUrl }),
  });
  return response;
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

/**
 * Listen for real-time title updates via SSE
 * Returns a cleanup function to close the connection
 */
export function listenForTitleUpdates(): () => void {
  console.warn("SSE title updates removed"); return () => {};
}
