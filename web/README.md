# LM-WebUI Frontend

Modern React/TypeScript frontend for the LM-WebUI AI chat interface with real-time streaming, multimodal support, and interactive reasoning display.

## Quick Start

### Prerequisites

- Node.js 16+ and npm/yarn
- Backend running (see [backend README](../backend/README.md))

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev          # Start dev server (http://localhost:5178)
npm run build        # Build for production
npm run preview      # Preview production build
npm run lint         # Run ESLint
npm run type-check   # TypeScript type checking
```

### Configuration

Create `.env` file:

```env
VITE_BACKEND_URL=http://localhost:8000
VITE_API_TIMEOUT=30000
VITE_WEBSOCKET_RECONNECT_ATTEMPTS=3
```

## Key Features

- **Real-Time Streaming**: Interactive reasoning display with WebSocket streaming
- **Multi-Provider Support**: OpenAI, Claude, Gemini, Grok, DeepSeek
- **Multimodal Intelligence**: Image/document upload with OCR and analysis
- **RAG Integration**: Context-aware conversations with file integration
- **Hardware Acceleration**: Adaptive UI based on system capabilities
- **Dark Theme**: Responsive design with mobile support

## Project Structure

```
frontend/
├── src/
│   ├── main.tsx                    # Application entry point
│   ├── App.tsx                     # Main application component
│   ├── components/                 # Reusable UI components
│   ├── pages/                      # Page-level components
│   ├── services/                   # Service layer (API, WebSocket)
│   ├── contexts/                   # React contexts (Auth, Chat)
│   ├── hooks/                      # Custom React hooks
│   ├── utils/                      # Utility functions
│   ├── types/                      # TypeScript type definitions
│   └── lib/                        # Library utilities
├── public/                         # Static assets
├── package.json                    # Dependencies and scripts
├── tsconfig.json                   # TypeScript configuration
├── vite.config.ts                  # Vite build configuration
└── tailwind.config.ts              # Tailwind CSS configuration
```

## Testing

```bash
npm run test        # Run Vitest unit tests
npm run test:ui     # Run component tests with @testing-library/react
npm run test:e2e    # Run Playwright E2E tests (if configured)
```

## Deployment

### Production Build

```bash
npm run build
```

The build output is in `dist/` directory. Deploy to any static hosting service (Netlify, Vercel, S3, etc.).

### Docker Deployment

```dockerfile
FROM node:16-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
```

## Documentation

For detailed documentation on features, architecture, and API usage, see:

- **[Main Documentation](../README.md)** - Project overview and features
- **[Features Documentation](../docs/features.md)** - Comprehensive feature details
- **[API Reference](../docs/api-reference.md)** - Complete API documentation
- **[Installation Guide](../docs/installation.md)** - Detailed setup instructions

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Install dependencies: `npm install`
4. Make changes with tests
5. Run tests: `npm run test`
6. Commit changes: `git commit -m 'Add amazing feature'`
7. Push branch: `git push origin feature/amazing-feature`
8. Create Pull Request

## License

See [LICENSE](../LICENSE) file for details.
