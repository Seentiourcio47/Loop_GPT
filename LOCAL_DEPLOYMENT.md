# Local Deployment Guide

This guide will help you deploy Loop GPT locally on your machine.

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- PostgreSQL 14+ (optional - app works without it using in-memory store)

## Quick Start

### 1. Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Set Up Environment Variables

#### Backend (.env)

Create `backend/.env` file:

```bash
cd backend
cp env.example .env
```

Edit `backend/.env` with your values:

```env
# Database (optional - leave default for in-memory store)
DATABASE_URL=postgresql://user:password@localhost:5432/loopgpt

# JWT Secret (generate a random string)
JWT_SECRET=your-secret-key-change-in-production

# OpenAI API Key (optional - for AI chat features)
OPENAI_API_KEY=sk-your-openai-api-key

# Server
PORT=3001
NODE_ENV=development

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Image Generation API (optional)
IMAGE_API_URL=http://localhost:8081
```

#### Frontend (.env.local)

Create `frontend/.env.local` file:

```bash
cd frontend
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local
```

### 3. Database Setup (Optional)

If you want to use PostgreSQL:

```bash
# Create database
createdb loopgpt

# Run migrations
cd backend
npx prisma generate
npx prisma migrate dev
```

**Note:** The app works without a database using an in-memory store for development.

### 4. Start the Application

#### Option A: Run in Separate Terminals

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

#### Option B: Use npm-run-all (if installed)

```bash
# Install concurrently globally
npm install -g concurrently

# From project root
concurrently "cd backend && npm run dev" "cd frontend && npm run dev"
```

### 5. Access the Application

- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health

## Development Mode Features

- **No Authentication Required:** In development mode, the app uses a default dev user
- **In-Memory Store:** Works without database (data resets on restart)
- **Hot Reload:** Both frontend and backend support hot reload
- **Rate Limiting Disabled:** Rate limiting is disabled in development by default

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
# Change PORT in backend/.env
PORT=3002
```

**Database connection errors:**
- The app will automatically use in-memory store if database is not available
- To use database, ensure PostgreSQL is running and DATABASE_URL is correct

**OpenAI API errors:**
- App works without OpenAI API key (with limited features)
- Image generation and vision features require IMAGE_API_URL

### Frontend Issues

**API connection errors:**
- Check NEXT_PUBLIC_API_URL in frontend/.env.local
- Ensure backend is running on the correct port

**Build errors:**
```bash
cd frontend
rm -rf .next
npm run dev
```

## Features Available

### Without Database:
- ✅ Chat with AI (if OpenAI API key is set)
- ✅ Image generation (if Image API is running)
- ✅ Vision analysis (if Image API is running)
- ⚠️ Data resets on server restart

### With Database:
- ✅ All features above
- ✅ Persistent conversations
- ✅ User authentication
- ✅ Data persists across restarts

## Next Steps

1. **Get OpenAI API Key** (optional): https://platform.openai.com/account/api-keys
2. **Set up Image API** (optional): Configure IMAGE_API_URL if you have an image generation service
3. **Configure Database** (optional): Set up PostgreSQL for persistent storage

## Production Build

To build for production:

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm start
```

