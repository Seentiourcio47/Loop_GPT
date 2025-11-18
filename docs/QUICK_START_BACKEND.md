# Quick Start Guide for Backend & Database Developers

## 🎯 What You Need to Build

### Already Implemented ✅
- Complete Express.js API server
- User authentication (JWT)
- Conversation CRUD operations
- Message handling with OpenAI integration
- Prisma ORM setup
- Database schema
- API routes and middleware

### What You Need to Do

#### 1. Set Up Local Environment
```bash
cd backend
npm install
cp env.example .env
# Edit .env with your values
```

#### 2. Set Up Database
```bash
# Make sure PostgreSQL is running
npx prisma generate
npx prisma migrate dev
```

#### 3. Get OpenAI API Key
- Sign up at https://platform.openai.com
- Create API key
- Add to `.env` as `OPENAI_API_KEY`

#### 4. Start Development Server
```bash
npm run dev
```

## 📋 API Endpoints Checklist

### Authentication
- [x] POST `/api/auth/register` - Register user
- [x] POST `/api/auth/login` - Login user

### Conversations
- [x] GET `/api/conversations` - List conversations
- [x] GET `/api/conversations/:id` - Get conversation
- [x] POST `/api/conversations` - Create conversation
- [x] PATCH `/api/conversations/:id` - Update conversation
- [x] DELETE `/api/conversations/:id` - Delete conversation

### Messages
- [x] GET `/api/conversations/:id/messages` - Get messages
- [x] POST `/api/conversations/:id/messages` - Send message

## 🗄️ Database Tasks

### Schema Management
```bash
# Create new migration
npx prisma migrate dev --name your-migration-name

# Apply migrations
npx prisma migrate deploy

# View database
npx prisma studio
```

### Current Schema
- **User**: id, email, password, name, timestamps
- **Conversation**: id, title, userId, timestamps
- **Message**: id, role, content, conversationId, createdAt

## 🔧 Common Tasks

### Add New Endpoint
1. Create route in `src/routes/`
2. Import in `src/server.ts`
3. Add authentication middleware if needed
4. Test with Postman/curl

### Modify Database Schema
1. Edit `prisma/schema.prisma`
2. Run `npx prisma migrate dev`
3. Prisma Client auto-updates

### Debug Database
```bash
npx prisma studio  # GUI for database
```

## 🚀 Deployment Checklist

1. **Set Environment Variables in Render**
   - DATABASE_URL
   - JWT_SECRET
   - OPENAI_API_KEY
   - FRONTEND_URL
   - NODE_ENV=production

2. **Run Migrations**
   ```bash
   npx prisma migrate deploy
   ```

3. **Verify Health Endpoint**
   - `GET /health` should return `{status: "ok"}`

## 📚 Full Documentation

See [BACKEND_DATABASE_SUMMARY.md](./BACKEND_DATABASE_SUMMARY.md) for complete details.

## 🐛 Troubleshooting

**Database Connection Error**
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Check credentials

**Prisma Client Error**
- Run `npx prisma generate`

**OpenAI API Error**
- Verify API key is correct
- Check account has credits

**CORS Error**
- Update FRONTEND_URL in backend
- Check CORS middleware config

