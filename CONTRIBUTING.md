# Contributing to LM WebUI

Thank you for your interest in contributing to LM WebUI! This document provides guidelines and instructions for contributing to the project.

> 🔒 **Security**: If you believe you've found a security vulnerability, **do not** open a public issue or PR.
> Follow the [Security Policy](./SECURITY.md) and report it privately (GitHub private vulnerability reporting or
> security@lmwebui.com). Read it before submitting any auth, SSRF, injection, or secret-handling changes.

## Your First Contribution

New here? Here's the fastest path to a useful contribution:

1. **Find a good first task** — look for issues labeled `good first issue` or `help wanted`, or pick a
   documentation/typo fix to get familiar with the flow.
2. **Understand the architecture** — skim [`docs/architecture.md`](./docs/architecture.md) and the repo
   structure below so your change fits the existing patterns (providers, capabilities, routes).
3. **Set up the environment** (see [Development Setup](#development-setup)).
4. **Make a small change** on a `feature/` or `bugfix/` branch, run the checks below, and open a PR.

If you get stuck, see [Getting Help](#getting-help).

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful and considerate of others.

## Getting Started

### Prerequisites

- Node.js 20+ (for frontend development)
- Python 3.12 (standardized version for backend development)
- Docker and Docker Compose (for containerized development)
- Git

### Development Setup

1. **Fork the repository** on GitHub
2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/lm-webui/lm-webui.git
   cd lm-webui
   ```

3. **Set up the development environment**:

   ```bash
   # Using Docker (recommended)
   docker compose up --build

   # Or manually
   # Frontend
   cd web
   npm install

   # Backend
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   pip install -r requirements.txt

   # Start both backend and frontend
   cd ..
   npm run dev
   ```

## Development Workflow

### 1. Branch Naming Convention

- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Critical production fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Test additions/improvements

### 2. Commit Messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `style:` Code style changes (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Test additions/modifications
- `chore:` Maintenance tasks

Example:

```
feat: add hardware acceleration detection
fix: resolve WebSocket streaming issue
docs: update installation instructions
```

### 3. Pull Request Process

1. Create a new branch from `main`
2. Make your changes with clear commit messages
3. Ensure all tests pass
4. Update documentation if needed
5. Submit a Pull Request with a clear description

## Project Structure

```
lm-webui/
├── web/                  # React 19 + TypeScript frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI components (shadcn/ui + custom)
│   │   ├── features/     # Domain logic (chat, images, models, sessions)
│   │   ├── store/        # Zustand state
│   │   └── utils/        # API client, providers
├── backend/              # FastAPI backend
│   ├── app/
│   │   ├── routes/       # REST + WebSocket endpoints
│   │   ├── services/     # Business logic
│   │   ├── providers/    # AI providers (remote + local)
│   │   ├── orchestrator/ # Chat flow controller
│   │   ├── modality/     # Intent classifier + planner (Smart-Modality)
│   │   ├── capabilities/ # Capability executor (chat, vision, RAG, search, image)
│   │   ├── runtime/      # Runtime detection + vision_runtime (llama-server)
│   │   └── hardware/     # Hardware abstraction
├── docs/                 # Documentation
└── install.sh            # One-line installer
```

## Running Checks

```bash
# Frontend (from repo root or web/)
cd web
npm run typecheck   # TypeScript checks
npm run lint        # ESLint
npm run test        # Vitest unit tests

# Backend
cd backend
source .venv/bin/activate
pytest              # Backend tests
python -m compileall app   # Syntax check
```

Run these before opening a PR — CI runs them too.

## Coding Standards

### Frontend (TypeScript/React)

- Use TypeScript strict mode
- Follow React hooks rules
- Use functional components
- Implement proper error boundaries
- Write unit tests with Vitest

### Backend (Python/FastAPI)

- Follow PEP 8 style guide
- Use type hints
- Write docstrings for public functions
- Implement proper error handling
- Write tests with pytest

### Testing

- Write tests for new features
- Maintain test coverage > 80%
- Include integration tests for critical paths
- Test edge cases and error conditions

## Documentation

### Code Documentation

- Document public APIs
- Include examples for complex functions
- Update README.md for user-facing changes
- Keep architecture.md up to date

### API Documentation

- Use OpenAPI/Swagger annotations
- Document request/response schemas
- Include authentication requirements
- Provide example requests

## Issue Reporting

### Bug Reports

When reporting bugs, include:

1. Clear description of the issue
2. Steps to reproduce
3. Expected vs actual behavior
4. Environment details (OS, browser, versions)
5. Relevant logs or error messages

### Feature Requests

When requesting features, include:

1. Use case description
2. Expected behavior
3. Potential implementation approach
4. Related issues or references

## Review Process

1. **Code Review**: All PRs require at least one review
2. **CI Checks**: PRs must pass all CI checks
3. **Testing**: New code must include tests
4. **Documentation**: Updates must include documentation

## Getting Help

- Check the [documentation](./docs/) (getting-started, architecture, features, troubleshooting)
- Search existing issues before opening a new one
- If the dev server won't start, check `docs/troubleshooting.md` ("Backend not responding", "Frontend not
  loading")
- For security matters, follow [SECURITY.md](./SECURITY.md) — never file these publicly
- Contact maintainers for critical issues

## Recognition

Contributors will be recognized in:

- GitHub contributors list
- Release notes
- Project documentation
- [CHANGELOG](./CHANGELOG.md)

Thank you for contributing to LM WebUI! 🚀
