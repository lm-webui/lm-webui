// ============================================================================
// Types and Interfaces
// ============================================================================

/**
 * Chat Request Interface (matches api.ts ChatRequest)
 */
export interface ChatRequest {
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

/**
 * SSE Event Types
 */
export type SSEEventType = 
  | 'chunk'      // Content chunk
  | 'status'     // Status update
  | 'error'      // Error event
  | 'complete'   // Stream complete
  | 'metadata';  // Metadata event

/**
 * SSE Event Interface
 */
export interface SSEEvent {
  type: SSEEventType;
  data: any;
  id?: string;
  timestamp?: string;
}

/**
 * Streaming Options
 */
export interface StreamingOptions {
  onChunk?: (chunk: string) => void;
  onStatus?: (status: string) => void;
  onError?: (error: StreamError) => void;
  signal?: AbortSignal;
  timeout?: number; // ms
  maxRetries?: number;
}

/**
 * Error Classification
 */
export enum StreamErrorType {
  NETWORK = 'NETWORK',      // Connection failures
  TIMEOUT = 'TIMEOUT',      // Request timeout
  SERVER = 'SERVER',        // 5xx errors
  PARSE = 'PARSE',          // Malformed SSE
  CANCELLED = 'CANCELLED',  // User cancellation
  MAX_RETRIES = 'MAX_RETRIES_EXCEEDED'
}

/**
 * Stream Error Class
 */
export class StreamError extends Error {
  constructor(
    message: string,
    public type: StreamErrorType,
    public recoverable: boolean = true,
    public retryAfter?: number
  ) {
    super(message);
    this.name = 'StreamError';
  }
}

// ============================================================================
// SSEStreamReader Class
// ============================================================================

/**
 * Core SSE Parser with format detection and error recovery
 */
export class SSEStreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = '';
  private retryCount = 0;
  private maxRetries: number;
  private timeout: number;
  private lastEventTime = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isCancelled = false;
  
  constructor(
    private response: Response,
    private options: StreamingOptions = {}
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.timeout = options.timeout ?? 30000;
  }
  
  /**
   * Read events as an async generator
   */
  async *readEvents(): AsyncGenerator<SSEEvent> {
    try {
      this.reader = this.response.body?.getReader() ?? null;
      
      if (!this.reader) {
        throw new StreamError('Response body is not readable', StreamErrorType.SERVER, false);
      }
      
      this.startHeartbeat();
      
      while (true) {
        if (this.isCancelled) {
          throw new StreamError('Stream cancelled by user', StreamErrorType.CANCELLED, false);
        }
        
        const { done, value } = await this.reader.read();
        
        if (done) {
          yield { type: 'complete', data: { message: 'Stream completed' } };
          break;
        }
        
        this.lastEventTime = Date.now();
        const textChunk = this.decoder.decode(value, { stream: true });
        this.buffer += textChunk;
        
        const events = this.parseBuffer();
        for (const event of events) {
          yield event;
        }
      }
    } catch (error) {
      if (error instanceof StreamError) {
        throw error;
      }
      throw new StreamError(
        error instanceof Error ? error.message : 'Unknown stream error',
        StreamErrorType.NETWORK,
        this.retryCount < this.maxRetries
      );
    } finally {
      this.cleanup();
    }
  }
  
  /**
   * Read stream to completion and return concatenated response
   */
  async readToCompletion(): Promise<string> {
    let fullResponse = '';
    
    for await (const event of this.readEvents()) {
      switch (event.type) {
        case 'chunk':
          const chunkContent = event.data.content || event.data;
          fullResponse += chunkContent;
          this.options.onChunk?.(chunkContent);
          break;
        case 'status':
          this.options.onStatus?.(event.data.message || event.data);
          break;
        case 'error':
          throw new StreamError(event.data.message || 'Stream error', StreamErrorType.SERVER, false);
        case 'complete':
          // Stream completed successfully
          break;
      }
    }
    
    return fullResponse;
  }
  
  /**
   * Parse buffer into SSE events
   */
  private parseBuffer(): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = this.buffer.split('\n\n');
    
    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      const event = this.parseSSELine(trimmed);
      if (event) {
        events.push(event);
      }
    }
    
    return events;
  }
  
  /**
   * Parse a single SSE line
   */
  private parseSSELine(line: string): SSEEvent | null {
    // Handle standard SSE format: data: {json}
    if (line.startsWith('data: ')) {
      const jsonStr = line.slice(6).trim();
      try {
        const data = JSON.parse(jsonStr);
        return {
          type: data.type || 'chunk',
          data: data.data || data,
          id: data.id,
          timestamp: data.timestamp || new Date().toISOString()
        };
      } catch {
        // Fallback: raw text (legacy format)
        return {
          type: 'chunk',
          data: { content: jsonStr },
          timestamp: new Date().toISOString()
        };
      }
    }
    
    // Handle legacy format or raw text
    return {
      type: 'chunk',
      data: { content: line },
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const timeSinceLastEvent = Date.now() - this.lastEventTime;
      if (timeSinceLastEvent > this.timeout) {
        this.options.onError?.(
          new StreamError('Stream heartbeat timeout', StreamErrorType.TIMEOUT, true)
        );
      }
    }, 5000);
  }
  
  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.reader) {
      this.reader.releaseLock();
      this.reader = null;
    }
  }
  
  /**
   * Cancel the stream
   */
  cancel(): void {
    this.isCancelled = true;
    this.cleanup();
    this.options.onError?.(
      new StreamError('Stream cancelled by user', StreamErrorType.CANCELLED, false)
    );
  }
  
  /**
   * Get retry count
   */
  getRetryCount(): number {
    return this.retryCount;
  }
  
  /**
   * Check if stream is active
   */
  isActive(): boolean {
    return !this.isCancelled && this.reader !== null;
  }
}

