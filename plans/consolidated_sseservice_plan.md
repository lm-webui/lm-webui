# Consolidated SSEService.ts Implementation Plan

## Overview

Create a single `SSEService.ts` file (400-500 lines) that contains all streaming logic, replacing the temporary workaround in [`api.ts`](frontend/src/utils/api.ts:179).

## File Location

```
frontend/src/services/SSEService.ts
```

## File Structure

### 1. Types and Interfaces (~50 lines)

```typescript
// Event types for SSE
export type SSEEventType =
  | "chunk" // Content chunk
  | "status" // Status update
  | "error" // Error event
  | "complete" // Stream complete
  | "metadata"; // Metadata event

export interface SSEEvent {
  type: SSEEventType;
  data: any;
  id?: string;
  timestamp?: string;
}

// Streaming options
export interface StreamingOptions {
  onChunk?: (chunk: string) => void;
  onStatus?: (status: string) => void;
  onError?: (error: StreamError) => void;
  signal?: AbortSignal;
  timeout?: number; // ms
  maxRetries?: number;
}

// Error classification
export enum StreamErrorType {
  NETWORK = "NETWORK",
  TIMEOUT = "TIMEOUT",
  SERVER = "SERVER",
  PARSE = "PARSE",
  CANCELLED = "CANCELLED",
  MAX_RETRIES = "MAX_RETRIES_EXCEEDED",
}

export class StreamError extends Error {
  constructor(
    message: string,
    public type: StreamErrorType,
    public recoverable: boolean = true,
    public retryAfter?: number,
  ) {
    super(message);
    this.name = "StreamError";
  }
}
```

### 2. SSEStreamReader Class (~200 lines)

```typescript
export class SSEStreamReader {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private decoder = new TextDecoder();
  private buffer = "";
  private retryCount = 0;
  private maxRetries: number;
  private timeout: number;
  private lastEventTime = Date.now();
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    private response: Response,
    private options: StreamingOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.timeout = options.timeout ?? 30000;
  }

  async *readEvents(): AsyncGenerator<SSEEvent> {
    try {
      this.reader = this.response.body?.getReader() ?? null;

      if (!this.reader) {
        throw new StreamError(
          "Response body is not readable",
          StreamErrorType.SERVER,
          false,
        );
      }

      this.startHeartbeat();

      while (true) {
        const { done, value } = await this.reader.read();

        if (done) {
          yield { type: "complete", data: { message: "Stream completed" } };
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
        error instanceof Error ? error.message : "Unknown stream error",
        StreamErrorType.NETWORK,
        this.retryCount < this.maxRetries,
      );
    } finally {
      this.cleanup();
    }
  }

  async readToCompletion(): Promise<string> {
    let fullResponse = "";

    for await (const event of this.readEvents()) {
      switch (event.type) {
        case "chunk":
          fullResponse += event.data.content || event.data;
          this.options.onChunk?.(event.data.content || event.data);
          break;
        case "status":
          this.options.onStatus?.(event.data.message || event.data);
          break;
        case "error":
          throw new StreamError(
            event.data.message || "Stream error",
            StreamErrorType.SERVER,
            false,
          );
      }
    }

    return fullResponse;
  }

  private parseBuffer(): SSEEvent[] {
    const events: SSEEvent[] = [];
    const lines = this.buffer.split("\n\n");

    // Keep last incomplete line in buffer
    this.buffer = lines.pop() || "";

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

  private parseSSELine(line: string): SSEEvent | null {
    // Handle standard SSE format: data: {json}
    if (line.startsWith("data: ")) {
      const jsonStr = line.slice(6).trim();
      try {
        const data = JSON.parse(jsonStr);
        return {
          type: data.type || "chunk",
          data: data.data || data,
          id: data.id,
          timestamp: data.timestamp || new Date().toISOString(),
        };
      } catch {
        // Fallback: raw text
        return {
          type: "chunk",
          data: { content: jsonStr },
          timestamp: new Date().toISOString(),
        };
      }
    }

    // Handle legacy format or raw text
    return {
      type: "chunk",
      data: { content: line },
      timestamp: new Date().toISOString(),
    };
  }

  private startHeartbeat(): void {
    const heartbeatCheck = () => {
      const timeSinceLastEvent = Date.now() - this.lastEventTime;
      if (timeSinceLastEvent > this.timeout) {
        this.options.onError?.(
          new StreamError(
            "Stream heartbeat timeout",
            StreamErrorType.TIMEOUT,
            true,
          ),
        );
      }
    };

    this.heartbeatInterval = setInterval(heartbeatCheck, 5000);
  }

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

  cancel(): void {
    this.cleanup();
    this.options.onError?.(
      new StreamError(
        "Stream cancelled by user",
        StreamErrorType.CANCELLED,
        false,
      ),
    );
  }
}
```

