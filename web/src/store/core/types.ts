import { ChatMessage } from '@/types/core/Message';
import { ChatConversation } from '@/types/core/Conversation';

// Re-export core types for convenience
export type { ChatMessage, ChatConversation };

// Store middleware configuration
export interface StoreMiddlewareConfig {
  enableDevTools?: boolean;
  enablePersistence?: boolean;
  persistenceKey?: string;
  persistenceWhitelist?: string[];
}

// Store slice creator type
export type StoreSlice<T> = (set: any, get: any, api: any) => T;

// Root store state interface
export interface AppStoreState {
  // Will be populated by slices
  _version: number;
  _initialized: boolean;
}

// Store initialization options
export interface StoreInitOptions {
  middleware?: StoreMiddlewareConfig;
  initialState?: Partial<AppStoreState>;
}

// Store utility types
export type StoreSelector<T, R> = (state: T) => R;
export type StoreAction<T, P = void> = P extends void 
  ? () => void 
  : (payload: P) => void;

// Store middleware type
export type StoreMiddleware = (config: any) => (set: any, get: any, api: any) => any;

// Persistence configuration
export interface PersistenceConfig {
  name: string;
  storage?: any;
  partialize?: (state: any) => any;
  migrate?: (persistedState: any, version: number) => any;
  version?: number;
}

// Store migration utilities
export interface StoreMigration {
  version: number;
  migrate: (state: any) => any;
}

// Store performance metrics
export interface StoreMetrics {
  updateCount: number;
  selectorCalls: Record<string, number>;
  lastUpdate: number;
  averageUpdateTime: number;
}

// Store error handling
export interface StoreError {
  id: string;
  message: string;
  code: string;
  timestamp: number;
  stack?: string;
  metadata?: Record<string, any>;
}

// Store subscription
export interface StoreSubscription {
  id: string;
  selector: string;
  callback: (state: any) => void;
  unsubscribe: () => void;
}