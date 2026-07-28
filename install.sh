#!/bin/bash

# LM WebUI - One-Line Installation Script
# Usage: curl -sSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Banner
print_banner() {
    # Try to extract version from package.json if it exists
    local version="v1"
    if [ -f "package.json" ]; then
        version="v$(grep '"version":' package.json | cut -d'"' -f4)"
    elif [ -f "LM-WebUI/package.json" ]; then
        version="v$(grep '"version":' LM-WebUI/package.json | cut -d'"' -f4)"
    fi

    echo -e "${BLUE}"
    cat << EOF
██       ███     ███     ██      ██ ███████ ███████  ██    ██ ██
██       ████   ████     ██      ██ ██      ██    ██ ██    ██ ██
██       ██ ██ ██ ██     ██  ██  ██ █████   ███████  ██    ██ ██
██       ██  ███  ██     ██ ████ ██ ██      ██    ██ ██    ██ ██
 ███████ ██       ██      ███  ███  ███████ ███████   ██████  ██

$version - All-in-one LLM Runtime & AI Interface
https://lmwebui.com
EOF
    echo -e "${NC}"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        log_info "Visit: https://docs.docker.com/get-docker/"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose."
        log_info "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_warning "Docker daemon is not accessible. Attempting to fix permissions..."
        
        # Check if user is in docker group
        if groups | grep -q '\bdocker\b'; then
            log_error "User is in docker group but still cannot access Docker. Try restarting your terminal session."
            exit 1
        fi
        
        # Try to add user to docker group
        log_info "Adding user to docker group..."
        if sudo usermod -aG docker $USER 2>/dev/null; then
            log_success "Added to docker group!"
            log_info "Please log out and log back in, or run: newgrp docker"
            log_info "Alternatively, re-run this script with: newgrp docker"
            
            # Try with newgrp in a subshell
            if newgrp docker -c "docker info" &>/dev/null; then
                log_success "Docker is now accessible!"
            else
                log_error "Could not access Docker after group change."
                log_info "Please log out and log back in, then run the installer again."
                exit 1
            fi
        else
            log_error "Failed to add user to docker group."
            log_info "Try running with sudo: curl -sSL https://raw.githubusercontent.com/lm-webui/lm-webui/main/install.sh | sudo bash"
            exit 1
        fi
    fi
    
    log_success "All prerequisites satisfied"
}

# Create environment configuration
setup_environment() {
    log_info "Setting up environment..."
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# LM WebUI Environment Configuration

# Server Configuration
# The container publishes port 7070 from its internal port 8000.

# Application container paths
APP_ENVIRONMENT=production
APP_PATHS_DATA_DIR=/backend/data
APP_PATHS_MEDIA_DIR=/backend/media
# Optional host runtime endpoint
# APP_RUNTIME_DEFAULT_ENDPOINT=http://host.docker.internal:11434
EOF
        log_success "Created .env file with template configuration"
    log_info "Use the application settings for provider API keys and Runtime Manager for external runtimes"
    else
        log_info ".env file already exists"
    fi
    
    # Create required persistent directories
    mkdir -p ./.lmwebui/models
    mkdir -p ./backend/rag/embed ./backend/rag/ocr ./backend/rag/rerank ./backend/rag/vision
    mkdir -p ./backend/data/sql_db ./backend/data/qdrant_db ./backend/data/memory
    mkdir -p ./backend/media/generated ./backend/media/uploads
    mkdir -p ./.lmwebui/.secrets
    
    log_info "Created required data and model directories"
    
    log_info "Data and media use Docker volumes; models use ./.lmwebui/models"
}

# Clone or use existing repository
setup_repository() {
    log_info "Setting up repository..."
    
    # Check if we're already in the installation directory
    if [ -f "docker-compose.yml" ] && [ -f "Dockerfile" ]; then
        log_info "Already in installation directory"
        return
    fi
    
    # Check if directory exists
    if [ -d "LM-WebUI" ]; then
        log_info "LM-WebUI directory already exists"
        cd LM-WebUI
        return
    fi
    
    # Clone repository into LM-WebUI folder
    log_info "Cloning LM-WebUI repository..."
    git clone https://github.com/lm-webui/lm-webui.git LM-WebUI
    cd LM-WebUI
    log_success "Repository cloned successfully"
}

# Build and start the application
start_application() {
    log_info "Starting LM WebUI..."
    docker compose up -d --build
    
    # Wait for application to start
    log_info "Waiting for application to start..."
    sleep 10
    
    # Check health
    for attempt in {1..30}; do
        if curl -fsS http://localhost:7070/api/health | grep -q '"ready":true'; then
            log_success "LM WebUI is running and healthy!"
            return
        fi
        sleep 2
    done
    log_error "LM WebUI did not become ready. Check: docker compose logs -f"
    exit 1
}

# Display final instructions
show_instructions() {
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}🚀 LM WebUI Installation Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}Access the application:${NC}"
    echo -e "  • Frontend: ${YELLOW}http://localhost:7070${NC}"
    echo -e "  • API Docs: ${YELLOW}http://localhost:7070/docs${NC}"
    echo ""
    echo -e "${BLUE}Management commands:${NC}"
    echo -e "  • Stop: ${YELLOW}docker compose down${NC}"
    echo -e "  • View logs: ${YELLOW}docker compose logs -f${NC}"
    echo -e "  • Restart: ${YELLOW}docker compose restart${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Open ${YELLOW}http://localhost:7070${NC} in your browser"
    echo -e "  2. Install the optional host CLI: ${YELLOW}python -m pip install -e cli${NC}"
    echo -e "  3. Place GGUF models in ${YELLOW}./.lmwebui/models/${NC} for local inference"
    echo ""
    echo -e "${BLUE}Useful directories:${NC}"
    echo -e "  • Models: ${YELLOW}./.lmwebui/models/${NC} (mounted to container)"
    echo -e "  • Data: ${YELLOW}Docker volume (lm-webui_app_data)${NC}"
    echo -e "  • Media: ${YELLOW}Docker volume (lm-webui_app_media)${NC}"
    echo -e "  • Config: ${YELLOW}./backend/config.yaml${NC}"
    echo -e "  • Secrets: ${YELLOW}./.lmwebui/.secrets/${NC}"
    echo ""
    echo -e "${GREEN}Enjoy your local AI assistant! 🤖${NC}"
    echo ""
}

# Main installation process
main() {
    print_banner
    log_info "Starting LM WebUI installation..."
    
    # Check prerequisites
    check_prerequisites
    
    # Setup repository
    setup_repository
    
    # Setup environment
    setup_environment
    
    # Start application
    start_application
    
    # Show instructions
    show_instructions
}

# Handle script interruption
cleanup() {
    log_warning "Installation interrupted"
    exit 1
}

# Set trap for cleanup
trap cleanup INT TERM

# Run main function
main
