import { create } from 'zustand';
import { persist, subscribeWithSelector, devtools } from 'zustand/middleware';
import { StoreMiddlewareConfig, PersistenceConfig } from './types';
import { createMiddlewareConfig, createPersistenceConfig } from './utilities';

export const DEFAULT_STORE_CONFIG: StoreMiddlewareConfig = {
  enableDevTools: process.env.NODE_ENV === 'development',
  enablePersistence: true,
  persistenceKey: 'app-store',
  persistenceWhitelist: ['ui', 'settings', 'auth'],
};

// Creates a configured Zustand store with middleware
export function createConfiguredStore<T extends object>(
  storeName: string,
  initialState: T,
  config: StoreMiddlewareConfig = DEFAULT_STORE_CONFIG
) {
  const middlewareConfig = createMiddlewareConfig(config);
  
  // Base store creator
  const storeCreator = (set: any, get: any, api: any) => ({
    ...initialState,
    // Store metadata
    _storeName: storeName,
    _version: 1,
    _initialized: false,
    
    // Initialize store
    initialize: () => {
      if (get()._initialized) return;
      set({ _initialized: true });
      console.log(`Store ${storeName} initialized`);
    },
    
    // Reset store to initial state
    reset: () => {
      set({ ...initialState, _initialized: true });
    },
    
    // Update store with partial state
    update: (updates: Partial<T>) => {
      set(updates);
    },
    
    // Batch updates
    batchUpdate: (updates: Partial<T>[]) => {
      const currentState = get();
      const newState = updates.reduce((state, update) => ({ ...state, ...update }), currentState);
      set(newState);
    },
  });

  // Apply middleware based on configuration
  let store = storeCreator;
  
  // Add subscription middleware
  store = subscribeWithSelector(store);
  
  // Add devtools in development
  if (middlewareConfig.enableDevTools) {
    store = devtools(store, { name: storeName });
  }
  
  // Add persistence if enabled
  if (middlewareConfig.enablePersistence) {
    const persistenceConfig: PersistenceConfig = {
      name: middlewareConfig.persistenceKey || storeName,
      partialize: (state: any) => {
        // Only persist whitelisted slices
        const persisted: any = {};
        if (middlewareConfig.persistenceWhitelist) {
          middlewareConfig.persistenceWhitelist.forEach(key => {
            if (state[key] !== undefined) {
              persisted[key] = state[key];
            }
          });
        }
        return persisted;
      },
      migrate: (persistedState: any, version: number) => {
        // Migration logic
        console.log(`Migrating store ${storeName} from version ${version}`);
        return persistedState;
      },
      version: 1,
    };
    
    store = persist(store, persistenceConfig);
  }

  return create(store);
}

// Store middleware for logging
export const createLoggingMiddleware = (storeName: string) => 
  (config: any) => 
    (set: any, get: any, api: any) => 
      config(
        (...args: any[]) => {
          const [partial, replace] = args;
          console.log(`[${storeName}] Store update:`, {
            partial,
            replace,
            previousState: get(),
            timestamp: new Date().toISOString(),
          });
          set(...args);
        },
        get,
        api
      );

// Store middleware for performance monitoring
export const createPerformanceMiddleware = (storeName: string) => 
  (config: any) => 
    (set: any, get: any, api: any) => {
      const perf = {
        updateCount: 0,
        lastUpdate: 0,
        averageUpdateTime: 0,
      };
      
      return config(
        (...args: any[]) => {
          const startTime = performance.now();
          set(...args);
          const endTime = performance.now();
          
          const updateTime = endTime - startTime;
          perf.updateCount++;
          perf.lastUpdate = Date.now();
          perf.averageUpdateTime = 
            (perf.averageUpdateTime * (perf.updateCount - 1) + updateTime) / perf.updateCount;
          
          if (perf.updateCount % 10 === 0) {
            console.log(`[${storeName}] Performance metrics:`, perf);
          }
        },
        get,
        api
      );
    };

