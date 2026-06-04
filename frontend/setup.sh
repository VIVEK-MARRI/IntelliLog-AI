#!/bin/bash
# IntelliLog-AI Frontend - Quick Start Script

echo "🚀 IntelliLog-AI Frontend - Quick Start"
echo "========================================"
echo ""

# Step 1: Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi
echo "✅ Node.js $(node --version) detected"

# Step 2: Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed."
    exit 1
fi
echo "✅ npm $(npm --version) detected"

# Step 3: Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi
echo "✅ Dependencies installed"

# Step 4: Check for .env file
echo ""
echo "⚙️  Checking environment configuration..."
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "Creating .env from .env.example"
        cp .env.example .env
        echo "⚠️  Please configure .env with your backend URL:"
        echo "   VITE_API_URL=http://localhost:8000"
        echo "   VITE_WS_URL=ws://localhost:8000/ws"
    fi
fi
echo "✅ Environment configured"

# Step 5: Type check
echo ""
echo "🔍 Running TypeScript check..."
npm run type-check
if [ $? -ne 0 ]; then
    echo "❌ TypeScript errors found"
    exit 1
fi
echo "✅ TypeScript check passed"

# Step 6: Start development server
echo ""
echo "🚀 Starting development server..."
echo "   Dashboard: http://localhost:3000"
echo "   API: Check your .env configuration"
echo ""
echo "📝 Demo credentials:"
echo "   Email: demo@intelliglobal.com"
echo "   Password: demo123"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

npm run dev
