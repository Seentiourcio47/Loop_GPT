# Deployment Guide

This guide covers deploying Loop GPT to production using Vercel (frontend) and Render (backend).

## Prerequisites

- GitHub account
- Vercel account (free tier available)
- Render account (free tier available)
- OpenAI API key

## Frontend Deployment (Vercel)

### Step 1: Push to GitHub

1. Create a new GitHub repository
2. Push your code:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/loop-gpt.git
git push -u origin main
```

### Step 2: Deploy to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "Add New Project"
3. Import your GitHub repository
4. Configure the project:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`
5. Add Environment Variables:
   - `NEXT_PUBLIC_API_URL`: Your Render backend URL (e.g., `https://loop-gpt-backend.onrender.com`)
6. Click "Deploy"

### Step 3: Update CORS in Backend

After getting your Vercel URL, update the `FRONTEND_URL` environment variable in Render to match your Vercel deployment URL.

## Backend Deployment (Render)

### Step 1: Create PostgreSQL Database

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "PostgreSQL"
3. Configure:
   - **Name**: `loop-gpt-db`
   - **Database**: `loopgpt`
   - **User**: `loopgpt`
   - **Plan**: Free (or your preferred plan)
4. Click "Create Database"
5. Copy the **Internal Database URL** (you'll need this)

### Step 2: Deploy Backend Service

1. In Render Dashboard, click "New +" → "Web Service"
2. Connect your GitHub repository
3. Configure the service:
   - **Name**: `loop-gpt-backend`
   - **Environment**: Node
   - **Root Directory**: `backend`
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm start`
4. Add Environment Variables:
   - `DATABASE_URL`: Your PostgreSQL connection string
   - `JWT_SECRET`: Generate a secure random string
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `FRONTEND_URL`: Your Vercel frontend URL
   - `NODE_ENV`: `production`
   - `PORT`: `3001`
5. Click "Create Web Service"

### Step 3: Run Database Migrations

After the service is deployed:

1. Go to your service in Render
2. Open the "Shell" tab
3. Run:
```bash
npx prisma migrate deploy
```

Or use the Render dashboard to run migrations automatically by adding to build command:
```bash
npm install && npm run build && npx prisma generate && npx prisma migrate deploy
```

## Auto-Deployment Setup

Both Vercel and Render automatically deploy when you push to your main branch.

### Vercel Auto-Deploy
- Enabled by default
- Deploys on every push to main branch
- Creates preview deployments for pull requests

### Render Auto-Deploy
- Enabled by default
- Deploys on every push to main branch
- Can be configured in service settings

## Environment Variables Summary

### Frontend (Vercel)
```
NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
```

### Backend (Render)
```
DATABASE_URL=postgresql://user:pass@host:5432/dbname
JWT_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
FRONTEND_URL=https://your-frontend.vercel.app
NODE_ENV=production
PORT=3001
```

## Post-Deployment Checklist

- [ ] Backend health check: `https://your-backend.onrender.com/health`
- [ ] Frontend loads correctly
- [ ] Can create new conversations
- [ ] Messages send and receive AI responses
- [ ] CORS is properly configured
- [ ] Database migrations are applied
- [ ] Environment variables are set correctly

## Troubleshooting

### Backend Issues
- Check Render logs for errors
- Verify DATABASE_URL is correct
- Ensure Prisma migrations ran successfully
- Check OpenAI API key is valid

### Frontend Issues
- Verify NEXT_PUBLIC_API_URL points to correct backend
- Check browser console for CORS errors
- Ensure backend is running and accessible

### Database Issues
- Verify connection string format
- Check database is running in Render
- Ensure migrations have been applied

## Cost Estimation

### Free Tier
- **Vercel**: Free for personal projects
- **Render**: Free tier available (with limitations)
- **OpenAI**: Pay-as-you-go (very affordable for testing)

### Production Tier
- **Vercel Pro**: $20/month
- **Render**: $7-25/month depending on plan
- **OpenAI**: Based on usage

