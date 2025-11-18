#!/bin/bash

# Local Deployment Script for Loop GPT
# This script starts both backend and frontend servers

echo "🚀 Starting Loop GPT Local Deployment..."
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "backend/node_modules" ]; then
    echo "📦 Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

if [ ! -d "frontend/node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Check for .env files
if [ ! -f "backend/.env" ]; then
    echo "⚠️  Backend .env file not found. Creating from template..."
    cp backend/env.example backend/.env
    echo "✅ Created backend/.env - Please update with your values"
fi

if [ ! -f "frontend/.env.local" ]; then
    echo "⚠️  Frontend .env.local not found. Creating..."
    echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > frontend/.env.local
    echo "✅ Created frontend/.env.local"
fi

# Generate Prisma client
echo "🔧 Generating Prisma client..."
cd backend && npx prisma generate > /dev/null 2>&1 && cd ..

# Check if concurrently is available
if command -v concurrently &> /dev/null; then
    echo ""
    echo "✅ Starting both servers with concurrently..."
    echo "   Frontend: http://localhost:3000"
    echo "   Backend:  http://localhost:3001"
    echo ""
    concurrently \
        --names "backend,frontend" \
        --prefix-colors "blue,green" \
        "cd backend && npm run dev" \
        "cd frontend && npm run dev"
else
    echo ""
    echo "⚠️  'concurrently' not found. Install it for parallel execution:"
    echo "   npm install -g concurrently"
    echo ""
    echo "Or run servers manually in separate terminals:"
    echo "   Terminal 1: cd backend && npm run dev"
    echo "   Terminal 2: cd frontend && npm run dev"
    echo ""
    echo "Starting backend first..."
    cd backend && npm run dev
fi

