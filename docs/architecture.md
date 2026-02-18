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

| Layer         | Directory     | Description                                                                                                   |
| ------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| **Features**  | `features/`   | Domain silos (Chat, Documents, Images, Models) containing dedicated hooks, services, and types.               |
| **UI Kit**    | `components/` | Atomic design components (`ui/`) and complex functional widgets (`chat/`, `reasoning/`).                      |
| **Store**     | `store/`      | Reactive state stores for managing chat sessions, reasoning steps, and context.                               |
| **Services**  | `services/`   | WebSocket clients (`conversationWebSocketService`, `reasoningWebSocketService`) handling real-time data flow. |
| **API Layer** | `api/`        | API service definitions and HTTP client configuration.                                                        |
| **Config**    | `config/`     | Application configuration and environment settings.                                                           |
| **Contexts**  | `contexts/`   | React context providers for theme, authentication, and global state.                                          |
| **Hooks**     | `hooks/`      | Custom React hooks for reusable logic and state management.                                                   |
| **Pages**     | `pages/`      | Page-level components and routing structure.                                                                  |
| **Types**     | `types/`      | TypeScript type definitions and interfaces.                                                                   |
| **Utils**     | `utils/`      | Utility functions and helpers.                                                                                |

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
- **🔗 RAG Engine (`rag/`)**:
  - Hybrid Search: Combining semantic (Vector) and keyword search.
  - Ingestion Pipeline: OCR, Chunking, and Embedding.
  - Vector Store: Local vector database management.
- **✨ Streaming Engine (`streaming/`)**:
  - Event System: Pub/sub model for decoupling inference from network responses.
  - Reasoning Parser: Real-time parsing of chain-of-thought tokens.
- **🤔 Reasoning Engine (`reasoning/`)**:
  - Step-by-step reasoning parsing and formatting.
  - Session management for reasoning workflows.
- **🔒 Security Engine (`security/`)**:
  - JWT authentication and token management.
  - Encryption services for sensitive data.
  - API key storage and management.
- **📄 Output Engine (`output/`)**:
  - Document generation and formatting.
  - Structured output processing.

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

## 🧪 Testing Strategy

### Backend Testing

- **Unit Tests**: Pytest for individual components
- **Integration Tests**: End-to-end API testing
- **WebSocket Tests**: Real-time communication testing
- **Hardware Tests**: GPU/CPU acceleration validation

### Frontend Testing

- **Component Tests**: React component testing with @testing-library/react
- **Store Tests**: Zustand store testing
- **Integration Tests**: API integration testing
- **E2E Tests**: Full user workflow testing
- **Test Framework**: Vitest with jsdom environment
- **Test Location**: `frontend/src/__tests__/` directory

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

## 🔌 Port Configuration & Networking

### Standardized Port Architecture

The application uses a consistent port configuration across all environments:

#### Development Environment

- **Frontend Development Server**: Port 5178 (Vite dev server)
- **Backend API Server**: Port 8000 (FastAPI)
- **CORS Configuration**: Allows requests from `http://localhost:5178`

#### Docker Deployment

- **External Access**: Port 7070 (maps to backend port 8000)
- **Internal Backend**: Port 8000 (serves both API and static frontend)
- **Frontend**: Served statically from backend at port 8000

#### Port Mapping Summary

```
Development:
  Frontend: http://localhost:5178  →  Backend: http://localhost:8000

Docker:
  Browser: http://localhost:7070  →  Container: http://localhost:8000
          (Docker Host)                    (Container Internal)
```

### Network Architecture

- **REST API**: HTTP/HTTPS on configured port
- **WebSocket**: Real-time streaming on same port as HTTP
- **CORS**: Configured for development and production origins
- **Proxy**: Frontend dev server proxies API requests to backend

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
├── 📁 backend/                    # FastAPI backend (Port: 8000)
│   ├── app/                      # Application code
│   │   ├── routes/              # API endpoints (REST + WebSocket)
│   │   ├── services/            # Business logic and orchestration
│   │   ├── rag/                 # RAG engine with vector search
│   │   ├── hardware/            # Hardware abstraction (CUDA/ROCm/Metal)
│   │   ├── database/            # Data persistence (SQLite)
│   │   ├── security/            # Authentication and encryption
│   │   ├── streaming/           # WebSocket streaming engine
│   │   ├── memory/              # Memory and knowledge graph
│   │   ├── reasoning/           # Reasoning step parsing
│   │   ├── middleware/          # Request middleware
│   │   ├── models/              # Pydantic schemas
│   │   ├── output/              # Document generation
│   │   └── utils/               # Utility functions
│   ├── tests/                   # Backend tests (pytest)
│   └── llama.cpp/               # GGUF runtime integration
├── 📁 frontend/                  # React + TypeScript frontend (Port: 5178)
│   ├── src/
│   │   ├── components/          # UI components (atomic design)
│   │   ├── features/            # Feature modules (chat, documents, etc.)
│   │   ├── store/              # State management (Zustand)
│   │   ├── services/           # API and WebSocket services
│   │   ├── api/                # API client configuration
│   │   ├── config/             # Application configuration
│   │   ├── contexts/           # React context providers
│   │   ├── hooks/              # Custom React hooks
│   │   ├── pages/              # Page-level components
│   │   ├── types/              # TypeScript type definitions
│   │   └── utils/              # Utility functions
│   └── __tests__/              # Frontend tests (Vitest)
├── 📁 docs/                     # Comprehensive documentation
│   ├── getting-started.md      # Quick start guide
│   ├── installation.md         # Detailed installation
│   ├── features.md             # Feature documentation
│   ├── architecture.md         # Architecture overview
│   ├── api-reference.md        # API documentation
│   ├── deployment.md           # Production deployment
│   └── contributing.md         # Contribution guidelines
├── 📁 .github/                 # GitHub configuration
│   ├── workflows/             # CI/CD pipelines
│   └── ISSUE_TEMPLATE/        # Issue templates
├── 📁 __dev__/                 # Development resources
├── 📁 __internal__/            # Internal development notes
├── 📁 __plans__/               # Project planning documents
├── 📁 __prompt___/             # Prompt templates and experiments
├── 📁 __sample__/              # Sample files and examples
├── 📁 __test__/                # Test resources and scripts
├── 📄 docker-compose.yml       # Docker Compose (Port: 7070 → 8000)
├── 📄 Dockerfile               # Docker build configuration
├── 📄 docker-entrypoint.sh     # Docker entrypoint script
├── 📄 README.md                # Project overview and quick start
├── 📄 CONTRIBUTING.md          # Contribution guidelines
├── 📄 cleanup_repository.sh    # Repository organization script
├── 📄 .gitignore              # Git ignore rules
├── 📄 .npmrc                  # npm configuration
└── 📄 .prettierrc             # Code formatting configuration
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
