@echo off
REM IntelliLog-AI Frontend - Quick Start Script for Windows

echo 🚀 IntelliLog-AI Frontend - Quick Start
echo ========================================
echo.

REM Step 1: Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js 16+ first.
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do (
    echo ✅ Node.js %%i detected
)

REM Step 2: Check if npm is installed
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm is not installed.
    exit /b 1
)
for /f "tokens=*" %%i in ('npm --version') do (
    echo ✅ npm %%i detected
)

REM Step 3: Install dependencies
echo.
echo 📦 Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Failed to install dependencies
    exit /b 1
)
echo ✅ Dependencies installed

REM Step 4: Check for .env file
echo.
echo ⚙️  Checking environment configuration...
if not exist .env (
    if exist .env.example (
        echo Creating .env from .env.example
        copy .env.example .env
        echo ⚠️  Please configure .env with your backend URL:
        echo    VITE_API_URL=http://localhost:8000
        echo    VITE_WS_URL=ws://localhost:8000/ws
    )
)
echo ✅ Environment configured

REM Step 5: Type check
echo.
echo 🔍 Running TypeScript check...
call npm run type-check
if %errorlevel% neq 0 (
    echo ❌ TypeScript errors found
    exit /b 1
)
echo ✅ TypeScript check passed

REM Step 6: Start development server
echo.
echo 🚀 Starting development server...
echo    Dashboard: http://localhost:3000
echo    API: Check your .env configuration
echo.
echo 📝 Demo credentials:
echo    Email: demo@intelliglobal.com
echo    Password: demo123
echo.
echo Press Ctrl+C to stop the server
echo.

call npm run dev
