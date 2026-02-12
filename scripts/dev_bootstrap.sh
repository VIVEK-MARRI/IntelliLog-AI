#!/bin/bash

# =============================================================================
# IntelliLog-AI Development Bootstrap Script
# =============================================================================
# This script sets up your local development environment in ~5 minutes
# Run: ./scripts/dev_bootstrap.sh
# =============================================================================

set -e  # Exit on error

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

# ASCII Banner
print_banner() {
    echo -e "${BLUE}"
    cat << "EOF"
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ___       _       _ _ _    _                  _        ║
║  |_ _|_ __ | |_ ___| | (_)  | |    ___   __ _ (_)       ║
║   | || '_ \| __/ _ \ | | |  | |   / _ \ / _` || |       ║
║   | || | | | ||  __/ | | |  | |__| (_) | (_| || |       ║
║  |___|_| |_|\__\___|_|_|_|  |_____\___/ \__, ||_|       ║
║                                          |___/            ║
║                                                           ║
║       Development Environment Bootstrap                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
EOF
    echo -e "${NC}"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Step 1: System Requirements Check
check_requirements() {
    log_info "Checking system requirements..."
    
    local missing_deps=()
    
    # Check Python 3.10+
    if command_exists python3; then
        PYTHON_VERSION=$(python3 --version | awk '{print $2}')
        log_success "Python $PYTHON_VERSION detected"
    else
        log_error "Python 3.10+ is required but not found"
        missing_deps+=("python3")
    fi
    
    # Check PostgreSQL
    if command_exists psql; then
        log_success "PostgreSQL detected"
    else
        log_warning "PostgreSQL not found (will need Docker or manual install)"
    fi
    
    # Check Redis
    if command_exists redis-cli; then
        log_success "Redis detected"
    else
        log_warning "Redis not found (will need Docker or manual install)"
    fi
    
    # Check Docker (optional but recommended)
    if command_exists docker; then
        log_success "Docker detected"
        DOCKER_AVAILABLE=true
    else
        log_warning "Docker not found (optional but recommended for databases)"
        DOCKER_AVAILABLE=false
    fi
    
    # Check Node.js (for frontend)
    if command_exists node; then
        NODE_VERSION=$(node --version)
        log_success "Node.js $NODE_VERSION detected"
    else
        log_warning "Node.js not found (needed for frontend development)"
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        log_error "Missing required dependencies: ${missing_deps[*]}"
        log_info "Please install them and run this script again"
        exit 1
    fi
}

# Step 2: Create Python Virtual Environment
setup_venv() {
    log_info "Setting up Python virtual environment..."
    
    if [ -d "venv" ]; then
        log_warning "Virtual environment already exists, skipping creation"
    else
        python3 -m venv venv
        log_success "Virtual environment created"
    fi
    
    # Activate venv
    source venv/bin/activate
    log_success "Virtual environment activated"
    
    # Upgrade pip
    log_info "Upgrading pip..."
    pip install --upgrade pip setuptools wheel --quiet
    log_success "Pip upgraded"
}

# Step 3: Install Python Dependencies
install_dependencies() {
    log_info "Installing Python dependencies (this may take 2-3 minutes)..."
    
    if [ -f "requirements.txt" ]; then
        pip install -r requirements.txt --quiet
        log_success "Python dependencies installed"
    else
        log_error "requirements.txt not found"
        exit 1
    fi
}

# Step 4: Setup Environment Configuration
setup_env() {
    log_info "Setting up environment configuration..."
    
    if [ -f ".env" ]; then
        log_warning ".env file already exists, skipping"
        log_info "Review .env.example for any new configuration options"
    else
        if [ -f ".env.example" ]; then
            cp .env.example .env
            log_success ".env file created from template"
            log_warning "IMPORTANT: Update .env with your actual credentials before running services"
        else
            log_error ".env.example not found"
            exit 1
        fi
    fi
}

# Step 5: Start Database Services (Docker)
start_databases() {
    if [ "$DOCKER_AVAILABLE" = true ]; then
        log_info "Starting database services with Docker..."
        
        # Check if docker-compose.yml exists
        if [ -f "docker-compose.yml" ]; then
            # Start only database services (not the full stack)
            docker-compose up -d postgres redis
            log_success "PostgreSQL and Redis started"
            log_info "Waiting 5 seconds for databases to initialize..."
            sleep 5
        else
            log_warning "docker-compose.yml not found, skipping Docker services"
        fi
    else
        log_warning "Docker not available - please start PostgreSQL and Redis manually"
        log_info "PostgreSQL: brew install postgresql (Mac) or apt install postgresql (Linux)"
        log_info "Redis: brew install redis (Mac) or apt install redis (Linux)"
    fi
}

# Step 6: Initialize Database
init_database() {
    log_info "Initializing database schema..."
    
    # Check if alembic is available
    if command_exists alembic; then
        # Run migrations
        log_info "Running Alembic migrations..."
        alembic upgrade head
        log_success "Database schema initialized"
    else
        log_warning "Alembic not found in PATH, trying with python -m"
        python -m alembic upgrade head
        log_success "Database schema initialized"
    fi
}

# Step 7: Seed Database with Sample Data
seed_database() {
    log_info "Seeding database with sample data..."
    
    if [ -f "scripts/seed_db.py" ]; then
        python scripts/seed_db.py
        log_success "Database seeded with sample data"
    else
        log_warning "Seed script not found, skipping data seeding"
    fi
}

# Step 8: Download/Train Initial ML Model
setup_ml_models() {
    log_info "Setting up ML models..."
    
    # Check if models directory exists
    if [ ! -d "models" ]; then
        mkdir -p models
        log_success "Models directory created"
    fi
    
    # Check if a trained model already exists
    if [ -f "models/latest_version.json" ]; then
        log_success "ML model already exists"
    else
        log_info "No trained model found. Training initial model..."
        
        if [ -f "scripts/train_model_production.py" ]; then
            # Check if training data exists
            if [ -f "data/processed/training_data_enhanced.csv" ]; then
                python scripts/train_model_production.py
                log_success "Initial ML model trained"
            else
                log_warning "Training data not found. Skipping model training."
                log_info "Run: python scripts/train_model_production.py manually after adding data"
            fi
        else
            log_warning "Training script not found, skipping"
        fi
    fi
}

# Step 9: Install Frontend Dependencies (optional)
setup_frontend() {
    log_info "Setting up frontend..."
    
    if [ -d "src/frontend" ]; then
        cd src/frontend
        
        if command_exists npm; then
            log_info "Installing frontend dependencies..."
            npm install --silent
            log_success "Frontend dependencies installed"
        else
            log_warning "npm not found, skipping frontend setup"
        fi
        
        cd ../..
    else
        log_warning "Frontend directory not found, skipping"
    fi
}

# Step 10: Health Check
health_check() {
    log_info "Running health checks..."
    
    # Check if PostgreSQL is accessible
    if psql -h localhost -U intellog_user -d intellog_db -c '\q' 2>/dev/null; then
        log_success "PostgreSQL connection: OK"
    else
        log_warning "PostgreSQL connection: FAILED (check credentials in .env)"
    fi
    
    # Check if Redis is accessible
    if redis-cli -h localhost ping 2>/dev/null | grep -q PONG; then
        log_success "Redis connection: OK"
    else
        log_warning "Redis connection: FAILED"
    fi
}

# Step 11: Print Next Steps
print_next_steps() {
    echo ""
    log_success "Development environment setup complete! 🎉"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}Next Steps:${NC}"
    echo ""
    echo "  1. Activate virtual environment:"
    echo -e "     ${BLUE}source venv/bin/activate${NC}"
    echo ""
    echo "  2. Start the API server:"
    echo -e "     ${BLUE}cd src/backend && python -m app.main${NC}"
    echo "     or"
    echo -e "     ${BLUE}uvicorn src.backend.app.main:app --reload --host 0.0.0.0 --port 8000${NC}"
    echo ""
    echo "  3. Start the frontend (in another terminal):"
    echo -e "     ${BLUE}cd src/frontend && npm run dev${NC}"
    echo ""
    echo "  4. Start Celery worker (for background tasks):"
    echo -e "     ${BLUE}celery -A src.backend.worker.celery_app worker --loglevel=info${NC}"
    echo ""
    echo "  5. Start Celery Beat (for scheduled tasks):"
    echo -e "     ${BLUE}celery -A src.backend.worker.celery_app beat --loglevel=info${NC}"
    echo ""
    echo "  6. Access the application:"
    echo -e "     API: ${BLUE}http://localhost:8000${NC}"
    echo -e "     Docs: ${BLUE}http://localhost:8000/docs${NC}"
    echo -e "     Frontend: ${BLUE}http://localhost:3000${NC}"
    echo ""
    echo -e "${GREEN}═══════════════════════════════════════════════════════════${NC}"
    echo ""
    echo -e "${YELLOW}Documentation:${NC}"
    echo "  - README.md - Project overview"
    echo "  - docs/ML_SYSTEM.md - ML architecture"
    echo "  - docs/LEARNING_SYSTEM.md - Continuous learning"
    echo "  - docs/BUSINESS_STRATEGY.md - Go-to-market strategy"
    echo ""
    echo -e "${YELLOW}Troubleshooting:${NC}"
    echo "  - Database issues: Check docker-compose logs or .env credentials"
    echo "  - Import errors: Ensure venv is activated"
    echo "  - Port conflicts: Change ports in .env file"
    echo ""
}

# Main execution
main() {
    print_banner
    
    log_info "Starting development environment setup..."
    log_info "This will take approximately 5 minutes"
    echo ""
    
    check_requirements
    echo ""
    
    setup_venv
    echo ""
    
    install_dependencies
    echo ""
    
    setup_env
    echo ""
    
    start_databases
    echo ""
    
    init_database
    echo ""
    
    seed_database
    echo ""
    
    setup_ml_models
    echo ""
    
    setup_frontend
    echo ""
    
    health_check
    echo ""
    
    print_next_steps
}

# Run main function
main
