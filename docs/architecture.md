# ⚙️ System Architecture & Features

## High-Level Overview

The application follows a modern decoupled architecture, composed of a reactive **Single Page Application (SPA)** frontend and a high-performance **FastAPI** backend. The system is designed for local LLM inference, RAG (Retrieval-Augmented Generation), and multimodal interaction, emphasizing data privacy and hardware acceleration.

---

## 🖥️ Frontend Architecture

Built with **React 18** and **TypeScript**, leveraging **Vite** for build performance. The frontend adopts a Feature-First architecture to maintain scalability.

### 🧩 Core Stack

- **Framework:** React + TypeScript + Vite
- **Styling:** Tailwind CSS + [shadcn/ui](https://ui.shadcn.com/)
- **State Management:**
  - **Global State:** `Zustand` (High-frequency updates like chat streams)
  - **App State:** React Context (Auth, Theme)
- **Network:** Axios (REST) + Native WebSockets (Real-time streaming)

### 📂 Structural Organization (`frontend/src`)

| Layer        | Directory     | Description                                                                                                   |
| ------------ | ------------- | ------------------------------------------------------------------------------------------------------------- |
| **Features** | `features/`   | Domain silos (Chat, Documents, Images, Models) containing dedicated hooks, services, and types.               |
| **UI Kit**   | `components/` | Atomic design components (`ui/`) and complex functional widgets (`chat/`, `reasoning/`).                      |
| **Store**    | `store/`      | Reactive state stores for managing chat sessions, reasoning steps, and context.                               |
| **Services** | `services/`   | WebSocket clients (`conversationWebSocketService`, `reasoningWebSocketService`) handling real-time data flow. |

---

## ⚡ Backend Architecture

Powered by **Python FastAPI**, the backend employs a **Modular Monolith** pattern. It separates core domain logic from API routing, utilizing a specialized hardware abstraction layer for optimized local inference.

### 🏗️ Architectural Layers

#### 1. Interface Layer (`routes/`)

The entry point for all external requests.

- **REST APIs:** Standard endpoints for resource management (Uploads, Settings, Models).
- **WebSockets:** Dedicated channels for low-latency token streaming and reasoning updates.

#### 2. Domain Engines

specialized modules encapsulating complex logic:

- **🧠 Memory Engine (`memory/`)**:
  - Context Assembler: Dynamic context window management.
  - Knowledge Graph: Structured information retention (`kg_manager`).
  - Summarization: Long-term memory compression.
- **📚 RAG Engine (`rag/`)**:
  - Hybrid Search: Combining semantic (Vector) and keyword search.
  - Ingestion Pipeline: OCR, Chunking, and Embedding.
  - Vector Store: Local vector database management.
- **🌊 Streaming Engine (`streaming/`)**:
  - Event System: Pub/sub model for decoupling inference from network responses.
  - Reasoning Parser: Real-time parsing of chain-of-thought tokens.

#### 3. Service Layer (`services/`)

Orchestrates business processes and external integrations:

- **Model Management:** GGUF resolution, downloading, and validation.
- **Multimodal:** Image generation and vision services.
- **Process Manager:** Handling background tasks and optimizations.

#### 4. Hardware Abstraction Layer (`hardware/`)

A cross-cutting concern that optimizes runtime performance:

- **Detection:** Auto-identifies execution providers (CUDA, ROCm, Metal, CPU).
- **Management:** Resource allocation and offloading strategies.

### 💾 Data Persistence

- **Relational:** SQLite with connection pooling (`database/`) for structured data (Chat history, users).
- **Vector:** Local embeddings storage for document retrieval.
- **File System:** Managed storage for local LLMs, uploads, and generated artifacts.

---

## 🔄 Critical Workflows

### 🗣️ Chat Inference Pipeline

1.  **Request:** User sends prompt via WebSocket.
2.  **Contextualization:** `Memory Engine` retrieves relevant history and RAG documents.
3.  **Optimization:** `Hardware Layer` configures the model loader.
4.  **Generation:** Model generates tokens; `Streaming Engine` captures and emits events.
5.  **Response:** Frontend `Zustand` store updates UI in real-time.
6.  **Persistence:** `ChatController` saves assistant messages to database after streaming completes.

### 📄 RAG Ingestion Pipeline

1.  **Upload:** File received at `routes/upload`.
2.  **Processing:** `rag/processor` extracts text (OCR if needed).
3.  **Indexing:** `rag/embedder` converts text to vectors.
4.  **Storage:** Vectors saved to local store; Metadata to SQLite.

---

## 🏗️ DRY Implementation & Code Quality

### Backend DRY Improvements

1. **Standardized Error Handling**: Unified error response format across all endpoints
2. **Consolidated Upload Endpoints**: Single upload service handling multiple file types
3. **Removed Dormant Tasks**: Cleaned up unused background tasks and services
4. **Chat Service Abstraction**: Unified chat logic with proper separation of concerns
5. **Standardized Provider Interfaces**: Consistent interfaces for model providers
6. **Updated Configuration Management**: Environment-based configuration with validation

### Frontend DRY Improvements

1. **Unified Type System**: Consolidated TypeScript interfaces in `frontend/src/types/core/`
2. **Store Architecture Refactoring**: Slice-based Zustand stores with unified patterns
3. **Service Layer Standardization**: Consistent API service patterns
4. **Component Consolidation**: Reusable UI components with proper prop interfaces

---

## Core Features

### 1. 🔐 Authentication & User Management

#### JWT-Based Authentication

- **Stateless authentication** using JSON Web Tokens
- **Refresh tokens** stored as HTTP-only cookies for security
- **Role-based access control** with user and admin levels
- **Session isolation** ensuring conversation privacy

#### User Management

- User registration and login
- Session management with automatic expiration
- Conversation isolation per user
- Secure password hashing with bcrypt

#### Security Features

- Input validation and sanitization
- Rate limiting protection
- CSRF protection
- Secure cookie handling

### 2. 🌐 WebSocket Streaming with Reasoning

- **Bidirectional WebSocket communication** for instant updates
- **Token-by-token streaming** with controlled pacing (1-2 tokens per message)
- **Connection health monitoring** with automatic reconnection
- **Heartbeat mechanism** to detect and recover from disconnections
- **Step-by-step reasoning visualization** showing AI thinking process
- **Expandable reasoning steps** with confidence scores
- **Real-time progress indicators** during generation
- **Visual thinking animations** for better user experience
- **Immediate cancellation** with state preservation
- **Stop/resume functionality** during generation
- **Session management** for concurrent streams
- **Resource cleanup** on connection close

### 3. 🔗 RAG (Retrieval-Augmented Generation)

#### Vector Store Integration

- **Qdrant vector database** for efficient similarity search
- **Automatic embedding generation** for text and documents
- **Metadata storage** for source attribution and versioning
- **Index optimization** for fast retrieval

#### Context Management

- **Intelligent context window management** with token optimization
- **Cross-conversation retrieval** of relevant historical context
- **File reference integration** for multimodal content
- **Automatic context pruning** to stay within model limits

#### Retrieval Pipeline

- **Semantic search** across conversation history
- **Hybrid search** combining semantic and keyword matching
- **Relevance scoring** with configurable thresholds
- **Source attribution** showing where information came from

### 4. 👁️ Multimodal Processing

#### Image Processing

- **Image upload and validation** (PNG, JPG, WebP formats)
- **Automatic resizing and optimization** for LLM consumption
- **OCR text extraction** using EasyOCR integration
- **Base64 encoding** for seamless LLM integration
- **Metadata extraction** (dimensions, format, size)

#### Document Processing

- **PDF parsing** with pypdf for text extraction
- **DOCX processing** with python-docx integration
- **Content summarization** for large documents
- **Structured data preparation** for LLM context
- **File size limits** with intelligent truncation

#### Multimodal Integration

- **Automatic context inclusion** of file content in conversations
- **File reference tracking** across conversations
- **Thumbnail generation** for visual previews
- **Progress tracking** during file processing

### 5. ⚡ Hardware Acceleration

#### Automatic Detection

- **CUDA detection** for NVIDIA GPUs with VRAM measurement
- **ROCm detection** for AMD GPUs on Linux systems
- **Metal detection** for Apple Silicon Macs
- **CPU fallback** with optimization recommendations
- **Cross-platform compatibility** checks

#### Intelligent Quantization

- **VRAM-aware quantization selection** based on available memory
- **Backend-specific quantization hierarchies** for optimal performance
- **Automatic fallback** to CPU-safe options when needed
- **Performance optimization** based on hardware capabilities

#### Optimization Features

- **Model loading optimization** for available hardware
- **Memory management** with automatic cleanup
- **Performance monitoring** with real-time feedback
- **Hardware utilization display** in UI

### 6. 🤖 GGUF Runtime & Model Management ⭐

#### Complete GGUF Integration

- **GGUF model management system** with full API support
- **HuggingFace integration** for direct model downloads
- **Local model registry** for organizing GGUF files
- **Hardware compatibility checking** before model usage

#### Model Operations

- **Upload GGUF models** from local storage
- **Download from HuggingFace** with progress tracking
- **Model validation** ensuring file integrity
- **Metadata extraction** from GGUF files
- **Model deletion** with cleanup

#### WebSocket Progress Tracking

- **Real-time download progress** via WebSocket
- **Cancelable downloads** with cleanup
- **Progress visualization** in UI
- **Error handling** with user feedback

### 7. 🧠 Knowledge Graph & Memory System

#### Conversation Memory

- **Persistent conversation storage** with relationship tracking
- **Entity extraction** and relationship mapping
- **Semantic linking** between related conversations
- **Memory consolidation** over time

#### Knowledge Organization

- **Topic clustering** for better organization
- **Cross-reference creation** between related content
- **Temporal tracking** of conversation evolution
- **Import/export functionality** for knowledge transfer

#### Search Capabilities

- **Semantic search** across stored knowledge
- **Relationship traversal** through connected entities
- **Context-aware retrieval** based on current conversation
- **Relevance ranking** of retrieved memories

---

## 🧪 Testing Strategy

### Backend Testing

- **Unit Tests**: Pytest for individual components
- **Integration Tests**: End-to-end API testing
- **WebSocket Tests**: Real-time communication testing
- **Hardware Tests**: GPU/CPU acceleration validation

### Frontend Testing

- **Component Tests**: React component testing
- **Store Tests**: Zustand store testing
- **Integration Tests**: API integration testing
- **E2E Tests**: Full user workflow testing

### CI/CD Pipeline

- **GitHub Actions**: Automated testing on push/PR
- **Docker Build Validation**: Container build testing
- **Code Coverage**: >80% test coverage target
- **Security Scanning**: Snyk integration for vulnerability detection

---

## 🔒 Security & Compliance

### Data Privacy

- **Local-First Design**: Data remains on user's infrastructure
- **Encryption**: Secure storage for sensitive data
- **Access Control**: Role-based authentication (planned)

### Security Features

- **Input Validation**: Sanitization of all user inputs
- **Rate Limiting**: Protection against abuse
- **Audit Logging**: Comprehensive activity tracking
- **Vulnerability Scanning**: Regular dependency updates

---

## 📈 Performance Characteristics

### Backend Performance

- **Response Time**: <100ms for API endpoints
- **WebSocket Latency**: <50ms for real-time updates
- **Model Loading**: Optimized GGUF loading with hardware detection
- **Memory Management**: Efficient context window handling

### Frontend Performance

- **Bundle Size**: <2MB initial load
- **Time to Interactive**: <3 seconds
- **WebSocket Reconnection**: Automatic reconnection with state recovery
- **Offline Support**: Partial offline functionality

---

## 📁 Repository Structure (Open-Source Ready)

```
lm-webui/
├── 📁 backend/                    # FastAPI backend
│   ├── app/                      # Application code
│   │   ├── routes/              # API endpoints
│   │   ├── services/            # Business logic
│   │   ├── rag/                 # RAG engine
│   │   ├── hardware/            # Hardware abstraction
│   │   └── database/            # Data persistence
│   └── tests/                   # Backend tests
├── 📁 frontend/                  # React + TypeScript frontend
│   ├── src/
│   │   ├── components/          # UI components
│   │   ├── features/            # Feature modules
│   │   ├── store/              # State management
│   │   ├── services/           # API services
│   │   └── types/core/         # Unified type definitions
│   └── tests/                  # Frontend tests
├── 📁 docs/                     # Documentation
│   ├── implementation/         # Implementation details
│   ├── prompts/               # Prompt templates
│   └── testing/               # Test documentation
├── 📁 scripts/                 # Utility scripts
│   ├── debug/                 # Debug scripts
│   └── tests/                 # Test utilities
├── 📁 examples/                # Example configurations
│   └── samples/               # Sample files
├── 📁 .github/                 # GitHub configuration
│   ├── workflows/             # CI/CD pipelines
│   ├── ISSUE_TEMPLATE/        # Issue templates
│   └── instructions/          # Development instructions
├── 📄 LICENSE                  # MIT License
├── 📄 CONTRIBUTING.md          # Contribution guidelines
├── 📄 README.md                # Project documentation
├── 📄 architecture.md          # Architecture documentation
├── 📄 DEPLOYMENT.md            # Deployment instructions
├── 📄 docker-compose.yml       # Docker Compose configuration
├── 📄 Dockerfile               # Docker build configuration
├── 📄 install.sh               # One-line installation script
└── 📄 cleanup_repository.sh    # Repository organization script
```

---

## 🤝 Community & Contribution

### Open-Source Ready

- **MIT License**: Permissive open-source licensing
- **Comprehensive Documentation**: Complete setup and usage guides
- **Issue Templates**: Standardized bug reports and feature requests
- **Contribution Guidelines**: Clear process for community contributions

### Development Workflow

- **Conventional Commits**: Standardized commit messages
- **Code Review**: Required for all changes
- **Testing Requirements**: Comprehensive test coverage
- **Documentation Updates**: Required for feature changes
