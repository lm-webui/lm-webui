---
title: Getting Started
description: Install LM-WebUI and start your first conversation.
section: Start here
order: 1
---

# Getting Started

Welcome to LM WebUI! This guide will help you get up and running quickly.

## Quick Start Options

### Option 1: One-Line Installation (Recommended)

```bash
curl -fsSL https://lmwebui.com/install.sh | bash
```

This will:

- Check for Python 3.10+ and git
- Clone the repository to `~/.lmwebui/`
- Create Python virtual environment and install dependencies
- Build the frontend (requires Node.js, skips if not found)
- Install systemd (Linux) or launchd (macOS) service
- Start the service on port 7070

Access the application at `http://localhost:7070`

### Option 2: Manual Installation (For Developers)

```bash
# 1. Clone the repository
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui

# 2. Backend setup
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# 3. Frontend setup
cd ../frontend
npm install

# 4. Start services
# Terminal 1: Backend
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 7070 --reload

# Terminal 2: Frontend
cd frontend && npm run dev

# Access at http://localhost:5177
```

### Option 3: Docker (For Server Deployment)

```bash
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui
docker compose up --build
```

Access the application at `http://localhost:7070`. Docker is an alternative for containerized server environments.

## First Steps

### 1. Create an Account

1. Open `http://localhost:7070` (Docker) or `http://localhost:5177` (manual) in your browser
2. Click "Register" to create a new account
3. Enter your email and password
4. You'll be automatically logged in after registration

### 2. Configure API Keys (Optional)

If you want to use cloud-based AI models:

1. Go to Settings (gear icon in sidebar)
2. Navigate to "API Keys" section
3. Add your OpenAI, Anthropic, or other API keys
4. Keys are encrypted before storage

### 3. Start Chatting

1. Type your first message in the chat input
2. Select a model from the dropdown:
   - **Local models**: GGUF models you've downloaded
   - **Cloud models**: OpenAI, Anthropic, etc. (requires API keys)
   - **Ollama**: Local Ollama models if installed
3. Click send or press Enter

### 4. Try Advanced Features

- **Upload files**: Drag and drop images or documents
- **Enable streaming**: Toggle "Deep Thinking" mode for step-by-step reasoning
- **Use RAG**: Enable "Use Context" for retrieval-augmented responses
- **Download GGUF models**: Go to Models section to download local models

## Basic Configuration

### Environment Variables

Create a `.env` file in the project root or set these on the `lm-webui` service in `docker-compose.yml`:

```bash
# Frontend (.env in project root)
VITE_BACKEND_URL=http://localhost:7070

# Backend (backend/.env)
BACKEND_HOST=0.0.0.0
BACKEND_PORT=7070
DATABASE_URL=sqlite:///./data/app.db
SECRET_KEY=your-secret-key-here
```

**GGUF engine tuning** — set these on the `lm-webui` service in `docker-compose.yml` to override hardware-auto-detected defaults:

```yaml
environment:
  - GGUF_N_CTX=4096          # Context window: 1024–32768
  - GGUF_N_GPU_LAYERS=-1     # GPU layers: -1=all, 0=CPU, N=first N layers
  - GGUF_FLASH_ATTN=1        # Flash attention: 1=on (faster), 0=off
  - GGUF_CACHE_TYPE_K=q8_0   # Key cache: f16, q8_0, q4_0
  - GGUF_CACHE_TYPE_V=q8_0   # Value cache: f16, q8_0, q4_0
  - GGUF_N_THREADS=0         # CPU threads: 0=auto
```

> A subset of these (context window, GPU toggle, KV cache quality) are also adjustable from the Runtime Manager UI. Env vars serve as system defaults; UI changes apply per-session.

### Configuration File

Create `backend/config.yaml` for advanced configuration:

```yaml
server:
  host: "0.0.0.0"
  port: 7070
  reload: true

database:
  url: "sqlite:///./data/app.db"
  echo: false

security:
  jwt_secret_path: ".secrets/jwt_secret"
  allowed_origins:
    - "http://localhost:5177"
    - "http://localhost:7070"

llm:
  default_model: "gpt-4o-mini"
  temperature: 0.7
```

## Common Tasks

### Download a GGUF Model

1. Go to Settings → Models
2. Click "Download Model"
3. Enter HuggingFace URL or search for a model
4. Monitor download progress in real-time
5. Once downloaded, the model will appear in chat model selection

### Upload Files for Context

1. Drag and drop files into the chat area
2. Supported formats:
   - **Images**: PNG, JPG, WebP (OCR text will be extracted)
   - **Documents**: PDF, DOCX (text content will be extracted)
3. Files are automatically added to conversation context

### Enable Real-time Streaming

1. Toggle "Deep Thinking" mode in chat settings
2. Send a message
3. Watch the AI think step-by-step
4. You can stop generation at any time

## Troubleshooting Common Issues

### "Backend not responding"

```bash
# Check if backend is running
curl http://localhost:7070/health

# If not, start it:
cd backend && uvicorn app.main:app --host 0.0.0.0 --port 7070 --reload
```

### "Frontend not loading"

```bash
# Check if frontend dev server is running
curl http://localhost:5177

# If not, start it:
cd frontend && npm run dev
```

### "Database errors"

```bash
# Delete and recreate database
rm -f backend/data/app.db
cd backend && python -c "from app.database import init_db; init_db()"
```

### "Port already in use"

```bash
# Find and kill process using port 7070 or 5177
lsof -ti:7070 | xargs kill -9
lsof -ti:5177 | xargs kill -9
```

## Next Steps

- Read the [Features](./features.md) documentation to learn about all capabilities
- Check the [API Reference](./api-reference.md) for integration options
- See [Deployment](./deployment.md) for production setup
- Review [Contributing](./contributing.md) if you want to help improve LM WebUI

## Need Help?

- Check the [Troubleshooting](./troubleshooting.md) guide
- Join [GitHub Discussions](https://github.com/lm-webui/lm-webui/discussions)
- Open an [Issue](https://github.com/lm-webui/lm-webui/issues) for bugs
- Review the [FAQ](#) for common questions
