# Streaming Architecture Diagram

## Current Architecture (Problematic)

```mermaid
graph TD
    A[UI Component] --> B[chatService.ts]
    B --> C[api.ts chatWithModelStream]
    C --> D[_chatWithModel function]
    D --> E{Streaming?}
    E -->|Yes| F[Manual SSE Parsing<br/>80+ lines in same function]
    E -->|No| G[Regular authFetch]
    F --> H[Complex format detection<br/>Buffer management<br/>Error handling mixed with logic]
    H --> I[Return concatenated string]
    G --> J[Return parsed JSON]

    style F fill:#f96
    style H fill:#f96
```

**Issues**: Streaming logic mixed with business logic, no separation, poor error handling.

## Proposed Architecture (Production Ready)

```mermaid
graph TD
    A[UI Component] --> B[chatService.ts]
    B --> C[api.ts chatWithModelStream]
    C --> D[_chatWithModel function]
    D --> E{Streaming?}
    E -->|Yes| F[SSEService.streamChat]
    E -->|No| G[Regular authFetch]

    subgraph "SSE Layer (Separate Files)"
        F --> H[SSEStreamReader]
        H --> I[Format Detection]
        I --> J[Legacy Format Parser]
        I --> K[New Format Parser]
        H --> L[Error Recovery]
        L --> M[Automatic Retry]
        L --> N[Reconnection Logic]
        H --> O[Event Emission]
        O --> P[Chunk Events]
        O --> Q[Status Events]
        O --> R[Error Events]
    end

    subgraph "Connection Management"
        H --> S[SSEManager]
        S --> T[Heartbeat Monitoring]
        S --> U[Timeout Handling]
        S --> V[Connection Pool]
    end

    F --> W[Return concatenated string]
    G --> X[Return parsed JSON]

    style F fill:#9f9
    style H fill:#9f9
    style subgraph fill:#eef
```

**Benefits**: Clean separation, reusable components, production-grade error handling.

## File Dependency Graph

```mermaid
graph TD
    A[frontend/src/utils/api.ts] --> B[frontend/src/utils/sse/SSEStreamReader.ts]
    A --> C[frontend/src/utils/sse/types.ts]
    B --> C
    B --> D[frontend/src/utils/sse/SSEManager.ts]

    E[frontend/src/services/SSEService.ts] --> B
    E --> C
    E --> D

    F[frontend/src/features/chat/chatService.ts] --> A
    F --> E

    G[UI Components] --> F

    style A fill:#ccf
    style B fill:#cfc
    style C fill:#ffc
    style D fill:#cfc
    style E fill:#fcf
    style F fill:#ccf
```

## Data Flow for Streaming Chat

```mermaid
sequenceDiagram
    participant UI as UI Component
    participant ChatSvc as chatService.ts
    participant API as api.ts
    participant SSESvc as SSEService
    participant SSE as SSEStreamReader
    participant Backend as Backend API

    UI->>ChatSvc: sendMessage(request)
    ChatSvc->>API: chatWithModelStream(request, onChunk, onStatus)
    API->>SSESvc: streamChat(request, callbacks)
    SSESvc->>Backend: POST /api/chat (with streaming headers)
    Backend-->>SSESvc: HTTP 200, Content-Type: text/event-stream

    loop Stream Processing
        Backend->>SSE: data: {"type":"chunk","data":{"content":"Hello"}}
        SSE->>SSESvc: emit('chunk', 'Hello')
        SSESvc->>API: onChunk('Hello')
        API->>ChatSvc: onChunk('Hello')
        ChatSvc->>UI: Update UI with chunk
    end

    Backend->>SSE: data: {"type":"complete","data":{"final_response":"Hello World"}}
    SSE->>SSESvc: emit('complete', 'Hello World')
    SSESvc->>API: Return 'Hello World'
    API->>ChatSvc: Return final response
    ChatSvc->>UI: Display complete response
```

## Error Recovery Flow

