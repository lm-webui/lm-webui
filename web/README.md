# LM-WebUI Frontend

React + TypeScript frontend for LM-WebUI. Real-time streaming chat, multimodal support, image studio, and interactive rendering (code, Mermaid, tables).

- **Runtime**: Node.js ≥ 20
- **Dev server**: Vite, port `5177` (proxies `/api` and `/ws` to the backend on `7070`)

## Quick Start

Prereq: backend running (see [`../backend/README.md`](../backend/README.md)).

```bash
cd web
npm install
npm run dev        # http://localhost:5177
```

### Configuration

Copy `.env.example` or create `.env`:

```env
VITE_BACKEND_URL=http://localhost:7070
```

## Scripts

| Command | Function |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript type checking (`tsc`) |
| `npm run lint` / `lint:fix` | ESLint |
| `npm run format` / `format:check` | Prettier |
| `npm run test` | Vitest unit tests |
| `npm run test:ui` | Vitest interactive UI |
| `npm run test:coverage` | Vitest with coverage |
| `npm run clean` | Remove `dist/` |

## Features

- **Chat**: multi-provider streaming, code highlighting, Mermaid diagrams, tables, markdown, conversations
- **Multimodal**: image/document upload with analysis and OCR citation
- **RAG context**: file-backed, context-aware answers
- **Image Studio**: prompt, size, quality, seed controls + gallery
- **Models**: GGUF / MLX download & management UI
- **Projects**: grouped conversations with reusable system prompts
- **Artifacts**: versioned document storage
- **Hardware-aware**: adaptive UI; dark theme, responsive

## Project Structure

```
web/
├── src/
│   ├── main.tsx              # Entry point
│   ├── App.tsx               # Root app component
│   ├── features/             # Feature modules (chat, models, files, projects, images, artifacts…)
│   ├── components/           # Reusable UI components
│   ├── pages/                # Page-level components
│   ├── api/                  # API client
│   ├── services/             # Service layer (streaming, WebSocket)
│   ├── contexts/             # React contexts (auth, chat)
│   ├── store/                # State
│   ├── hooks/                # Custom hooks
│   ├── config/               # App config
│   ├── lib/ / utils/         # Utilities
│   └── types/                # TypeScript types
├── public/                   # Static assets
├── vite.config.ts            # Vite + proxy config
├── tailwind.config.ts
└── tsconfig.json
```

## Deployment

Build for production, then serve `dist/` on any static host:

```bash
npm run build
```

The build is API-only; point it at the backend URL (e.g. via `VITE_BACKEND_URL`) at build time or serve it behind the backend.

## Links

- **Main project**: [github.com/lm-webui/lm-webui](https://github.com/lm-webui/lm-webui)
- **Docs**: [`../docs/`](../docs/) · **Issues**: [GitHub Issues](https://github.com/lm-webui/lm-webui/issues)
