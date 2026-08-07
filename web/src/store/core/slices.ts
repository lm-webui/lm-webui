import { ChatMessage, ChatConversation } from '@/types/core';

// Base slice interface
export interface BaseSlice {
  _initialized: boolean;
  initialize: () => void;
  reset: () => void;
}

// Chat slice state and actions
export interface ChatSlice extends BaseSlice {
  // State
  conversations: Record<string, ChatConversation>;
  activeChatId: string | null;
  conversationCreationLoading: boolean;
  imageGenerationLoading: boolean;
  processingImages: string[];
  lastError: string | null;
  
  // Actions
  setActiveChat: (chatId: string) => void;
  createNewChat: () => string;
  addMessage: (chatId: string, message: ChatMessage) => void;
  updateConversation: (conversationId: string, updates: Partial<ChatConversation>) => void;
  streamMessageChunk: (chatId: string, chunk: string, messageId?: string) => void;
  startImageGeneration: () => void;
  completeImageGeneration: () => void;
  startConversationCreation: () => void;
  completeConversationCreation: () => void;
  setError: (error: string) => void;
  clearError: () => void;
  addProcessingImage: (imageId: string) => void;
  removeProcessingImage: (imageId: string) => void;
  recoverConversation: (conversationId: string) => void;
  validateConversationState: (conversationId: string) => boolean;
  
  // Selectors (computed properties)
  activeConversation: () => ChatConversation | null;
  activeMessages: () => ChatMessage[];
  isImageProcessing: (imageId: string) => boolean;
}

// Context slice state and actions
export interface ContextSlice extends BaseSlice {
  // State
  activeContext: any | null;
  contextLoading: boolean;
  memoryDeleting: boolean;
  lastError: string | null;
  
  // Actions
  fetchActiveContext: (conversationId: string) => Promise<void>;
  forgetMemory: (memoryId: string) => Promise<void>;
  clearContext: () => void;
  setContextLoading: (loading: boolean) => void;
  setMemoryDeleting: (deleting: boolean) => void;
  setContextError: (error: string | null) => void;
  
  // Selectors
  hasActiveContext: () => boolean;
  isContextLoading: () => boolean;
}

// UI slice state and actions
export interface UISlice extends BaseSlice {
  // State
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  chatLayout: 'bubbles' | 'compact' | 'classic';
  messageDensity: 'comfortable' | 'compact' | 'cozy';
  editorMode: 'simple' | 'advanced';
  notificationSound: boolean;
  notificationVolume: number;
  reduceMotion: boolean;
  
  // Actions
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  setChatLayout: (layout: 'bubbles' | 'compact' | 'classic') => void;
  setMessageDensity: (density: 'comfortable' | 'compact' | 'cozy') => void;
  setEditorMode: (mode: 'simple' | 'advanced') => void;
  setNotificationSound: (enabled: boolean) => void;
  setNotificationVolume: (volume: number) => void;
  toggleReduceMotion: () => void;
  resetToDefaults: () => void;
  
  // Selectors
  isDarkMode: () => boolean;
  sidebarState: () => { collapsed: boolean; width: number };
}

// Settings slice state and actions
export interface SettingsSlice extends BaseSlice {
  // State
  loggingLevel: 'debug' | 'info' | 'warn' | 'error' | 'silent';
  showPerformanceStats: boolean;
  batchSize: number;
  debounceDelay: number;
  enableTokenBatching: boolean;
  enableDebouncedUpdates: boolean;
  
  // Actions
  setLoggingLevel: (level: 'debug' | 'info' | 'warn' | 'error' | 'silent') => void;
  setShowPerformanceStats: (show: boolean) => void;
  setBatchSize: (size: number) => void;
  setDebounceDelay: (delay: number) => void;
  setEnableTokenBatching: (enabled: boolean) => void;
  setEnableDebouncedUpdates: (enabled: boolean) => void;
  resetSettings: () => void;
  
  // Selectors
  getLogLevel: () => 'debug' | 'info' | 'warn' | 'error' | 'silent';
  shouldShowPerformanceStats: () => boolean;
  getBatchSize: () => number;
  getDebounceDelay: () => number;
  isTokenBatchingEnabled: () => boolean;
  isDebouncedUpdatesEnabled: () => boolean;
}

// Auth slice state and actions
export interface AuthSlice extends BaseSlice {
  // State
  isAuthenticated: boolean;
  user: any | null;
  token: string | null;
  loading: boolean;
  error: string | null;
  
  // Actions
  login: (credentials: { username: string; password: string }) => Promise<void>;
  logout: () => void;
  setUser: (user: any) => void;
  setToken: (token: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  
  // Selectors
  getUser: () => any | null;
  getToken: () => string | null;
  isLoading: () => boolean;
  hasError: () => boolean;
}

// Root store interface combining all slices
export interface AppStore extends BaseSlice {
  // Store metadata
  _storeName: string;
  _version: number;
  
  // Slices
  chat: ChatSlice;
  context: ContextSlice;
  ui: UISlice;
  settings: SettingsSlice;
  auth: AuthSlice;
  
  // Root actions
  update: (updates: Partial<AppStore>) => void;
  batchUpdate: (updates: Partial<AppStore>[]) => void;
}

// Slice creator type
export type SliceCreator<T> = (set: any, get: any, api: any) => T;

// Helper type for creating slices
export type CreateSlice<T> = SliceCreator<T>;