```mermaid
graph TD
    A[Start Streaming] --> B[Network Request]
    B --> C{Success?}
    C -->|Yes| D[Process Stream]
    C -->|No| E[Classify Error]

    E --> F{Recoverable?}
    F -->|Yes| G[Calculate Backoff Delay]
    G --> H[Wait Delay]
    H --> I[Increment Retry Count]
    I --> J{Max Retries?}
    J -->|No| B
    J -->|Yes| K[Fallback Options]

    F -->|No| L[Immediate Failure]

    K --> M[Switch to Non-Streaming]
    K --> N[Show User Error]
    K --> O[Preserve Partial Response]

    D --> P[Monitor Heartbeat]
    P --> Q{Heartbeat OK?}
    Q -->|Yes| D
    Q -->|No| R[Attempt Reconnection]
    R --> B

    style B fill:#ff6
    style E fill:#f96
    style K fill:#f66
    style D fill:#9f9
```

## Migration Path from Current to Proposed

```mermaid
timeline
    title Streaming Architecture Migration
    section Phase 1: Foundation
        Week 1 : Create SSEStreamReader<br/>with format detection
        Week 1 : Unit tests for parsing
    section Phase 2: Integration
        Week 2 : Update _chatWithModel<br/>to use SSEStreamReader
        Week 2 : Integration tests<br/>with current backend
    section Phase 3: Enhancement
        Week 3 : Add error handling<br/>and reconnection
        Week 3 : Create SSEService facade
    section Phase 4: Refinement
        Week 4 : Performance optimization
        Week 4 : Documentation updates
    section Phase 5: Deployment
        Week 5 : Canary testing<br/>(10% users)
        Week 5 : Full rollout<br/>(100% users)
```

## Key Decision Points

### 1. File Splitting Strategy

```
Option 1: Minimal Split
api.ts (keep streaming)
└── sseUtils.ts (helper functions)

Option 2: Moderate Split ✓ Recommended
api.ts (streaming calls)
├── SSEStreamReader.ts (core parser)
└── streamingUtils.ts (helpers)

Option 3: Full Split
api.ts (no streaming)
├── SSEService.ts (facade)
├── SSEStreamReader.ts (parser)
├── SSEManager.ts (connections)
└── types.ts (interfaces)
```

### 2. Backend Coordination Timeline

```
Immediate: Frontend handles both formats
Short-term: Backend updates to standard SSE
Long-term: Frontend removes legacy support
```

### 3. Error Handling Strategy

```
Level 1: Basic retry (network errors)
Level 2: Format fallback (malformed SSE)
Level 3: Non-streaming fallback (max retries)
Level 4: User recovery options
```

## Success Metrics Visualization

```mermaid
quadrantChart
    title Streaming Architecture Success Metrics
    x-axis "Complexity" --> "Simplicity"
    y-axis "Risk" --> "Safety"
    quadrant-1 "Over-engineered"
    quadrant-2 "Ideal Target"
    quadrant-3 "Neglected"
    quadrant-4 "Too Simple"
    "Current Implementation": [0.8, 0.7]
    "Proposed Architecture": [0.4, 0.3]
    "Minimal Changes": [0.6, 0.5]
    "Full Rewrite": [0.2, 0.8]
```

**Interpretation**: The proposed architecture moves from high complexity/risk (current) to moderate complexity with much lower risk (ideal target).

## Bundle Size Impact

```mermaid
xychart-beta
    title "Bundle Size Impact (Estimated)"
    x-axis ["Current", "+SSEStreamReader", "+SSEService", "+Full Architecture"]
    y-axis "File Size (KB)" 0 --> 50
    bar [35, 38, 42, 45]
    line [35, 38, 42, 45]
```

**Estimated increase**: 10-15KB (28% increase) for full production architecture, but with significantly improved reliability and maintainability.

## Conclusion

The diagrams show that splitting streaming logic into separate files creates a cleaner, more maintainable architecture that addresses the "temporary workaround" issue while maintaining backward compatibility. The proposed structure balances separation of concerns with practical implementation constraints.
