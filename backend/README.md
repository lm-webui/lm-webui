# LM WebUI Backend - Quick Start

A high-performance FastAPI backend for AI model management, real-time streaming, and multimodal processing.

## 🚀 Quick Start

### Prerequisites

- Python 3.9+
- pip (Python package manager)
- Virtual environment (recommended)

### Installation

```bash
# Clone the repository (if not already done)
git clone https://github.com/lm-webui/lm-webui.git
cd lm-webui/backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Linux/macOS:
source venv/bin/activate
# Windows:
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create necessary directories
mkdir -p data .secrets

# Initialize database
python -c "from app.database import init_db; init_db()"
```

### Configuration

Create `.env` file:

```bash
BACKEND_HOST=0.0.0.0
BACKEND_PORT=8000
DATABASE_URL=sqlite:///./data/app.db
```

### Running the Backend

#### Development Mode (Recommended)

```bash
# From backend directory
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8008 --reload
```

#### Production Mode

```bash
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 7070
```

#### With Docker

```bash
# From project root
docker-compose up

# Or build individually
docker build -t lm-webui-backend .
docker run -p 8000:8000 lm-webui-backend
```

### Verify Installation

```bash
# Check health endpoint
curl http://localhost:8000/health
# Should return: {"status": "healthy", "auth": "jwt", "encryption": "fernet"}

# Check detailed health
curl http://localhost:8000/api/health
```

## 📖 Documentation

For detailed documentation, see the main project documentation:

- **[Main Documentation](../docs/)** - Complete documentation
- **[Features](../docs/features.md)** - All backend features
- **[API Reference](../docs/api-reference.md)** - Complete API documentation
- **[Installation](../docs/installation.md)** - Detailed installation guide

## 🔧 Key Features

- **Authentication**: JWT-based auth with refresh tokens
- **WebSocket Streaming**: Real-time token streaming with reasoning display
- **GGUF Model Management**: Complete GGUF runtime with HuggingFace integration
- **RAG System**: Retrieval-augmented generation with Qdrant vector store
- **Multimodal Processing**: Image/document upload with OCR and extraction
- **Hardware Acceleration**: Automatic CUDA/ROCm/Metal detection

## 🏗️ Project Structure

```
backend/
├── app/                    # Application code
│   ├── main.py            # FastAPI application entry point
│   ├── routes/            # API endpoints
│   ├── streaming/         # WebSocket streaming system
│   ├── rag/               # RAG pipeline
│   ├── gguf/              # GGUF model management
│   ├── security/          # Authentication & encryption
│   └── services/          # Business logic
├── tests/                 # Test suite
├── requirements.txt       # Python dependencies
└── config.yaml           # Configuration (optional)
```

## 🧪 Testing

```bash
# Install test dependencies
pip install -r requirements-test.txt

# Run tests
pytest

# Run with coverage
pytest --cov=app --cov-report=html
```

## 🔄 Development

### Adding New Endpoints

1. Create new router in `app/routes/`
2. Add business logic in `app/services/`
3. Include router in `app/main.py`

### Code Style

- Follow PEP 8 guidelines
- Use type hints
- Add docstrings for public functions
- Write tests for new features

## 🤝 Contributing

See the main [Contributing Guide](../docs/contributing.md) for details.

## 📄 License

MIT License - see [LICENSE](../LICENSE) file for details.

## 🔗 Links

- **Main Project**: [github.com/lm-webui/lm-webui](https://github.com/lm-webui/lm-webui)
- **Issues**: [GitHub Issues](https://github.com/lm-webui/lm-webui/issues)
- **Discussions**: [GitHub Discussions](https://github.com/lm-webui/lm-webui/discussions)
