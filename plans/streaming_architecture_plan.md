# Production-Ready Streaming Architecture Plan

## Executive Summary

The current streaming implementation in [`frontend/src/utils/api.ts`](frontend/src/utils/api.ts) uses a temporary workaround with manual SSE parsing (lines 179-183). This plan outlines a comprehensive redesign to create a production-ready streaming architecture that maintains backward compatibility while improving reliability, error handling, and maintainability.

## Current Issues Identified

1. **Temporary Workaround**: Manual SSE parsing marked as "temporary" in code comments
2. **Mixed Formats**: Backend sends inconsistent SSE formats (JSON, raw text, custom)
3. **Poor Error Handling**: Limited recovery from network failures or malformed streams
4. **No Reconnection**: Streams die permanently on connection issues
5. **Mixed Concerns**: Streaming logic intertwined with chat business logic
6. **Dual Approaches**: SSE in `api.ts` vs WebSocket in `StreamingService.ts`

## Proposed Architecture

### Core Components

#### 1. **SSEStreamReader** (`frontend/src/utils/sse/SSEStreamReader.ts`)

- Low-level SSE parser with format detection
- Handles legacy and new SSE formats
- Manages buffers, line endings, and event parsing
- Provides async iterator interface

#### 2. **Enhanced authFetch** (`frontend/src/utils/api.ts`)

- Extended with streaming mode option
- Returns `SSEStreamReader` for streaming responses
- Maintains existing authentication and error handling
- Backward compatible API

#### 3. **SSEService** (`frontend/src/services/SSEService.ts`)

- High-level streaming facade
- Automatic retry with exponential backoff
- User-friendly error handling
- Progress tracking and status updates

#### 4. **Streaming Types** (`frontend/src/utils/sse/types.ts`)

- TypeScript interfaces for SSE events
- Error classification system
- Configuration interfaces

### File Structure After Refactoring

```
frontend/src/
├── utils/
│   ├── api.ts (933 → ~850 lines, enhanced with streaming)
│   ├── sse/
│   │   ├── index.ts (exports)
│   │   ├── SSEStreamReader.ts (core parser, ~150 lines)
│   │   ├── SSEManager.ts (connection management, ~100 lines)
│   │   └── types.ts (interfaces, ~50 lines)
│   └── streamingUtils.ts (helper functions, ~50 lines)
├── services/
│   ├── StreamingService.ts (WebSocket - unchanged, 311 lines)
│   ├── SSEService.ts (new - SSE facade, ~200 lines)
│   └── ChatStreamService.ts (optional - chat-specific, ~100 lines)
└── docs/
    ├── STREAMING_GUIDE.md
    ├── API_REFERENCE.md
    └── ARCHITECTURE.md
```

## SSE Format Standardization

### Current Backend Format (Mixed)

- JSON SSE: `data: {"chunk": "text", "type": "status"}`
- Raw text: `data: plain text`
- Custom formats: Various event structures

### Proposed Standard Format

```json
data: {"type": "chunk", "data": {"content": "Hello", "index": 0}}
data: {"type": "status", "data": {"message": "Processing...", "progress": 0.5}}
data: {"type": "error", "data": {"code": "RATE_LIMIT", "message": "Too many requests"}}
data: {"type": "complete", "data": {"final_response": "Full answer"}}
```

### Migration Strategy

1. **Phase 1**: Frontend detects and handles both formats
2. **Phase 2**: Backend updates to new format (coordinated release)
3. **Phase 3**: Frontend removes legacy format support
4. **Phase 4**: Full production deployment

## Error Handling & Reconnection

### Error Classification

```typescript
enum StreamErrorType {
  NETWORK = "NETWORK", // Connection failures
  TIMEOUT = "TIMEOUT", // Request timeout
  SERVER = "SERVER", // 5xx errors
  PARSE = "PARSE", // Malformed SSE
  CANCELLED = "CANCELLED", // User cancellation
  MAX_RETRIES = "MAX_RETRIES_EXCEEDED",
}
```

### Reconnection Strategy

- **Exponential backoff**: 1s, 2s, 4s, 8s (max 3 retries)
- **Jitter**: Random delay to avoid thundering herd
- **Heartbeat monitoring**: Detect dead connections
- **User feedback**: Progress indicators during reconnection

### Recovery Options

1. **Automatic retry** for network errors
2. **Fallback to non-streaming** after max retries
3. **User-initiated retry** with clear error messages
4. **Session preservation** where possible

## Backward Compatibility

### Critical Requirements

1. **API signatures unchanged**: `chatWithModelStream(req, onChunk?, onStatus?)`
2. **Existing callers work**: [`chatService.ts`](frontend/src/features/chat/chatService.ts) lines 220-233
3. **Behavior preserved**: Chunks delivered in same order, same error types
4. **Performance maintained**: No significant latency increase

### Testing Strategy

1. **Unit tests**: API signature and behavior matching
2. **Integration tests**: Real backend compatibility
3. **Performance tests**: Bundle size and latency checks
4. **Canary deployment**: Gradual rollout with monitoring

### Safeguards

