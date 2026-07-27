import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LogLevel } from '@/utils/loggingService';

export type LoggingLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

export interface UISettings {
  
  // Performance settings
  enableTokenBatching: boolean;
  batchSize: number;
  enableDebouncedUpdates: boolean;
  debounceDelay: number;
  
  // Logging settings
  loggingLevel: LoggingLevel;
  enableWebSocketLogs: boolean;
  enableUILogs: boolean;
  
  // General UI settings
  showPerformanceStats: boolean;
  autoOptimizeBasedOnPerformance: boolean;
}

interface SettingsState extends UISettings {
  // Actions
  
  setEnableTokenBatching: (enabled: boolean) => void;
  setBatchSize: (size: number) => void;
  setEnableDebouncedUpdates: (enabled: boolean) => void;
  setDebounceDelay: (delay: number) => void;
  
  setLoggingLevel: (level: LoggingLevel) => void;
  setEnableWebSocketLogs: (enabled: boolean) => void;
  setEnableUILogs: (enabled: boolean) => void;
  
  setShowPerformanceStats: (show: boolean) => void;
  setAutoOptimizeBasedOnPerformance: (enabled: boolean) => void;
  
  resetToDefaults: () => void;
  applyPerformanceOptimizations: () => void;
  applyDebugSettings: () => void;
}

const defaultSettings: UISettings = {
  
  // Performance defaults
  enableTokenBatching: true,
  batchSize: 3,
  enableDebouncedUpdates: true,
  debounceDelay: 16, // ~60fps
  
  // Logging defaults (production-friendly)
  loggingLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  enableWebSocketLogs: process.env.NODE_ENV !== 'production',
  enableUILogs: false,
  
  // General UI defaults
  showPerformanceStats: false,
  autoOptimizeBasedOnPerformance: true,
};

const performanceOptimizedSettings: Partial<UISettings> = {
  enableTokenBatching: true,
  batchSize: 5,
  enableDebouncedUpdates: true,
  debounceDelay: 32, // ~30fps
  loggingLevel: 'error',
  enableWebSocketLogs: false,
  enableUILogs: false,
  showPerformanceStats: false,
  autoOptimizeBasedOnPerformance: true,
};

const debugSettings: Partial<UISettings> = {
  enableTokenBatching: false,
  batchSize: 1,
  enableDebouncedUpdates: false,
  debounceDelay: 0,
  loggingLevel: 'debug',
  enableWebSocketLogs: true,
  enableUILogs: true,
  showPerformanceStats: true,
  autoOptimizeBasedOnPerformance: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      
      
      setEnableTokenBatching: (enabled) => set({ enableTokenBatching: enabled }),
      setBatchSize: (size) => set({ batchSize: Math.max(1, Math.min(10, size)) }),
      setEnableDebouncedUpdates: (enabled) => set({ enableDebouncedUpdates: enabled }),
      setDebounceDelay: (delay) => set({ debounceDelay: Math.max(0, Math.min(100, delay)) }),
      
      setLoggingLevel: (level) => set({ loggingLevel: level }),
      setEnableWebSocketLogs: (enabled) => set({ enableWebSocketLogs: enabled }),
      setEnableUILogs: (enabled) => set({ enableUILogs: enabled }),
      
      setShowPerformanceStats: (show) => set({ showPerformanceStats: show }),
      setAutoOptimizeBasedOnPerformance: (enabled) => set({ autoOptimizeBasedOnPerformance: enabled }),
      
      resetToDefaults: () => set(defaultSettings),
      
      applyPerformanceOptimizations: () => {
        const current = get();
        set({
          ...current,
          ...performanceOptimizedSettings,
        });
      },
      
      applyDebugSettings: () => {
        const current = get();
        set({
          ...current,
          ...debugSettings,
        });
      },
    }),
    {
      name: 'ui-settings-storage',
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // Migration from version 0 to 1
          return {
            ...defaultSettings,
            ...persistedState,
          };
        }
        return persistedState as SettingsState;
      },
    }
  )
);

// Helper functions
export const getLogLevelFromSettings = (): LogLevel => {
  const settings = useSettingsStore.getState();
  switch (settings.loggingLevel) {
    case 'debug': return LogLevel.DEBUG;
    case 'info': return LogLevel.INFO;
    case 'warn': return LogLevel.WARN;
    case 'error': return LogLevel.ERROR;
    case 'none': return LogLevel.NONE;
    default: return LogLevel.WARN;
  }
};

export const shouldShowPerformanceStats = (): boolean => {
  return useSettingsStore.getState().showPerformanceStats;
};


export const getBatchSize = (): number => {
  return useSettingsStore.getState().batchSize;
};

export const getDebounceDelay = (): number => {
  return useSettingsStore.getState().debounceDelay;
};

export const isTokenBatchingEnabled = (): boolean => {
  return useSettingsStore.getState().enableTokenBatching;
};

export const isDebouncedUpdatesEnabled = (): boolean => {
  return useSettingsStore.getState().enableDebouncedUpdates;
};

// React hook for convenient access
export const useUISettings = () => {
  const settings = useSettingsStore();
  
  return {
    ...settings,
    // Computed properties
    shouldBatchTokens: settings.enableTokenBatching && settings.batchSize > 1,
    shouldDebounceUpdates: settings.enableDebouncedUpdates && settings.debounceDelay > 0,
    
    // Quick actions
    togglePerformanceMode: () => {
    },
    
    toggleDebugMode: () => {
    },
    
    toggleLogging: () => {
      const currentLevel = settings.loggingLevel;
      const nextLevel = currentLevel === 'debug' ? 'warn' : 'debug';
      settings.setLoggingLevel(nextLevel);
    },
  };
};