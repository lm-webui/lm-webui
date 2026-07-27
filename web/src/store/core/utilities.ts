import { StoreMiddlewareConfig, PersistenceConfig, StoreMigration, StoreMetrics } from './types';

// Creates a standardized store middleware configuration
export function createMiddlewareConfig(config: StoreMiddlewareConfig = {}) {
  const defaultConfig: StoreMiddlewareConfig = {
    enableDevTools: process.env.NODE_ENV === 'development',
    enablePersistence: true,
    persistenceKey: 'app-store',
    persistenceWhitelist: ['ui', 'settings', 'auth'],
  };

  return { ...defaultConfig, ...config };
}

// Creates a persistence configuration for Zustand
export function createPersistenceConfig(config: PersistenceConfig): PersistenceConfig {
  const defaultConfig: PersistenceConfig = {
    name: 'app-store',
    version: 1,
    migrate: (persistedState: any, version: number) => {
      // Default migration: just return the state
      return persistedState;
    },
  };

  return { ...defaultConfig, ...config };
}

export function createMigration(version: number, migrate: (state: any) => any): StoreMigration {
  return { version, migrate };
}

export class StorePerformanceMonitor {
  private metrics: StoreMetrics = {
    updateCount: 0,
    selectorCalls: {},
    lastUpdate: 0,
    averageUpdateTime: 0,
  };

  private timers: Map<string, number> = new Map();

  startTimer(operation: string): void {
    this.timers.set(operation, performance.now());
  }

  endTimer(operation: string): number {
    const startTime = this.timers.get(operation);
    if (!startTime) return 0;

    const duration = performance.now() - startTime;
    this.timers.delete(operation);

    // Update metrics
    this.metrics.updateCount++;
    this.metrics.lastUpdate = Date.now();
    this.metrics.averageUpdateTime = 
      (this.metrics.averageUpdateTime * (this.metrics.updateCount - 1) + duration) / this.metrics.updateCount;

    return duration;
  }

  recordSelectorCall(selectorName: string): void {
    this.metrics.selectorCalls[selectorName] = (this.metrics.selectorCalls[selectorName] || 0) + 1;
  }

  getMetrics(): StoreMetrics {
    return { ...this.metrics };
  }

  resetMetrics(): void {
    this.metrics = {
      updateCount: 0,
      selectorCalls: {},
      lastUpdate: 0,
      averageUpdateTime: 0,
    };
    this.timers.clear();
  }
}

// Creates optimized selectors with memoization
export function createSelector<T, R>(selector: (state: T) => R, dependencies?: string[]) {
  let lastResult: R | undefined;
  let lastDependencies: any[] | undefined;

  return (state: T): R => {
    if (dependencies) {
      const currentDependencies = dependencies.map(dep => {
        // Extract nested properties using dot notation
        return dep.split('.').reduce((obj, key) => obj?.[key], state as any);
      });

      // Check if dependencies changed
      if (lastDependencies !== undefined && currentDependencies.every((dep, i) => dep === lastDependencies![i])) {
        return lastResult!;
      }

      lastDependencies = currentDependencies;
    }

    lastResult = selector(state);
    return lastResult;
  };
}

// Creates a store slice with type safety
export function createSlice<T extends object>(
  name: string,
  initialState: T,
  reducers: Record<string, (state: T, ...args: any[]) => T>,
  selectors?: Record<string, (state: T) => any>
) {
  return {
    name,
    initialState,
    reducers,
    selectors,
  };
}

// Debounces store updates to prevent excessive re-renders
export function debounceUpdate<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

export function throttleUpdate<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export class StoreSubscriptionManager {
  private subscriptions: Map<string, () => void> = new Map();

  subscribe(id: string, unsubscribe: () => void): void {
    this.subscriptions.set(id, unsubscribe);
  }

  unsubscribe(id: string): void {
    const unsubscribe = this.subscriptions.get(id);
    if (unsubscribe) {
      unsubscribe();
      this.subscriptions.delete(id);
    }
  }

  unsubscribeAll(): void {
    this.subscriptions.forEach(unsubscribe => unsubscribe());
    this.subscriptions.clear();
  }

  hasSubscription(id: string): boolean {
    return this.subscriptions.has(id);
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

export function validateStoreState<T>(state: T, schema: Record<string, (value: any) => boolean>): boolean {
  for (const [key, validator] of Object.entries(schema)) {
    const value = (state as any)[key];
    if (!validator(value)) {
      console.warn(`Store validation failed for key: ${key}`, value);
      return false;
    }
  }
  return true;
}

export function createStateSanitizer<T extends Record<string, any>>(defaultState: T, sanitizers: Record<string, (value: any) => any>) {
  return (state: T): T => {
    const sanitized: Record<string, any> = { ...state };
    
    for (const [key, sanitizer] of Object.entries(sanitizers)) {
      if (key in sanitized) {
        sanitized[key] = sanitizer(sanitized[key]);
      }
    }
    
    return sanitized as T;
  };
}