1. **Feature flags**: `REACT_APP_USE_NEW_STREAMING=true`
2. **Fallback mechanism**: Automatic switch to old implementation on failure
3. **Monitoring**: Error rate alerts (>5% failure triggers investigation)
4. **Rollback plan**: Immediate revert if critical issues detected

## Implementation Phases

### Phase 1: Foundation (Week 1)

- Create `SSEStreamReader` class with format detection
- Add streaming options to `authFetch` interface
- Write unit tests for new components

### Phase 2: Integration (Week 2)

- Update `_chatWithModel` to use new streaming API
- Implement error handling and reconnection
- Add integration tests with current backend

### Phase 3: Refinement (Week 3)

- Extract streaming logic from `api.ts` to dedicated services
- Add advanced features (heartbeat, progress tracking)
- Performance optimization and bundle size reduction

### Phase 4: Documentation & Deployment (Week 4)

- Update documentation and remove temporary comments
- Create migration guide for backend team
- Canary deployment with monitoring
- Full production rollout

## Success Metrics

### Technical Metrics

- **Error rate**: < 1% streaming failures (currently unknown)
- **Latency**: < 100ms first chunk, < 5s complete response
- **Bundle size**: < 20% increase (currently 933 lines in `api.ts`)
- **Memory usage**: No leaks in 24-hour streaming tests

### User Experience Metrics

- **Success rate**: > 99% streaming completion
- **Recovery rate**: > 90% automatic reconnection success
- **User satisfaction**: No increase in support tickets
- **Performance perception**: No noticeable degradation

## Risks & Mitigations

### High Risk: Backend Compatibility

- **Risk**: New SSE format breaks existing backend
- **Mitigation**: Format detection with legacy fallback
- **Mitigation**: Coordinated release with backend team
- **Mitigation**: Feature flag for gradual rollout

### Medium Risk: Performance Regression

- **Risk**: Increased latency or bundle size
- **Mitigation**: Performance testing before deployment
- **Mitigation**: Bundle size monitoring
- **Mitigation**: Optimized parsing algorithms

### Low Risk: API Breakage

- **Risk**: Existing callers break due to subtle behavior changes
- **Mitigation**: Comprehensive unit and integration tests
- **Mitigation**: TypeScript strict mode enforcement
- **Mitigation**: Canary deployment with user sampling

## Resource Requirements

### Frontend Development

- **Senior developer**: 3-4 weeks implementation
- **QA engineer**: 1-2 weeks testing
- **Technical writer**: 1 week documentation

### Backend Coordination

- **Backend team**: 1-2 weeks for SSE format updates
- **DevOps**: Monitoring and deployment support
- **Product manager**: User communication and rollout planning

## Conclusion

This plan provides a comprehensive roadmap for transforming the temporary streaming workaround into a production-ready architecture. The approach balances innovation with stability, ensuring backward compatibility while delivering significant improvements in reliability, error handling, and maintainability.

The key success factors are:

1. **Incremental implementation** with careful testing
2. **Close coordination** with backend team
3. **Comprehensive monitoring** during rollout
4. **Clear rollback procedures** if issues arise

By following this plan, the LM WebUI will have a robust streaming architecture that supports current needs while being ready for future scaling and feature development.

---

## Appendix A: Code Examples

### Enhanced authFetch Usage

```typescript
// Current usage (continues to work)
const response = await chatWithModelStream(req, onChunk, onStatus);

// New usage (optional advanced features)
const streamReader = await authFetch(
  "/api/chat",
  {
    method: "POST",
    body: JSON.stringify(req),
  },
  {
    stream: true,
    onError: (error) => handleStreamError(error),
    timeout: 30000,
  },
);

for await (const event of streamReader.readEvents()) {
  if (event.type === "chunk") onChunk(event.data.content);
  if (event.type === "status") onStatus(event.data.message);
}
```

### SSEStreamReader Interface

```typescript
class SSEStreamReader {
  constructor(response: Response, options?: SSEOptions);

  async *readEvents(): AsyncGenerator<SSEEvent>;
  async readToCompletion(callbacks?: StreamingCallbacks): Promise<string>;
  cancel(): void;

  on(event: "data", callback: (event: SSEEvent) => void): void;
  on(event: "error", callback: (error: StreamError) => void): void;
  on(event: "complete", callback: (finalData: any) => void): void;

  get isStreaming(): boolean;
  get bytesReceived(): number;
  get eventsReceived(): number;
}
```

## Appendix B: Testing Checklist

### Pre-Deployment Tests

- [ ] All existing unit tests pass
- [ ] Integration tests with current backend pass
- [ ] Performance tests show no regression
- [ ] Bundle size increase < 20%
- [ ] Error handling tests cover all scenarios
- [ ] Backward compatibility verified
- [ ] Documentation updated and reviewed

### Deployment Tests

- [ ] Canary deployment to 10% users
- [ ] Monitor error rates for 24 hours
- [ ] User feedback collected
- [ ] Performance metrics analyzed
- [ ] Rollback tested and verified

### Post-Deployment Tests

- [ ] Full user base monitoring for 1 week
- [ ] Error rate tracking (< 1% target)
- [ ] Performance monitoring (latency, memory)
- [ ] User satisfaction survey
- [ ] Support ticket analysis
