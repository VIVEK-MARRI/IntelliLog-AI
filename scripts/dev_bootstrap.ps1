# =============================================================================
# IntelliLog-AI Development Bootstrap Script (Windows PowerShell)
# =============================================================================
# This script sets up your local development environment in ~5 minutes
# Run: .\scripts\dev_bootstrap.ps1
# =============================================================================

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Blue }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warning { Write-Host "[WARNING] $args" -ForegroundColor Yellow }
function Write-ErrorMsg { Write-Host "[ERROR] $args" -ForegroundColor Red }

# ASCII Banner
function Print-Banner {
    Write-Host @"

╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ___       _       _ _ _    _                  _        ║
║  |_ _|_ __ | |_ ___| | (_)  | |    ___   __ _ (_)       ║
║   | || '_ \| __/ _ \ | | |  | |   / _ \ / _` || |       ║
║   | || | | | ||  __/ | | |  | |__| (_) | (_| || |       ║
║  |___|_| |_|\__\___|_|_|_|  |_____\___/ \__, ||_|       ║
║                                          |___/            ║
║                                                           ║
║       Development Environment Bootstrap (Windows)        ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Cyan
}

# Check if command exists
function Test-CommandExists {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Step 1: System Requirements Check
function Test-Requirements {
    Write-Info "Checking system requirements..."
    
    $missingDeps = @()
    
    # Check Python 3.10+
    if (Test-CommandExists python) {
        $pythonVersion = python --version 2>&1
        Write-Success "Python detected: $pythonVersion"
    } else {
        Write-ErrorMsg "Python 3.10+ is required but not found"
        $missingDeps += "python"
    }
    
    # Check PostgreSQL
    if (Test-CommandExists psql) {
        Write-Success "PostgreSQL detected"
    } else {
        Write-Warning "PostgreSQL not found (will need Docker or manual install)"
    }
    
    # Check Redis
    if (Test-CommandExists redis-cli) {
        Write-Success "Redis detected"
    } else {
        Write-Warning "Redis not found (will need Docker or manual install)"
    }
    
    # Check Docker
    if (Test-CommandExists docker) {
        Write-Success "Docker detected"
        $script:dockerAvailable = $true
    } else {
        Write-Warning "Docker not found (optional but recommended for databases)"
        $script:dockerAvailable = $false
    }
    
    # Check Node.js
    if (Test-CommandExists node) {
        $nodeVersion = node --version
        Write-Success "Node.js detected: $nodeVersion"
    } else {
        Write-Warning "Node.js not found (needed for frontend development)"
    }
    
    if ($missingDeps.Count -gt 0) {
        Write-ErrorMsg "Missing required dependencies: $($missingDeps -join ', ')"
        Write-Info "Please install them and run this script again"
        exit 1
    }
}

# Step 2: Create Python Virtual Environment
function Setup-Venv {
    Write-Info "Setting up Python virtual environment..."
    
    if (Test-Path "venv") {
        Write-Warning "Virtual environment already exists, skipping creation"
    } else {
        python -m venv venv
        Write-Success "Virtual environment created"
    }
    
    # Activate venv
    Write-Info "Activating virtual environment..."
    & .\venv\Scripts\Activate.ps1
    Write-Success "Virtual environment activated"
    
    # Upgrade pip
    Write-Info "Upgrading pip..."
    python -m pip install --upgrade pip setuptools wheel --quiet
    Write-Success "Pip upgraded"
}

# Step 3: Install Python Dependencies
function Install-Dependencies {
    Write-Info "Installing Python dependencies (this may take 2-3 minutes)..."
    
    if (Test-Path "requirements.txt") {
        pip install -r requirements.txt --quiet
        Write-Success "Python dependencies installed"
    } else {
        Write-ErrorMsg "requirements.txt not found"
        exit 1
    }
}

# Step 4: Setup Environment Configuration
function Setup-Env {
    Write-Info "Setting up environment configuration..."
    
    if (Test-Path ".env") {
        Write-Warning ".env file already exists, skipping"
        Write-Info "Review .env.example for any new configuration options"
    } else {
        if (Test-Path ".env.example") {
            Copy-Item ".env.example" ".env"
            Write-Success ".env file created from template"
            Write-Warning "IMPORTANT: Update .env with your actual credentials before running services"
        } else {
            Write-ErrorMsg ".env.example not found"
            exit 1
        }
    }
}

# Step 5: Start Database Services (Docker)
function Start-Databases {
    if ($script:dockerAvailable) {
        Write-Info "Starting database services with Docker..."
        
        if (Test-Path "docker-compose.yml") {
            # Start only database services
            docker-compose up -d postgres redis
            Write-Success "PostgreSQL and Redis started"
            Write-Info "Waiting 5 seconds for databases to initialize..."
            Start-Sleep -Seconds 5
        } else {
            Write-Warning "docker-compose.yml not found, skipping Docker services"
        }
    } else {
        Write-Warning "Docker not available - please start PostgreSQL and Redis manually"
        Write-Info "PostgreSQL: Download from https://www.postgresql.org/download/windows/"
        Write-Info "Redis: Download from https://redis.io/download or use WSL"
    }
}

# Step 6: Initialize Database
function Initialize-Database {
    Write-Info "Initializing database schema..."
    
    try {
        alembic upgrade head
        Write-Success "Database schema initialized"
    } catch {
        Write-Warning "Alembic failed, trying with python -m"
        python -m alembic upgrade head
        Write-Success "Database schema initialized"
    }
}

# Step 7: Seed Database
function Seed-Database {
    Write-Info "Seeding database with sample data..."
    
    if (Test-Path "scripts\seed_db.py") {
        python scripts\seed_db.py
        Write-Success "Database seeded with sample data"
    } else {
        Write-Warning "Seed script not found, skipping data seeding"
    }
}

# Step 8: Setup ML Models
function Setup-MLModels {
    Write-Info "Setting up ML models..."
    
    if (-not (Test-Path "models")) {
        New-Item -ItemType Directory -Path "models" | Out-Null
        Write-Success "Models directory created"
    }
    
    if (Test-Path "models\latest_version.json") {
        Write-Success "ML model already exists"
    } else {
        Write-Info "No trained model found. Training initial model..."
        
        if (Test-Path "scripts\train_model_production.py") {
            if (Test-Path "data\processed\training_data_enhanced.csv") {
                python scripts\train_model_production.py
                Write-Success "Initial ML model trained"
            } else {
                Write-Warning "Training data not found. Skipping model training."
                Write-Info "Run: python scripts\train_model_production.py manually after adding data"
            }
        } else {
            Write-Warning "Training script not found, skipping"
        }
    }
}

# Step 9: Setup Frontend
function Setup-Frontend {
    Write-Info "Setting up frontend..."
    
    if (Test-Path "src\frontend") {
        Push-Location "src\frontend"
        
        if (Test-CommandExists npm) {
            Write-Info "Installing frontend dependencies..."
            npm install --silent
            Write-Success "Frontend dependencies installed"
        } else {
            Write-Warning "npm not found, skipping frontend setup"
        }
        
        Pop-Location
    } else {
        Write-Warning "Frontend directory not found, skipping"
    }
}

# Step 10: Health Check
function Test-Health {
    Write-Info "Running health checks..."
    
    # Check PostgreSQL
    try {
        $env:PGPASSWORD = "intellog_pass"
        psql -h localhost -U intellog_user -d intellog_db -c '\q' 2>$null
        Write-Success "PostgreSQL connection: OK"
    } catch {
        Write-Warning "PostgreSQL connection: FAILED (check credentials in .env)"
    }
    
    # Check Redis
    try {
        $redisResponse = redis-cli -h localhost ping 2>$null
        if ($redisResponse -eq "PONG") {
            Write-Success "Redis connection: OK"
        }
    } catch {
        Write-Warning "Redis connection: FAILED"
    }
}

# Step 11: Print Next Steps
function Print-NextSteps {
    Write-Host ""
    Write-Success "Development environment setup complete! 🎉"
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  1. Activate virtual environment:" -ForegroundColor White
    Write-Host "     .\venv\Scripts\Activate.ps1" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  2. Start the API server:" -ForegroundColor White
    Write-Host "     cd src\backend; python -m app.main" -ForegroundColor Cyan
    Write-Host "     or" -ForegroundColor Gray
    Write-Host "     uvicorn src.backend.app.main:app --reload --host 0.0.0.0 --port 8000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  3. Start the frontend (in another terminal):" -ForegroundColor White
    Write-Host "     cd src\frontend; npm run dev" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  4. Start Celery worker (for background tasks):" -ForegroundColor White
    Write-Host "     celery -A src.backend.worker.celery_app worker --loglevel=info" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  5. Start Celery Beat (for scheduled tasks):" -ForegroundColor White
    Write-Host "     celery -A src.backend.worker.celery_app beat --loglevel=info" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "  6. Access the application:" -ForegroundColor White
    Write-Host "     API: http://localhost:8000" -ForegroundColor Cyan
    Write-Host "     Docs: http://localhost:8000/docs" -ForegroundColor Cyan
    Write-Host "     Frontend: http://localhost:3000" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "Documentation:" -ForegroundColor Yellow
    Write-Host "  - README.md - Project overview"
    Write-Host "  - docs\ML_SYSTEM.md - ML architecture"
    Write-Host "  - docs\LEARNING_SYSTEM.md - Continuous learning"
    Write-Host "  - docs\BUSINESS_STRATEGY.md - Go-to-market strategy"
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "  - Database issues: Check docker-compose logs or .env credentials"
    Write-Host "  - Import errors: Ensure venv is activated"
    Write-Host "  - Port conflicts: Change ports in .env file"
    Write-Host ""
}

# Main execution
function Main {
    Print-Banner
    
    Write-Info "Starting development environment setup..."
    Write-Info "This will take approximately 5 minutes"
    Write-Host ""
    
    Test-Requirements
    Write-Host ""
    
    Setup-Venv
    Write-Host ""
    
    Install-Dependencies
    Write-Host ""
    
    Setup-Env
    Write-Host ""
    
    Start-Databases
    Write-Host ""
    
    Initialize-Database
    Write-Host ""
    
    Seed-Database
    Write-Host ""
    
    Setup-MLModels
    Write-Host ""
    
    Setup-Frontend
    Write-Host ""
    
    Test-Health
    Write-Host ""
    
    Print-NextSteps
}

# Run main function
Main
