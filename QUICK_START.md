# Quick Start - Local Deployment

## ✅ Servers Starting

Both backend and frontend servers are starting in the background.

### Access Points

- **Frontend UI:** http://localhost:3000
- **Backend API:** http://localhost:3001
- **Health Check:** http://localhost:3001/health
- **API Info:** http://localhost:3001/

### Check Server Status

```bash
# Check backend
curl http://localhost:3001/health

# Check frontend (should return HTML)
curl http://localhost:3000
```

## 🛠️ Manual Start (if needed)

If you need to restart the servers manually:

### Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

### Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

## 📝 Configuration

### Backend Environment (`backend/.env`)
- Already created from template
- Update `OPENAI_API_KEY` for AI chat features
- Update `DATABASE_URL` if using PostgreSQL
- Default works with in-memory store

### Frontend Environment (`frontend/.env.local`)
- Already created
- Points to `http://localhost:3001`

## 🎯 Features Available

### Without Additional Setup:
- ✅ UI is fully functional
- ✅ Conversation management
- ✅ In-memory data storage (resets on restart)
- ✅ Development mode (no auth required)

### With OpenAI API Key:
- ✅ Full AI chat capabilities
- Add `OPENAI_API_KEY=sk-...` to `backend/.env`

### With Image API:
- ✅ Image generation
- ✅ Vision analysis
- Set `IMAGE_API_URL=...` in `backend/.env`

### With Database:
- ✅ Persistent storage
- ✅ User authentication
- Set `DATABASE_URL=...` in `backend/.env` and run migrations

## 🐛 Troubleshooting

### Servers not starting?
```bash
# Check if ports are in use
lsof -i :3000
lsof -i :3001

# Kill processes if needed
kill -9 <PID>
```

### Dependencies issues?
```bash
# Backend
cd backend && rm -rf node_modules && npm install

# Frontend
cd frontend && rm -rf node_modules && npm install
```

### Prisma issues?
```bash
cd backend
npx prisma generate
npx prisma migrate dev  # Only if using database
```

## 📚 More Information

See `LOCAL_DEPLOYMENT.md` for detailed setup instructions.

