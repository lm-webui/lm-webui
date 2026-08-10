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

- A sidebar for conversations, search, pinned items, projects, and navigation (with an Agent section)
- A model and provider selector in the header
- A central Chat view
- An Image Studio for prompt-based generation
- A Gallery for generated images
- A Projects workspace for custom instructions and grouped conversations
- An Agent workspace (coming soon)
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

## Vision

Vision (multimodal image understanding) is served by local image-text-to-text (VL) GGUF models through `llama-server`. When you attach an image and the Smart-Modality pipeline detects a vision request, it routes to the vision capability.

To use Vision:

1. Download a vision model (a main GGUF **and** its `mmproj` projector) via the model downloader — they are stored together in `models/vision/<model>/`.
2. Ensure `llama-server` is available (installed as part of the GGUF runtime).
3. When the vision bundle is complete, the **Vision** capability in the Runtime Manager shows **Ready** and the chat can analyze images.

### How Vision answers

- **Simple queries** — for a bare description request such as *"what's in this image"*, the VL model answers directly.
- **Complex queries** — for anything more (e.g. *"analyze this image and write a prompt to regenerate it"*), the VL
  model describes the image and that description is fed to your **selected chat model**, which composes the final
  answer. This pairs a small VL's visual grounding with a stronger text model's reasoning/writing.

### Mixed attachments

Attaching an image together with a document runs **both** capabilities: the image goes to Vision and the document
is used for retrieval (RAG). The selected model composes the answer from both.

If the vision bundle is incomplete (missing `mmproj`) or `llama-server` isn't available, the chat shows a clear
notice and answers the text without image analysis.

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
| Ollama | Local | Chat |
| GGUF | Local | Chat through llama.cpp |
| MLX | Local Apple Silicon | Chat through MLX |
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

The Runtime Manager reports local runtime availability across three tabs: **GGUF**, **MLX**, and **ComfyUI**.

**GGUF (llama.cpp)** — bundled in-container, plus a `llama-server` binary installed as part of the GGUF runtime (needed for Vision). The GGUF tab shows a **Capabilities** section (Chat and Vision ready status), a searchable model list (text models tagged `text`, vision bundles tagged `vision`), and a **Performance** section:
- Context window slider (1K–128K)
- GPU acceleration toggle + detected GPU / install acceleration
- KV cache quality (balanced q8_0 / full f16)
- Apply & Reload

Vision models pair a main GGUF with an `mmproj` stored in `models/vision/<model>/`; the download flow requires selecting a main model and one mmproj, and downloads run in a single-flight queue in the background.

**MLX** — external server on Apple Silicon macOS hosts. Install `mlx_lm.server` on the host, the Runtime Manager detects it and connects via HTTP API. The MLX tab mirrors the GGUF layout (capability status, searchable model list, runtime details). Setup scripts (install/uninstall/start/stop) available directly in the UI.

**ComfyUI** — external server for image generation, shown as a connection manager. Detected on `localhost:8188` (native) or `host.docker.internal:8188` (Docker), one-click connect from Runtime Manager. Model management handled by ComfyUI's own interface.

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

Authentication protects registration, login, refresh, logout, user sessions, conversations, projects, files, settings, and generated media. Role-based user/admin management is available to admins (user management, role/status changes, and usage analytics).

The following governance capabilities are planned for a future implementation phase and are intentionally listed here as roadmap items rather than completed features:

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
