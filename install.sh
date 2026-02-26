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

# Check for NVIDIA GPU
check_gpu() {
    log_info "Checking for GPU support..."
    
    # Check for NVIDIA
    if command -v nvidia-smi &> /dev/null; then
        # Check for driver mismatch (common update issue)
        if nvidia-smi 2>&1 | grep -q "Driver/library version mismatch"; then
            log_error "NVIDIA driver/library version mismatch detected!"
            log_info "This usually happens after a driver update. Please reboot your system and try again."
            exit 1
        fi
        
        log_success "NVIDIA GPU detected"
        HAS_NVIDIA_GPU=true
        HAS_AMD_GPU=false
        HAS_INTEL_GPU=false
    elif command -v rocm-smi &> /dev/null; then
        log_success "AMD GPU detected"
        HAS_NVIDIA_GPU=false
        HAS_AMD_GPU=true
        HAS_INTEL_GPU=false
    elif command -v clinfo &> /dev/null && clinfo | grep -q "Intel.*Graphics"; then
        log_success "Intel GPU detected"
        HAS_NVIDIA_GPU=false
        HAS_AMD_GPU=false
        HAS_INTEL_GPU=true
    else
        log_info "No supported GPU detected - using CPU mode"
        HAS_NVIDIA_GPU=false
        HAS_AMD_GPU=false
        HAS_INTEL_GPU=false
    fi
    
    # Check for Apple Silicon (macOS)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ARCH=$(uname -m)
        if [[ "$ARCH" == "arm64" ]]; then
            log_info "Apple Silicon (ARM64) detected"
            # Note: Docker on macOS doesn't support Metal acceleration in containers
            log_warning "Metal acceleration is not available in Docker containers on macOS"
            log_info "For best performance on Apple Silicon, consider native installation"
        fi
    fi
}

