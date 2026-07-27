#!/bin/bash
set -e

echo "🚀 Starting LM-WebUI..."

# Create writable application directories; runtimes are installed outside this container.
mkdir -p /backend/data /backend/models /backend/media/generated/images /backend/media/generated/documents /backend/media/uploads

exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1
