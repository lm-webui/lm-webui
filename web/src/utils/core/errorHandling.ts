// Error codes for different types of errors
export enum ErrorCode {
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  
  // API errors
  API_ERROR = 'API_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  
  // Application errors
  UNEXPECTED_ERROR = 'UNEXPECTED_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  STATE_ERROR = 'STATE_ERROR',
  
  // User errors
  USER_INPUT_ERROR = 'USER_INPUT_ERROR',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  
  // System errors
  STORAGE_ERROR = 'STORAGE_ERROR',
  MEMORY_ERROR = 'MEMORY_ERROR',
  PERFORMANCE_ERROR = 'PERFORMANCE_ERROR',
}

// Custom application error class
export class AppError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public details?: any,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'AppError';
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
    
    // Preserve original error stack if available
    if (originalError && originalError.stack) {
      this.stack = `${this.stack}\nCaused by: ${originalError.stack}`;
    }
  }
  
  // Factory methods for common error types
  static network(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.NETWORK_ERROR, details, originalError);
  }
  
  static api(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.API_ERROR, details, originalError);
  }
  
  static auth(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.AUTHENTICATION_ERROR, details, originalError);
  }
  
  static validation(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.VALIDATION_ERROR, details, originalError);
  }
  
  static unexpected(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.UNEXPECTED_ERROR, details, originalError);
  }
  
  static userInput(message: string, originalError?: Error, details?: any): AppError {
    return new AppError(message, ErrorCode.USER_INPUT_ERROR, details, originalError);
  }
  
  // Check if an error is an AppError
  static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }
}

// Error handler function
export function handleError(error: unknown, context: string): AppError {
  // If it's already an AppError, just log and return it
  if (AppError.isAppError(error)) {
    console.error(`[${context}] ${error.code}: ${error.message}`, {
      details: error.details,
      stack: error.stack,
    });
    return error;
  }
  
  // If it's a standard Error, convert to AppError
  if (error instanceof Error) {
    console.error(`[${context}] UNEXPECTED_ERROR: ${error.message}`, {
      stack: error.stack,
    });
    return AppError.unexpected(error.message, error);
  }
  
  // If it's a string, create an AppError from it
  if (typeof error === 'string') {
    console.error(`[${context}] UNEXPECTED_ERROR: ${error}`);
    return AppError.unexpected(error);
  }
  
  // For any other type, create a generic AppError
  console.error(`[${context}] UNEXPECTED_ERROR:`, error);
  return AppError.unexpected('An unexpected error occurred', undefined, error);
}

// Safe execution wrapper
export async function safeExecute<T>(
  operation: () => Promise<T>,
  context: string,
  fallback?: T
): Promise<{ result?: T; error?: AppError }> {
  try {
    const result = await operation();
    return { result };
  } catch (error) {
    const appError = handleError(error, context);
    
    // If fallback is provided, return it
    if (fallback !== undefined) {
      console.warn(`[${context}] Using fallback value due to error:`, appError.message);
      return { result: fallback, error: appError };
    }
    
    return { error: appError };
  }
}

// Retry with exponential backoff
export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  context: string,
  maxRetries: number = 3,
  initialDelay: number = 1000
): Promise<T> {
  let lastError: AppError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = handleError(error, `${context} (attempt ${attempt + 1}/${maxRetries + 1})`);
      
      // Don't retry on certain error types
      if (lastError.code === ErrorCode.VALIDATION_ERROR || 
          lastError.code === ErrorCode.USER_INPUT_ERROR ||
          lastError.code === ErrorCode.AUTHENTICATION_ERROR) {
        throw lastError;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff and jitter
      const delay = initialDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[${context}] Retrying in ${Math.round(delay)}ms...`, lastError.message);
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  // This should never be reached, but TypeScript needs it
  throw lastError!;
}

// Error logging utility
export function logError(error: AppError, additionalContext?: Record<string, any>) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    code: error.code,
    message: error.message,
    details: error.details,
    originalError: error.originalError?.message,
    stack: error.stack,
    additionalContext,
  };
  
  // Log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('Application Error:', logEntry);
  }
  
  // TODO: In production, send to error tracking service (Sentry, etc.)
  // if (process.env.NODE_ENV === 'production') {
  //   // Send to error tracking service
  // }
  
  return logEntry;
}

// Error recovery strategies
export const ErrorRecovery = {
  // Retry the operation
  retry: async <T>(operation: () => Promise<T>, context: string): Promise<T> => {
    return retryWithBackoff(operation, context);
  },
  
  // Use fallback value
  fallback: <T>(value: T): T => value,
  
  // Clear problematic state
  clearState: (store: any, stateKey: string) => {
    console.warn(`Clearing state for recovery: ${stateKey}`);
    // Implementation depends on store structure
  },
  
  // Refresh application state
  refresh: () => {
    console.warn('Refreshing application state for recovery');
    window.location.reload();
  },
};