### 3. SSEManager Class (~100 lines)

```typescript
export class SSEManager {
  private static activeStreams = new Map<string, SSEStreamReader>();

  static async createStream(
    url: string,
    options: RequestInit,
    callbacks: StreamingOptions,
  ): Promise<SSEStreamReader> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      callbacks.timeout || 30000,
    );

    if (callbacks.signal) {
      callbacks.signal.addEventListener("abort", () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new StreamError(
          `HTTP ${response.status}: ${response.statusText}`,
          response.status >= 500
            ? StreamErrorType.SERVER
            : StreamErrorType.NETWORK,
          response.status !== 401 && response.status !== 403,
        );
      }

      const streamReader = new SSEStreamReader(response, callbacks);
      const streamId = `${url}-${Date.now()}`;
      this.activeStreams.set(streamId, streamReader);

      // Auto-cleanup on completion
      streamReader
        .readToCompletion()
        .finally(() => this.activeStreams.delete(streamId));

      return streamReader;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof DOMException && error.name === "AbortError") {
        throw new StreamError("Request timeout", StreamErrorType.TIMEOUT, true);
      }

      throw error;
    }
  }

  static cancelAll(): void {
    for (const stream of this.activeStreams.values()) {
      stream.cancel();
    }
    this.activeStreams.clear();
  }

  static getActiveStreamCount(): number {
    return this.activeStreams.size;
  }
}
```

### 4. SSEService Facade (~100 lines)

```typescript
export class SSEService {
  /**
   * Stream chat with a model using Server-Sent Events
   */
  static async streamChat(
    request: any, // ChatRequest from api.ts
    callbacks: StreamingOptions,
  ): Promise<string> {
    const API_BASE_URL = import.meta.env.VITE_BACKEND_URL;
    const endpoint = "/api/chat";

    try {
      const streamReader = await SSEManager.createStream(
        `${API_BASE_URL}${endpoint}`,
        {
          method: "POST",
          body: JSON.stringify({
            ...request,
            // Ensure streaming is enabled
            show_raw_response:
              request.show_raw_response || request.deep_thinking_mode,
          }),
        },
        callbacks,
      );

      return await streamReader.readToCompletion();
    } catch (error) {
      if (error instanceof StreamError && error.recoverable) {
        // Attempt one retry for recoverable errors
        console.warn("Stream error, attempting retry:", error.message);

        const streamReader = await SSEManager.createStream(
          `${API_BASE_URL}${endpoint}`,
          {
            method: "POST",
            body: JSON.stringify(request),
          },
          {
            ...callbacks,
            maxRetries: 0, // Don't retry again
          },
        );

        return await streamReader.readToCompletion();
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
    callbacks: StreamingOptions,
  ): Promise<SSEStreamReader> {
    return SSEManager.createStream(url, options, callbacks);
  }

  /**
   * Check if a response is a streaming response
   */
  static isStreamingResponse(response: Response): boolean {
    const contentType = response.headers.get("content-type");
    return (
      contentType?.includes("text/event-stream") ||
      contentType?.includes("application/x-ndjson")
    );
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
}
```

### 5. Utility Functions (~50 lines)

