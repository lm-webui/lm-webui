---
title: Core Features
description: Learn how the LM-WebUI workspace handles chat, projects, images, models, files, and runtimes.
section: Product
order: 2
---

# Core Features

LM-WebUI is a self-hosted AI workspace for working with local and cloud models from one application. The primary experience is a protected workspace where you can chat, organize conversations into projects, attach files, generate images, and manage the models and runtimes used by the application.

## The workspace

After signing in, LM-WebUI opens a single workspace with:

- A sidebar for conversations, search, pinned items, projects, and navigation
- A model and provider selector in the header
- A central Chat view
- An Image Studio for prompt-based generation
- A Gallery for generated images
- A Projects workspace for custom instructions and grouped conversations
- Settings for API keys, models, runtimes, preferences, and account controls

The application is responsive and adapts the sidebar and workspace controls for smaller screens.

## Chat

Chat is the primary workflow. Create a conversation, choose an available provider and model, and send messages through the composer.

Current chat capabilities include:

- Conversation creation and persistence
- Streaming responses over the application chat connection
- Markdown and code rendering
- Code blocks and Mermaid visualization where supported by the renderer
- Conversation title generation
- Rename, delete, pin, archive, and restore actions
- Conversation search and recent-conversation navigation
- Coding mode for programming-oriented prompts
- Search mode with selectable search engine configuration
- Image mode for image-aware or image-generation workflows
- Stop/cancel controls while a response is being generated

Available behavior depends on the selected provider, model, configured credentials, and installed local runtimes.

## Projects

Projects group related conversations and apply a reusable system prompt.

You can:

1. Create a project with a name and custom instructions.
2. Start or assign conversations to that project.
3. Open a project to view its conversations.
4. Edit or delete the project when its instructions change.

Project instructions are intended for recurring workflows such as code review, research, writing, or a team-specific assistant configuration.

## Models and providers

LM-WebUI separates model providers from local runtimes. A provider is the interface used to communicate with a model; a runtime is the local software that executes or exposes models.

### Supported provider integrations

| Provider | Category | Current use |
|---|---|---|
| OpenAI | Cloud | Chat and image generation |
| Google Gemini | Cloud | Chat and image generation |
| Anthropic | Cloud | Chat |
| DeepSeek | Cloud | Chat |
| xAI | Cloud | Chat |
| vLLM | Local or self-hosted | Chat |
| Ollama | Local | Chat and model discovery |
| GGUF | Local | Chat through llama.cpp |
| MLX | Local Apple Silicon | Chat |
| ComfyUI | Local image runtime | Image generation |

Provider and model availability is dynamic. Cloud providers require configured credentials, while local providers require a reachable or installed runtime.

### Model management

The model interface supports:

- Listing API models from configured providers
- Refreshing model availability
- Listing local GGUF models
- Uploading and validating GGUF models
- Downloading GGUF models
- Listing and downloading MLX models
- Discovering Ollama models
- Checking model compatibility
- Selecting a model for chat or image generation

## Files and context

Files can be attached to conversations through the multimodal composer.

The current file workflow includes:

- General file uploads for conversation context
- Image and document processing where supported
- Upload status reporting
- File references associated with conversations
- Context retrieval for relevant conversation or file content
- Citation and source display in the chat interface
- File deletion through the upload management flow

The exact file types and processing behavior depend on the backend configuration and provider capabilities. Treat advanced retrieval behavior as provider- and deployment-dependent rather than assuming every model supports every file type.

## Image Studio and Gallery

LM-WebUI provides two image workflows.

### Generate from Chat

Image generation can be initiated from a conversation. The chat displays an image-generation loading state, submits the request to the selected image provider, and stores the generated result with the conversation.

### Image Studio

Studio provides a dedicated generation workspace where you can:

- Write a prompt
- Select an available image provider and model
- Choose an aspect ratio or image size
- Configure quality, steps, and seed where supported
- Generate a batch of images
- Use a negative prompt for compatible local workflows
- Reuse generation settings from Gallery

Current image integrations include OpenAI, Google image models, and local runtimes such as ComfyUI. Availability is shown from the provider and runtime status reported by the backend.

### Gallery

Gallery stores generated images for the authenticated user. It supports browsing results, deleting images, and loading a previous prompt and generation configuration back into Studio.

## Runtime and hardware management

The Runtime Manager detects and reports local runtime availability with a clean 3-section UI.

**GGUF (llama.cpp)** — bundled in-container. Universal local inference engine with hardware-accelerated defaults. Configurable from the Runtime Manager UI:
- Context window slider (1K–32K)
- GPU acceleration toggle
- KV cache quality (balanced q8_0 / full f16)

**MLX** — external server on Apple Silicon macOS hosts. Install `mlx_lm.server` on the host, the Runtime Manager detects it and connects via HTTP API. Setup scripts (install/uninstall/start/stop) available directly in the UI.

**ComfyUI** — external server for image generation. Detected on `localhost:8188` (native) or `host.docker.internal:8188` (Docker), one-click connect from Runtime Manager. Model management handled by ComfyUI's own interface.

Ollama and vLLM are configured as standard API providers in Settings → API Providers, not managed runtimes.

The application also reports local hardware information for CPU, CUDA, ROCm, and Apple Metal environments. Hardware acceleration affects local execution only; cloud providers use their own infrastructure.

## Settings and account controls

Settings currently include:

- Provider API key management
- Provider connection tests
- Default chat and image model preferences
- Model management
- Runtime management
- Theme and interface preferences
- Profile and account controls

API keys are managed through the authenticated settings flow. Do not commit keys to the repository or place them in frontend source files.

## Authentication and planned governance features

Authentication currently protects registration, login, refresh, logout, user sessions, conversations, projects, files, settings, and generated media.

The following governance capabilities are planned for a future implementation phase and are intentionally listed here as roadmap items rather than completed features:

- Role-based user/admin management
- Rate limiting and DDoS protection
- CSRF protection

Until those capabilities are implemented and documented separately, deployments should follow the security guidance in [`SECURITY.md`](../SECURITY.md) and use appropriate network controls at the deployment layer.

## Feature availability

| Capability | Local runtimes | Cloud providers | Notes |
|---|---:|---:|---|
| Chat | Yes | Yes | Depends on runtime or provider availability |
| Streaming | Yes | Yes | Uses the application chat streaming flow |
| Image generation | ComfyUI and compatible local services | OpenAI and Google | Provider-dependent |
| File upload | Yes | Yes | Processing depends on file type and model support |
| Projects | Yes | Yes | Conversation organization and custom instructions |
| Model downloads | GGUF and MLX | No | Managed through the model/runtime interface |
| API keys | N/A | Yes | Managed in authenticated settings |
| Hardware acceleration | CPU, CUDA, ROCm, Metal | N/A | Applies to local execution |

## Where to go next

- [Getting Started](./getting-started.md) for installation and first-run setup
- [Architecture](./architecture.md) for the backend, frontend, provider, and runtime design
- [Deployment](./DEPLOYMENT.md) for Docker and hardware deployment
- [Contributing](../CONTRIBUTING.md) for development and contribution guidance
