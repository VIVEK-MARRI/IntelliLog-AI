#!/bin/bash
# IntelliLog-AI Full Stack Startup Script

echo "🚀 Starting IntelliLog-AI SaaS Platform..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "README.md" ]; then
    echo "❌ Please run this script from the IntelliLog-AI root directory"
    exit 1
fi

echo -e "${BLUE}┌─────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│  IntelliLog-AI SaaS Platform Startup   │${NC}"
echo -e "${BLUE}└─────────────────────────────────────────┘${NC}"
echo ""

# Start Backend
echo -e "${GREEN}[1/3]${NC} Starting Backend Server..."
cd src/backend
python -m uvicorn app.main:application --reload --port 8000 &
BACKEND_PID=$!
cd ../..
sleep 2
echo -e "${GREEN}✓ Backend running at http://localhost:8000${NC}"
echo ""

# Seed Database
echo -e "${GREEN}[2/3]${NC} Seeding database with admin user..."
cd src/backend
python -m src.backend.app.db.seed
cd ../..
echo -e "${GREEN}✓ Database seeded${NC}"
echo ""

# Start Frontend
echo -e "${GREEN}[3/3]${NC} Starting Frontend..."
cd src/frontend
npm install > /dev/null 2>&1
npm run dev &
FRONTEND_PID=$!
cd ../..
echo -e "${GREEN}✓ Frontend starting at http://localhost:5173${NC}"
echo ""

echo -e "${BLUE}┌─────────────────────────────────────────┐${NC}"
echo -e "${BLUE}│         Platform is Ready! 🎉          │${NC}"
echo -e "${BLUE}└─────────────────────────────────────────┘${NC}"
echo ""

echo "📍 Access Points:"
echo "   • Landing Page → http://localhost:5173"
echo "   • Admin Login  → http://localhost:5173/auth/login"
echo ""

echo "🔑 Credentials:"
echo "   • Email:    admin@intellilog.ai"
echo "   • Password: Admin@123"
echo ""

echo "📊 API Docs:"
echo "   • Swagger UI → http://localhost:8000/docs"
echo "   • ReDoc      → http://localhost:8000/redoc"
echo ""

echo "💬 Useful Commands:"
echo "   • View logs          → tail -f backend.log"
echo "   • Stop servers       → kill $BACKEND_PID $FRONTEND_PID"
echo "   • Reset database     → python -m src.backend.app.db.seed"
echo ""

# Keep scripts running
wait