```typescript
/**
 * Parse a single SSE line
 */
export function parseSSELine(line: string): SSEEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("data: ")) {
    const jsonStr = trimmed.slice(6);
    try {
      const data = JSON.parse(jsonStr);
      return {
        type: data.type || "chunk",
        data: data.data || data,
        timestamp: new Date().toISOString(),
      };
    } catch {
      return {
        type: "chunk",
        data: { content: jsonStr },
        timestamp: new Date().toISOString(),
      };
    }
  }

  return {
    type: "chunk",
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
```

### 6. Exports

```typescript
// Export everything
export { SSEStreamReader, SSEManager, StreamError, StreamErrorType };
export { parseSSELine, createSSEEvent, createMockSSEStream };
export default SSEService;
```

## Integration with Existing Code

### 1. Update `api.ts`:

```typescript
// Import the new service
import { SSEService } from "@/services/SSEService";

// In _chatWithModel function, replace lines 175-254 with:
if (shouldStream && stream) {
  return SSEService.streamChat(requestWithKey, {
    onChunk,
    onStatus,
    signal: req.signal,
    timeout: 30000,
    maxRetries: 2,
  });
}
```

### 2. Remove Old Code:

Delete the 80+ lines of manual SSE parsing in `_chatWithModel` (lines 175-254).

### 3. Update Comment:

Replace the temporary workaround comment (lines 179-183) with:

```typescript
// Streaming is handled by SSEService which provides production-ready
// SSE parsing with error recovery and reconnection support.
// Backend should send standard SSE format: data: {json}\n\n
```

## Testing Strategy

### 1. Unit Tests:

```typescript
describe("SSEService", () => {
  it("should parse standard SSE format", () => {
    const event = parseSSELine(
      'data: {"type":"chunk","data":{"content":"Hello"}}',
    );
    expect(event?.type).toBe("chunk");
    expect(event?.data.content).toBe("Hello");
  });

  it("should handle legacy format", () => {
    const event = parseSSELine("data: Hello World");
    expect(event?.type).toBe("chunk");
    expect(event?.data.content).toBe("Hello World");
  });

  it("should stream chat successfully", async () => {
    const response = await SSEService.streamChat(
      { message: "Hello", provider: "openai", model: "gpt-3.5-turbo" },
      { onChunk: jest.fn(), onStatus: jest.fn() },
    );
    expect(typeof response).toBe("string");
  });
});
```

### 2. Integration Tests:

- Test with real backend streaming
- Test error recovery scenarios
- Test cancellation behavior

### 3. Performance Tests:

- Measure parsing speed
- Check memory usage for long streams
- Verify bundle size impact

## Implementation Steps

### Day 1: Create SSEService.ts

1. Create the file with all types and interfaces
2. Implement `SSEStreamReader` class
3. Implement `SSEManager` class
4. Implement `SSEService` facade
5. Add utility functions

### Day 2: Integrate with api.ts

1. Update imports in `api.ts`
2. Replace manual parsing with `SSEService.streamChat`
3. Remove old parsing code
4. Update comments

### Day 3: Testing

1. Write unit tests
2. Test with current backend
3. Verify backward compatibility
4. Performance testing

### Day 4: Deployment

1. Canary deployment (10% users)
2. Monitor error rates
3. Full rollout if successful

## Success Criteria

1. **Backward Compatibility**: Existing `chatWithModelStream` calls work unchanged
2. **Error Recovery**: Automatic retry for network errors
3. **Performance**: No significant latency increase
4. **Bundle Size**: < 20KB increase (current `api.ts` is ~35KB)
5. **User Experience**: Better error messages, reconnection feedback

## Risks and Mitigations

### Risk: Breaking existing streaming

- **Mitigation**: Feature flag, canary deployment, immediate rollback plan

### Risk: Performance regression

- **Mitigation**: Performance testing before deployment, monitoring

### Risk: Bundle size increase

- **Mitigation**: Tree shaking, code splitting if needed

## Conclusion

This consolidated `SSEService.ts` approach provides:

1. **Production-ready streaming** with error recovery
2. **Simple architecture** in one file
3. **Backward compatibility** with existing code
4. **Addresses the temporary workaround** comment directly
5. **Ready for future enhancements** (more streaming endpoints, better monitoring)

The implementation can be completed in 4 days with minimal risk to the existing system.
