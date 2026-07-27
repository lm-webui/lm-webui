import { ChatMessage } from './Message';
import { ChatConversation, ConversationSummary } from './Conversation';

// Chat slice state
export interface ChatSliceState {
  // Active conversation state
  activeChatId: string | null;
  conversations: Record<string, ChatConversation>;
  
  // Loading states
  imageGenerationLoading: boolean;
  conversationCreationLoading: boolean;
  
  // Error handling
  lastError: Error | null;
  retryableOperations: Map<string, () => Promise<void>>;
  
  // Background processing
  processingImages: Set<string>;
  
}

// Context slice state (RAG/memory)
export interface ContextSliceState {
  activeContext: ContextData | null;
  contextLoading: boolean;
  memoryDeleting: boolean;
  lastError: Error | null;
}

export interface ContextData {
  summaries: ContextItem[];
  recentMessages: ContextItem[];
  fileChunks: ContextItem[];
  totalItems: number;
  hasContext: boolean;
}

export interface ContextItem {
  id: string;
  content: string;
  similarity?: number;
  metadata?: any;
  filename?: string;
  type?: string;
  role?: string;
  createdAt?: string;
}

// UI slice state
export interface UISliceState {
  // Theme & Appearance
  theme: 'dark' | 'light' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  colorScheme: 'default' | 'high-contrast';
  reduceMotion: boolean;
  animationEnabled: boolean;
  
  // Layout
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  chatLayout: 'single' | 'split' | 'wide';
  messageDensity: 'comfortable' | 'compact';
  
  // Chat Display
  showTimestamps: boolean;
  showAvatars: boolean;
  chatBubbleStyle: 'rounded' | 'square';
  codeBlockTheme: string;
  markdownRenderer: 'default' | 'enhanced';
  
  // Editor & Input
  editorMode: 'rich' | 'plain';
  autoComplete: boolean;
  spellCheck: boolean;
  tabSize: number;
  wordWrap: boolean;
  emojiShortcuts: boolean;
  
  // Notifications
  notificationSound: boolean;
  notificationVolume: number;
  desktopNotifications: boolean;
  typingIndicator: boolean;
  readReceipts: boolean;
  
  // Accessibility
  screenReaderOptimized: boolean;
  keyboardShortcuts: Record<string, string>;
  focusMode: boolean;
  highlightCurrentLine: boolean;
}

// Settings slice state
export interface SettingsSliceState {
  
  // Performance settings
  enableTokenBatching: boolean;
  batchSize: number;
  enableDebouncedUpdates: boolean;
  debounceDelay: number;
  
  // Logging settings
  loggingLevel: 'debug' | 'info' | 'warn' | 'error' | 'none';
  enableWebSocketLogs: boolean;
  enableUILogs: boolean;
  
  // General UI settings
  showPerformanceStats: boolean;
  autoOptimizeBasedOnPerformance: boolean;
}

// Root store state
export interface AppStoreState {
  chat: ChatSliceState;
  context: ContextSliceState;
  ui: UISliceState;
  settings: SettingsSliceState;
}

// Store action types
export type ChatActions = {
  setActiveChat: (chatId: string) => void;
  createNewChat: () => Promise<string>;
  addMessage: (chatId: string, message: ChatMessage) => Promise<string>;
  updateConversationTitle: (chatId: string, title: string) => Promise<void>;
  updateConversation: (chatId: string, updates: Partial<ChatConversation>) => void;
  streamMessageChunk: (chatId: string, messageId: string, chunk: string) => void;
  deleteConversation: (chatId: string) => Promise<void>;
  ensureConversation: () => Promise<string>;
  // ... other chat actions
};



export type ContextActions = {
  fetchActiveContext: (conversationId: string) => Promise<void>;
  forgetMemory: (conversationId: string, memoryId: string) => Promise<void>;
  clearContext: () => void;
  // ... other context actions
};

export type UIActions = {
  setTheme: (theme: UISliceState['theme']) => void;
  setFontSize: (fontSize: UISliceState['fontSize']) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: number) => void;
  // ... other UI actions
};

export type SettingsActions = {
  setEnableTokenBatching: (enabled: boolean) => void;
  setBatchSize: (size: number) => void;
  setLoggingLevel: (level: SettingsSliceState['loggingLevel']) => void;
  resetToDefaults: () => void;
  // ... other settings actions
};

// Combined store with all slices
export type AppStore = AppStoreState & ChatActions & ContextActions & UIActions & SettingsActions;

// Store selector utilities
export type StoreSelector<T> = (state: AppStore) => T;

// Default state values
export const defaultChatState: ChatSliceState = {
  activeChatId: null,
  conversations: {},
  imageGenerationLoading: false,
  conversationCreationLoading: false,
  lastError: null,
  retryableOperations: new Map(),
  processingImages: new Set(),
};

export const defaultContextState: ContextSliceState = {
  activeContext: null,
  contextLoading: false,
  memoryDeleting: false,
  lastError: null,
};

export const defaultUIState: UISliceState = {
  theme: 'system',
  fontSize: 'medium',
  colorScheme: 'default',
  reduceMotion: false,
  animationEnabled: true,
  sidebarCollapsed: false,
  sidebarWidth: 240,
  chatLayout: 'single',
  messageDensity: 'comfortable',
  showTimestamps: true,
  showAvatars: true,
  chatBubbleStyle: 'rounded',
  codeBlockTheme: 'github-dark',
  markdownRenderer: 'default',
  editorMode: 'rich',
  autoComplete: true,
  spellCheck: true,
  tabSize: 2,
  wordWrap: true,
  emojiShortcuts: true,
  notificationSound: true,
  notificationVolume: 0.7,
  desktopNotifications: false,
  typingIndicator: true,
  readReceipts: false,
  screenReaderOptimized: false,
  keyboardShortcuts: {},
  focusMode: false,
  highlightCurrentLine: true,
};

export const defaultSettingsState: SettingsSliceState = {
  enableTokenBatching: true,
  batchSize: 3,
  enableDebouncedUpdates: true,
  debounceDelay: 16,
  loggingLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  enableWebSocketLogs: process.env.NODE_ENV !== 'production',
  enableUILogs: false,
  showPerformanceStats: false,
  autoOptimizeBasedOnPerformance: true,
};

export const defaultAppStoreState: AppStoreState = {
  chat: defaultChatState,
  context: defaultContextState,
  ui: defaultUIState,
  settings: defaultSettingsState,
};