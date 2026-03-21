#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Hyderabad Demo Data Seeder - PowerShell Wrapper
  
.DESCRIPTION
  Convenient wrapper to seed IntelliLog-AI with realistic Hyderabad demo data
  for SHAP explainability demonstrations.
  
.PARAMETER TenantId
  Demo tenant identifier (default: demo-tenant-001)
  
.PARAMETER Reset
  Reset all demo data before reseeding (clean slate)
  
.PARAMETER Verify
  Verify seeding and print detailed hero order information
  
.EXAMPLE
  .\seed-demo.ps1 -Reset -Verify
  
  # This will:
  # 1. Delete existing demo data
  # 2. Reseed fresh
  # 3. Print verification details
#>

param(
    [string]$TenantId = "demo-tenant-001",
    [switch]$Reset = $false,
    [switch]$Verify = $false
)

# Colors for console output
$colors = @{
    'Success' = 'Green'
    'Error'   = 'Red'
    'Warning' = 'Yellow'
    'Info'    = 'Cyan'
}

Write-Host "`n" -ForegroundColor $colors['Info']
Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor $colors['Info']
Write-Host "║   IntelliLog-AI Hyderabad Demo Data Seeder (PowerShell)    ║" -ForegroundColor $colors['Info']
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor $colors['Info']

# Build command
$pythonCmd = "python"
$scriptPath = Join-Path (Get-Location) "scripts" "seed_demo_hyderabad.py"

if (-not (Test-Path $scriptPath)) {
    Write-Host "❌ Error: Script not found at $scriptPath" -ForegroundColor $colors['Error']
    exit 1
}

# Check Python is available
$pythonCheck = & $pythonCmd --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Python not found. Please ensure Python 3.8+ is installed and in PATH" -ForegroundColor $colors['Error']
    exit 1
}

Write-Host "✓ Python: $pythonCheck" -ForegroundColor $colors['Success']
Write-Host "✓ Tenant ID: $TenantId" -ForegroundColor $colors['Info']

# Build command line arguments
$args = @("$scriptPath", "--tenant-id", "$TenantId")

if ($Reset) {
    $args += "--reset"
    Write-Host "✓ Reset mode: ENABLED (all existing demo data will be deleted)" -ForegroundColor $colors['Warning']
}

if ($Verify) {
    $args += "--verify"
    Write-Host "✓ Verify mode: ENABLED (will print detailed hero order info)" -ForegroundColor $colors['Info']
}

Write-Host "`n🚀 Starting seeding process..." -ForegroundColor $colors['Info']
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor $colors['Info']
Write-Host ""

# Run the seed script
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
& $pythonCmd @args
$exitCode = $LASTEXITCODE
$stopwatch.Stop()

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor $colors['Info']

if ($exitCode -eq 0) {
    Write-Host "✅ Seeding completed successfully in $($stopwatch.Elapsed.TotalSeconds)s" -ForegroundColor $colors['Success']
    Write-Host "`n📋 Next steps:" -ForegroundColor $colors['Info']
    Write-Host "  1. Ensure API server is running"
    Write-Host "  2. Ensure Dashboard is running"  
    Write-Host "  3. Open http://localhost:8501 in browser"
    Write-Host "  4. Navigate to Orders tab"
    Write-Host "  5. Select order E3 to see SHAP explanations`n" -ForegroundColor $colors['Info']
} else {
    Write-Host "❌ Seeding failed with exit code $exitCode" -ForegroundColor $colors['Error']
    exit $exitCode
}