// ============================================================================
// SSEManager Class
// ============================================================================

/**
 * Connection Manager for SSE streams
 */
export class SSEManager {
  private static activeStreams = new Map<string, SSEStreamReader>();
  
  /**
   * Create a new SSE stream
   */
  static async createStream(
    url: string,
    options: RequestInit,
    callbacks: StreamingOptions
  ): Promise<SSEStreamReader> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), callbacks.timeout || 30000);
    
    if (callbacks.signal) {
      callbacks.signal.addEventListener('abort', () => controller.abort());
    }
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new StreamError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500 ? StreamErrorType.SERVER : StreamErrorType.NETWORK,
          response.status !== 401 && response.status !== 403
        );
      }
      
      const streamReader = new SSEStreamReader(response, callbacks);
      const streamId = `${url}-${Date.now()}`;
      this.activeStreams.set(streamId, streamReader);
      
      // Auto-cleanup on completion
      streamReader.readToCompletion()
        .catch(() => {}) // Ignore errors during cleanup
        .finally(() => this.activeStreams.delete(streamId));
      
      return streamReader;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new StreamError('Request timeout', StreamErrorType.TIMEOUT, true);
      }
      
      if (error instanceof StreamError) {
        throw error;
      }
      
      throw new StreamError(
        error instanceof Error ? error.message : 'Unknown error',
        StreamErrorType.NETWORK,
        true
      );
    }
  }
  
  /**
   * Cancel all active streams
   */
  static cancelAll(): void {
    for (const stream of this.activeStreams.values()) {
      stream.cancel();
    }
    this.activeStreams.clear();
  }
  
  /**
   * Get number of active streams
   */
  static getActiveStreamCount(): number {
    return this.activeStreams.size;
  }
  
  /**
   * Get active stream IDs
   */
  static getActiveStreamIds(): string[] {
    return Array.from(this.activeStreams.keys());
  }
}

// ============================================================================
// SSEService Facade
// ============================================================================

/**
 * High-level SSE Service for chat streaming
 */
export class SSEService {
  private static API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
  
  /**
   * Stream chat with a model using Server-Sent Events
   */
  static async streamChat(
    request: ChatRequest,
    callbacks: StreamingOptions
  ): Promise<string> {
    const endpoint = '/api/chat';
    
    try {
      const streamReader = await SSEManager.createStream(
        `${this.API_BASE_URL}${endpoint}`,
        {
          method: 'POST',
          body: JSON.stringify({
            ...request,
            // Ensure streaming is enabled for raw/deep thinking modes
            show_raw_response: request.show_raw_response || request.deep_thinking_mode,
          }),
        },
        callbacks
      );
      
      return await streamReader.readToCompletion();
    } catch (error) {
      if (error instanceof StreamError && error.recoverable && error.type !== StreamErrorType.CANCELLED) {
        // Attempt one retry for recoverable errors
        console.warn('Stream error, attempting retry:', error.message);
        
        try {
          const streamReader = await SSEManager.createStream(
            `${this.API_BASE_URL}${endpoint}`,
            {
              method: 'POST',
              body: JSON.stringify(request),
            },
            {
              ...callbacks,
              maxRetries: 0, // Don't retry again
            }
          );
          
          return await streamReader.readToCompletion();
        } catch (retryError) {
          // If retry fails, throw the original error
          throw error;
        }
      }
      
      throw error;
    }
  }
  
  /**
   * Create a generic SSE stream
   */
  static createStream(
    url: string,
    options: RequestInit,
    callbacks: StreamingOptions
  ): Promise<SSEStreamReader> {
    return SSEManager.createStream(url, options, callbacks);
  }
  
  /**
   * Check if a response is a streaming response
   */
  static isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get('content-type');
    return contentType?.includes('text/event-stream') || 
           contentType?.includes('application/x-ndjson') ||
           response.url.includes('/stream');
  }
  
  /**
   * Cancel all active streams
   */
  static cancelAllStreams(): void {
    SSEManager.cancelAll();
  }
  
  /**
   * Get number of active streams
   */
  static getActiveStreamCount(): number {
    return SSEManager.getActiveStreamCount();
  }
  
  /**
   * Get active stream IDs
   */
  static getActiveStreamIds(): string[] {
    return SSEManager.getActiveStreamIds();
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Parse a single SSE line
 */
export function parseSSELine(line: string): SSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  
  if (trimmed.startsWith('data: ')) {
    const jsonStr = trimmed.slice(6);
    try {
      const data = JSON.parse(jsonStr);
      return {
        type: data.type || 'chunk',
        data: data.data || data,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        type: 'chunk',
        data: { content: jsonStr },
        timestamp: new Date().toISOString(),
      };
    }
  }
  
  return {
    type: 'chunk',
    data: { content: trimmed },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Create SSE event string for testing
 */
export function createSSEEvent(event: SSEEvent): string {
  return `data: ${JSON.stringify({
    type: event.type,
    data: event.data,
    id: event.id,
    timestamp: event.timestamp,
  })}\n\n`;
}

/**
 * Mock SSE stream for testing
 */
export function createMockSSEStream(events: SSEEvent[]): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(new TextEncoder().encode(createSSEEvent(event)));
      }
      controller.close();
    },
  });
}

/**
 * Check if URL is likely a streaming endpoint
 */
export function isStreamingEndpoint(url: string): boolean {
  const streamingPatterns = [
    '/chat',
    '/stream',
    '/events',
    '/updates',
    '/notifications'
  ];
  
  return streamingPatterns.some(pattern => url.includes(pattern));
}

// ============================================================================
// Default Export
// ============================================================================

export default SSEService;