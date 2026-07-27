export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export type LogCategory = 
  | 'websocket' 
  | 'ui' 
  | 'performance' 
  | 'error' 
  | 'general';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
}

class LoggingService {
  private static instance: LoggingService;
  private currentLevel: LogLevel;
  private enabledCategories: Set<LogCategory>;
  private logHistory: LogEntry[] = [];
  private readonly MAX_HISTORY = 1000;

  private constructor() {
    // Default to WARN in production, DEBUG in development
    this.currentLevel = process.env.NODE_ENV === 'production' 
      ? LogLevel.WARN 
      : LogLevel.DEBUG;
    
    // Enable all categories by default
    this.enabledCategories = new Set<LogCategory>([
      'websocket', 'ui', 'performance', 'error', 'general'
    ]);
    
    // Load user preferences from localStorage
    this.loadPreferences();
  }

  static getInstance(): LoggingService {
    if (!LoggingService.instance) {
      LoggingService.instance = new LoggingService();
    }
    return LoggingService.instance;
  }

  private loadPreferences(): void {
    try {
      const savedLevel = localStorage.getItem('logLevel');
      if (savedLevel) {
        this.currentLevel = parseInt(savedLevel, 10) as LogLevel;
      }

      const savedCategories = localStorage.getItem('logCategories');
      if (savedCategories) {
        const categories = JSON.parse(savedCategories) as LogCategory[];
        this.enabledCategories = new Set(categories);
      }
    } catch (error) {
      // Silently fail if localStorage is not available
    }
  }

  private savePreferences(): void {
    try {
      localStorage.setItem('logLevel', this.currentLevel.toString());
      localStorage.setItem('logCategories', JSON.stringify(Array.from(this.enabledCategories)));
    } catch (error) {
      // Silently fail if localStorage is not available
    }
  }

  setLevel(level: LogLevel): void {
    this.currentLevel = level;
    this.savePreferences();
  }

  getLevel(): LogLevel {
    return this.currentLevel;
  }

  enableCategory(category: LogCategory): void {
    this.enabledCategories.add(category);
    this.savePreferences();
  }

  disableCategory(category: LogCategory): void {
    this.enabledCategories.delete(category);
    this.savePreferences();
  }

  isEnabled(level: LogLevel, category: LogCategory): boolean {
    return level >= this.currentLevel && this.enabledCategories.has(category);
  }

  private addToHistory(entry: LogEntry): void {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.MAX_HISTORY) {
      this.logHistory = this.logHistory.slice(-this.MAX_HISTORY);
    }
  }

  debug(category: LogCategory, message: string, data?: any): void {
    if (this.isEnabled(LogLevel.DEBUG, category)) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: LogLevel.DEBUG,
        category,
        message,
        data
      };
      this.addToHistory(entry);
      console.debug(`[${category.toUpperCase()}:DEBUG] ${message}`, data);
    }
  }

  info(category: LogCategory, message: string, data?: any): void {
    if (this.isEnabled(LogLevel.INFO, category)) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        category,
        message,
        data
      };
      this.addToHistory(entry);
      console.info(`[${category.toUpperCase()}:INFO] ${message}`, data);
    }
  }

  warn(category: LogCategory, message: string, data?: any): void {
    if (this.isEnabled(LogLevel.WARN, category)) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: LogLevel.WARN,
        category,
        message,
        data
      };
      this.addToHistory(entry);
      console.warn(`[${category.toUpperCase()}:WARN] ${message}`, data);
    }
  }

  error(category: LogCategory, message: string, data?: any): void {
    if (this.isEnabled(LogLevel.ERROR, category)) {
      const entry: LogEntry = {
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        category,
        message,
        data
      };
      this.addToHistory(entry);
      console.error(`[${category.toUpperCase()}:ERROR] ${message}`, data);
    }
  }

  // Convenience methods for common categories

  websocket(message: string, data?: any): void {
    this.debug('websocket', message, data);
  }

  ui(message: string, data?: any): void {
    this.debug('ui', message, data);
  }

  performance(message: string, data?: any): void {
    this.info('performance', message, data);
  }

  // Get log history for debugging
  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  // Clear log history
  clearHistory(): void {
    this.logHistory = [];
  }

  // Get statistics about logging
  getStats(): {
    total: number;
    byLevel: Record<string, number>;
    byCategory: Record<string, number>;
  } {
    const stats = {
      total: this.logHistory.length,
      byLevel: {} as Record<string, number>,
      byCategory: {} as Record<string, number>
    };

    for (const entry of this.logHistory) {
      const levelKey = LogLevel[entry.level];
      stats.byLevel[levelKey] = (stats.byLevel[levelKey] || 0) + 1;
      stats.byCategory[entry.category] = (stats.byCategory[entry.category] || 0) + 1;
    }

    return stats;
  }
}

// Export singleton instance
export const logger = LoggingService.getInstance();

// Convenience exports
export const log = {
  debug: (category: LogCategory, message: string, data?: any) => 
    logger.debug(category, message, data),
  info: (category: LogCategory, message: string, data?: any) => 
    logger.info(category, message, data),
  warn: (category: LogCategory, message: string, data?: any) => 
    logger.warn(category, message, data),
  error: (category: LogCategory, message: string, data?: any) => 
    logger.error(category, message, data),
  websocket: (message: string, data?: any) => 
    logger.websocket(message, data),
  ui: (message: string, data?: any) => 
    logger.ui(message, data),
  performance: (message: string, data?: any) => 
    logger.performance(message, data)
};

// React hook for logging
export const useLogger = () => {
  return {
    debug: logger.debug.bind(logger),
    info: logger.info.bind(logger),
    warn: logger.warn.bind(logger),
    error: logger.error.bind(logger),
    reasoning: logger.reasoning.bind(logger),
    websocket: logger.websocket.bind(logger),
    ui: logger.ui.bind(logger),
    performance: logger.performance.bind(logger),
    getHistory: logger.getHistory.bind(logger),
    getStats: logger.getStats.bind(logger),
    clearHistory: logger.clearHistory.bind(logger),
    setLevel: logger.setLevel.bind(logger),
    getLevel: logger.getLevel.bind(logger),
    enableCategory: logger.enableCategory.bind(logger),
    disableCategory: logger.disableCategory.bind(logger)
  };
};