# Create environment configuration
setup_environment() {
    log_info "Setting up environment..."
    
    # Create .env file if it doesn't exist
    if [ ! -f ".env" ]; then
        cat > .env << EOF
# LM WebUI Environment Configuration

# Local Models Directory
LOCAL_MODELS_DIR=./backend/models

# Server Configuration
PORT=7070
HOST=0.0.0.0

# Data Persistence
DATA_DIR=./data
MEDIA_DIR=./media
EOF
        log_success "Created .env file with template configuration"
        log_info "Edit .env to add your API keys for cloud models"
    else
        log_info ".env file already exists"
    fi
    
    # Create required persistent directories
    mkdir -p ./backend/models
    mkdir -p ./backend/rag/embed ./backend/rag/ocr ./backend/rag/rerank ./backend/rag/vision
    mkdir -p ./backend/data/sql_db ./backend/data/qdrant_db ./backend/data/memory
    mkdir -p ./backend/media/generated ./backend/media/uploads
    mkdir -p ./backend/.secrets
    
    log_info "Created required data and model directories"
    
    # Note: Docker uses volumes for data and media, not host directories
    log_info "Docker volumes will be created automatically for data and media storage"
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
    
    # Check if containers are already running
    if docker compose ps 2>/dev/null | grep -q "lm-webui"; then
        log_warning "LM WebUI is already running. Restarting..."
        docker compose down
    fi
    
    # Detect GPU and use appropriate image
    log_info "Detecting GPU for optimal image..."
    GPU_IMAGE=""
    
    if command -v nvidia-smi &> /dev/null; then
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        log_info "NVIDIA GPU detected: $GPU_NAME"
        GPU_VARIANT="cuda"
        
        # Check if nvidia-container-toolkit is installed
        if ! command -v nvidia-ctk &> /dev/null; then
            log_warning "NVIDIA Container Toolkit not found!"
            log_info "Installing NVIDIA Container Toolkit using official repository..."
            
            # Official NVIDIA Container Toolkit installation
            curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
              && curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
                sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
                sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
            
            sudo apt-get update
            sudo apt-get install -y nvidia-container-toolkit
            
            # Configure Docker runtime using nvidia-ctk
            log_info "Configuring NVIDIA Container Runtime..."
            sudo nvidia-ctk runtime configure --runtime=docker
            
            # Restart Docker to apply changes
            if command -v systemctl &> /dev/null; then
                sudo systemctl restart docker
            else
                log_warning "Systemd not found. Please restart Docker manually."
            fi
            
            log_success "NVIDIA Container Toolkit installed and configured!"
        else
            log_info "NVIDIA Container Toolkit (nvidia-ctk) is already installed"
        fi
    elif [[ "$OSTYPE" == "darwin*" ]] && [[ "$(uname -m)" == "arm64" ]]; then
        log_info "Apple Silicon detected (Metal)"
        log_warning "Note: Metal acceleration requires native installation, not Docker"
        GPU_VARIANT="metal"
    elif command -v rocm-smi &> /dev/null; then
        log_info "AMD GPU detected (ROCm)"
        GPU_VARIANT="rocm"
    elif command -v clinfo &> /dev/null && clinfo | grep -q "Intel.*Graphics"; then
        log_info "Intel GPU detected (SYCL)"
        GPU_VARIANT="sycl"
    else
        log_info "No GPU detected - using CPU image"
        GPU_VARIANT="cpu"
    fi
    
    # Check if pre-built images are available on GHCR
    GHCR_IMAGE="ghcr.io/lm-webui/lm-webui:$GPU_VARIANT-latest"
    
    # Try to pull pre-built image first (faster)
    log_info "Downloading pre-built image from GHCR (this may take a while)..."
    if docker pull "$GHCR_IMAGE"; then
        log_success "Pulled pre-built image: $GHCR_IMAGE"
        # Use pulled image instead of building
        export IMAGE_NAME="$GHCR_IMAGE"
        
        # Determine compose files based on GPU
        COMPOSE_FILES="-f docker-compose.yml"
        if [ "$GPU_VARIANT" == "cuda" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.cuda.yml"
        elif [ "$GPU_VARIANT" == "rocm" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.rocm.yml"
        elif [ "$GPU_VARIANT" == "sycl" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.sycl.yml"
        fi
        
        # We use env variable to override image in compose if needed, but the override files 
        # already point to the correct ghcr.io images.
        docker compose $COMPOSE_FILES up -d
    else
        log_info "Pre-built image not available locally or on registry, building..."
        
        # Fall back to local build
        # Determine compose files based on GPU
        COMPOSE_FILES="-f docker-compose.yml"
        if [ "$GPU_VARIANT" == "cuda" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.cuda.yml"
        elif [ "$GPU_VARIANT" == "rocm" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.rocm.yml"
        elif [ "$GPU_VARIANT" == "sycl" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.sycl.yml"
        elif [ "$GPU_VARIANT" == "metal" ]; then
            COMPOSE_FILES="$COMPOSE_FILES -f docker/docker-compose.metal.yml"
        fi

        docker compose $COMPOSE_FILES build
        docker compose $COMPOSE_FILES up -d
    fi
    
    # Wait for application to start
    log_info "Waiting for application to start..."
    sleep 10
    
    # Check health
    if curl -s http://localhost:7070/api/health > /dev/null; then
        log_success "LM WebUI is running and healthy!"
    else
        log_warning "Application is starting up... health check may take a moment"
        sleep 10
    fi
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
    echo -e "  • Stop: ${YELLOW}docker-compose down${NC}"
    echo -e "  • View logs: ${YELLOW}docker-compose logs -f${NC}"
    echo -e "  • Restart: ${YELLOW}docker-compose restart${NC}"
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo -e "  1. Open ${YELLOW}http://localhost:7070${NC} in your browser"
    echo -e "  2. Add API keys to ${YELLOW}.env${NC} file for cloud models"
    echo -e "  3. Place GGUF models in ${YELLOW}./backend/models/${NC} for local inference"
    echo ""
    echo -e "${BLUE}Useful directories:${NC}"
    echo -e "  • Models: ${YELLOW}./backend/models/${NC} (mounted to container)"
    echo -e "  • Data: ${YELLOW}Docker volume (lm-webui_app_data)${NC}"
    echo -e "  • Media: ${YELLOW}Docker volume (lm-webui_app_media)${NC}"
    echo -e "  • Config: ${YELLOW}./backend/config.yaml${NC}"
    echo -e "  • Secrets: ${YELLOW}./backend/.secrets/${NC}"
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
    
    # Check GPU
    check_gpu
    
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