// Store middleware for error handling
export const createErrorHandlingMiddleware = (storeName: string) => 
  (config: any) => 
    (set: any, get: any, api: any) => 
      config(
        (...args: any[]) => {
          try {
            set(...args);
          } catch (error) {
            console.error(`[${storeName}] Store update error:`, error);
            // Optionally dispatch error to error store
            throw error;
          }
        },
        get,
        api
      );

// Store middleware for validation
export const createValidationMiddleware = (storeName: string, validator: (state: any) => boolean) => 
  (config: any) => 
    (set: any, get: any, api: any) => 
      config(
        (...args: any[]) => {
          const [partial, replace] = args;
          const newState = replace ? partial : { ...get(), ...partial };
          
          if (!validator(newState)) {
            console.error(`[${storeName}] Store validation failed:`, newState);
            throw new Error(`Store validation failed for ${storeName}`);
          }
          
          set(...args);
        },
        get,
        api
      );

// Creates a store with all configured middleware
export function createFullFeaturedStore<T extends object>(
  storeName: string,
  initialState: T,
  config: StoreMiddlewareConfig = DEFAULT_STORE_CONFIG
) {
  const middlewareConfig = createMiddlewareConfig(config);
  
  // Build middleware chain
  const middlewares: any[] = [];
  
  // Add subscription middleware
  middlewares.push(subscribeWithSelector);
  
  // Add logging in development
  if (middlewareConfig.enableDevTools) {
    middlewares.push(createLoggingMiddleware(storeName));
  }
  
  // Add performance monitoring
  middlewares.push(createPerformanceMiddleware(storeName));
  
  // Add error handling
  middlewares.push(createErrorHandlingMiddleware(storeName));
  
  // Add devtools
  if (middlewareConfig.enableDevTools) {
    middlewares.push(devtools as any);
  }
  
  // Add persistence if enabled
  if (middlewareConfig.enablePersistence) {
    const persistenceConfig: PersistenceConfig = {
      name: middlewareConfig.persistenceKey || storeName,
      partialize: (state: any) => {
        const persisted: any = {};
        if (middlewareConfig.persistenceWhitelist) {
          middlewareConfig.persistenceWhitelist.forEach(key => {
            if (state[key] !== undefined) {
              persisted[key] = state[key];
            }
          });
        }
        return persisted;
      },
      version: 1,
    };
    
    middlewares.push((config: any) => persist(config, persistenceConfig));
  }
  
  // Apply middleware
  const storeCreator = middlewares.reduce(
    (creator, middleware) => middleware(creator),
    (set: any, get: any, api: any) => ({
      ...initialState,
      _storeName: storeName,
      _version: 1,
      _initialized: false,
      
      initialize: () => {
        if (get()._initialized) return;
        set({ _initialized: true });
      },
      
      reset: () => {
        set({ ...initialState, _initialized: true });
      },
      
      update: (updates: Partial<T>) => {
        set(updates);
      },
    })
  );
  
  return create(storeCreator);
}

// Store configuration for different environments
export const STORE_CONFIGS = {
  development: {
    enableDevTools: true,
    enablePersistence: true,
    enableLogging: true,
    enablePerformanceMonitoring: true,
  },
  production: {
    enableDevTools: false,
    enablePersistence: true,
    enableLogging: false,
    enablePerformanceMonitoring: false,
  },
  test: {
    enableDevTools: false,
    enablePersistence: false,
    enableLogging: false,
    enablePerformanceMonitoring: false,
  },
};

// Gets store configuration for current environment
export function getStoreConfig(): StoreMiddlewareConfig {
  const env = process.env.NODE_ENV || 'development';
  return {
    ...DEFAULT_STORE_CONFIG,
    ...STORE_CONFIGS[env as keyof typeof STORE_CONFIGS],
  };
}