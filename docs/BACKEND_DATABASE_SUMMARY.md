# Backend & Database Development Summary

## Overview

This document provides a comprehensive guide for backend and database developers working on Loop GPT. It outlines the architecture, API endpoints, database schema, and implementation details.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Authentication & Authorization](#authentication--authorization)
6. [AI Integration](#ai-integration)
7. [Development Setup](#development-setup)
8. [Testing](#testing)
9. [Performance Considerations](#performance-considerations)
10. [Security Best Practices](#security-best-practices)
11. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

### System Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│   Frontend  │ ──────> │   Backend   │ ──────> │  PostgreSQL │
│  (Next.js)  │         │  (Express)  │         │  Database   │
└─────────────┘         └─────────────┘         └─────────────┘
                              │
                              ▼
                        ┌─────────────┐
                        │   OpenAI    │
                        │     API     │
                        └─────────────┘
```

### Request Flow

1. User sends message from frontend
2. Frontend makes API request to backend
3. Backend authenticates request (JWT)
4. Backend saves user message to database
5. Backend fetches conversation history
6. Backend calls OpenAI API with context
7. Backend saves AI response to database
8. Backend returns both messages to frontend

---

## Technology Stack

### Core Technologies

- **Runtime**: Node.js 18+
- **Framework**: Express.js 4.18+
- **Language**: TypeScript 5.3+
- **ORM**: Prisma 5.7+
- **Database**: PostgreSQL 14+

### Key Dependencies

```json
{
  "express": "^4.18.2",        // Web framework
  "prisma": "^5.7.1",          // ORM and database toolkit
  "@prisma/client": "^5.7.1",  // Prisma client
  "jsonwebtoken": "^9.0.2",   // JWT authentication
  "bcryptjs": "^2.4.3",        // Password hashing
  "openai": "^4.20.1",         // OpenAI API client
  "cors": "^2.8.5",            // CORS middleware
  "zod": "^3.22.4"             // Schema validation
}
```

---

## Database Schema

### Entity Relationship Diagram

```
User
├── id (String, Primary Key)
├── email (String, Unique)
├── password (String, Hashed)
├── name (String)
├── createdAt (DateTime)
├── updatedAt (DateTime)
└── conversations (One-to-Many)

Conversation
├── id (String, Primary Key)
├── title (String)
├── userId (String, Foreign Key -> User.id)
├── createdAt (DateTime)
├── updatedAt (DateTime)
└── messages (One-to-Many)

Message
├── id (String, Primary Key)
├── role (String: 'user' | 'assistant')
├── content (Text)
├── conversationId (String, Foreign Key -> Conversation.id)
└── createdAt (DateTime)
```

### Prisma Schema

```prisma
model User {
  id            String         @id @default(cuid())
  email         String         @unique
  password      String
  name          String
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
  conversations Conversation[]
}

model Conversation {
  id        String    @id @default(cuid())
  title     String
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([userId])
}

model Message {
  id             String       @id @default(cuid())
  role           String       // 'user' | 'assistant'
  content        String       @db.Text
  conversationId String
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  createdAt      DateTime     @default(now())

  @@index([conversationId])
}
```

### Database Indexes

- **User.email**: Unique index for fast email lookups
- **Conversation.userId**: Index for filtering conversations by user
- **Message.conversationId**: Index for fetching messages by conversation

### Cascade Deletes

- Deleting a User cascades to delete all their Conversations
- Deleting a Conversation cascades to delete all its Messages

---

## API Endpoints

### Authentication Endpoints

#### POST `/api/auth/register`
Register a new user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "name": "John Doe" // optional
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

#### POST `/api/auth/login`
Authenticate existing user.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:**
```json
{
  "token": "jwt-token-here",
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "name": "John Doe"
  }
}
```

### Conversation Endpoints

#### GET `/api/conversations`
Get all conversations for authenticated user.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
[
  {
    "id": "conv-id",
    "title": "Chat Title",
    "createdAt": "2024-01-01T00:00:00Z",
    "updatedAt": "2024-01-01T00:00:00Z"
  }
]
```

#### GET `/api/conversations/:id`
Get single conversation with all messages.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "id": "conv-id",
  "title": "Chat Title",
  "userId": "user-id",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z",
  "messages": [
    {
      "id": "msg-id",
      "role": "user",
      "content": "Hello!",
      "createdAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

#### POST `/api/conversations`
Create a new conversation.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "title": "New Chat" // optional, defaults to "New Chat"
}
```

**Response:**
```json
{
  "id": "conv-id",
  "title": "New Chat",
  "createdAt": "2024-01-01T00:00:00Z",
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

#### PATCH `/api/conversations/:id`
Update conversation title.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "title": "Updated Title"
}
```

**Response:**
```json
{
  "success": true
}
```

#### DELETE `/api/conversations/:id`
Delete a conversation and all its messages.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
{
  "success": true
}
```

### Message Endpoints

#### GET `/api/conversations/:conversationId/messages`
Get all messages for a conversation.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Response:**
```json
[
  {
    "id": "msg-id",
    "role": "user",
    "content": "Hello!",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  {
    "id": "msg-id-2",
    "role": "assistant",
    "content": "Hi there! How can I help?",
    "createdAt": "2024-01-01T00:00:01Z"
  }
]
```

#### POST `/api/conversations/:conversationId/messages`
Send a message and get AI response.

**Headers:**
```
Authorization: Bearer <jwt-token>
```

**Request Body:**
```json
{
  "content": "What is the capital of France?"
}
```

**Special Case:** Use `conversationId: "new"` to create a new conversation automatically.

**Response:**
```json
{
  "userMessage": {
    "id": "msg-id",
    "role": "user",
    "content": "What is the capital of France?",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "assistantMessage": {
    "id": "msg-id-2",
    "role": "assistant",
    "content": "The capital of France is Paris.",
    "createdAt": "2024-01-01T00:00:01Z"
  },
  "conversationId": "conv-id"
}
```

---

## Authentication & Authorization

### JWT Token Structure

```json
{
  "userId": "user-cuid",
  "iat": 1234567890,
  "exp": 1234567890
}
```

### Token Expiration
- Default: 7 days
- Configurable via `JWT_SECRET` and token options

### Password Security
- Passwords are hashed using `bcryptjs` with 10 salt rounds
- Never stored in plain text
- Minimum requirements should be enforced on frontend

### Authorization Middleware

The `authenticateToken` middleware:
1. Extracts JWT from `Authorization` header
2. Verifies token signature
3. Attaches `userId` to request object
4. Returns 401/403 on failure

**Usage:**
```typescript
router.get('/protected', authenticateToken, async (req, res) => {
  const userId = (req as any).userId
  // Use userId for authorization
})
```

---

## AI Integration

### OpenAI API Configuration

**Model:** `gpt-3.5-turbo` (default, configurable)
**Temperature:** 0.7 (balanced creativity)
**Max Tokens:** 1000 (configurable)

### Context Management

- Last 20 messages are sent to OpenAI for context
- Messages are ordered chronologically
- Both user and assistant messages included

### Error Handling

**Common Errors:**
- `insufficient_quota`: API key has no credits
- `invalid_api_key`: API key is invalid
- `rate_limit_exceeded`: Too many requests

**Response Codes:**
- `200`: Success
- `400`: Bad request (missing content)
- `402`: Payment required (quota exceeded)
- `500`: Internal server error

### Streaming (Future Enhancement)

Currently returns complete response. Can be enhanced to stream tokens:

```typescript
const stream = await openai.chat.completions.create({
  model: 'gpt-3.5-turbo',
  messages: openaiMessages,
  stream: true,
})

for await (const chunk of stream) {
  // Send chunks to frontend via SSE or WebSocket
}
```

---

## Development Setup

### Prerequisites

```bash
node --version  # v18.0.0 or higher
npm --version   # v9.0.0 or higher
psql --version  # PostgreSQL 14+
```

### Installation

```bash
cd backend
npm install
```

### Environment Variables

Create `.env` file:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/loopgpt
JWT_SECRET=your-secret-key-change-in-production
OPENAI_API_KEY=sk-your-openai-key
OPENAI_MODEL=gpt-3.5-turbo
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

### Database Setup

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations
npx prisma migrate dev

# (Optional) Open Prisma Studio
npx prisma studio
```

### Running Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### Project Structure

```
backend/
├── src/
│   ├── server.ts           # Express app entry point
│   ├── routes/
│   │   ├── auth.ts         # Authentication routes
│   │   ├── conversations.ts # Conversation CRUD
│   │   └── messages.ts     # Message handling & AI
│   └── middleware/          # (Future) Custom middleware
├── prisma/
│   └── schema.prisma        # Database schema
├── dist/                    # Compiled TypeScript
├── package.json
├── tsconfig.json
└── render.yaml             # Render deployment config
```

---

## Testing

### Manual Testing Checklist

**Authentication:**
- [ ] Register new user
- [ ] Login with valid credentials
- [ ] Login with invalid credentials
- [ ] Access protected route without token
- [ ] Access protected route with invalid token

**Conversations:**
- [ ] Create new conversation
- [ ] List all conversations
- [ ] Get single conversation
- [ ] Update conversation title
- [ ] Delete conversation
- [ ] Verify user can only access own conversations

**Messages:**
- [ ] Send message to existing conversation
- [ ] Send message to new conversation (conversationId: "new")
- [ ] Get messages for conversation
- [ ] Verify AI response is generated
- [ ] Verify messages are saved to database
- [ ] Verify conversation timestamp updates

### API Testing Tools

- **Postman**: Import collection for all endpoints
- **curl**: Command-line testing
- **Thunder Client**: VS Code extension

### Example curl Commands

```bash
# Register
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'

# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123"}'

# Get conversations (replace TOKEN)
curl http://localhost:3001/api/conversations \
  -H "Authorization: Bearer TOKEN"

# Send message
curl -X POST http://localhost:3001/api/conversations/new/messages \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello, AI!"}'
```

---

## Performance Considerations

### Database Optimization

1. **Indexes**: Already added on `userId` and `conversationId`
2. **Pagination**: Consider adding pagination for messages
3. **Connection Pooling**: Prisma handles this automatically

### API Optimization

1. **Caching**: Consider Redis for frequently accessed conversations
2. **Rate Limiting**: Implement rate limiting per user
3. **Response Compression**: Use `compression` middleware

### OpenAI API Optimization

1. **Token Limits**: Monitor token usage per request
2. **Context Window**: Limit to last 20 messages (current)
3. **Model Selection**: Use `gpt-3.5-turbo` for cost efficiency
4. **Caching**: Cache similar queries

### Recommended Improvements

```typescript
// Add pagination
router.get('/:conversationId/messages', async (req, res) => {
  const page = parseInt(req.query.page) || 1
  const limit = parseInt(req.query.limit) || 50
  const skip = (page - 1) * limit

  const messages = await prisma.message.findMany({
    where: { conversationId },
    skip,
    take: limit,
    orderBy: { createdAt: 'asc' },
  })
})
```

---

## Security Best Practices

### Implemented

✅ Password hashing with bcrypt
✅ JWT token authentication
✅ CORS configuration
✅ SQL injection prevention (Prisma)
✅ Environment variable management

### Recommended Additions

1. **Input Validation**: Use Zod for request validation
```typescript
import { z } from 'zod'

const messageSchema = z.object({
  content: z.string().min(1).max(10000),
})

router.post('/messages', async (req, res) => {
  const validated = messageSchema.parse(req.body)
  // ...
})
```

2. **Rate Limiting**: Prevent abuse
```typescript
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
})
```

3. **Helmet**: Security headers
```typescript
import helmet from 'helmet'
app.use(helmet())
```

4. **Input Sanitization**: Sanitize user input
5. **HTTPS**: Always use HTTPS in production
6. **Secrets Management**: Use secure secret management (not .env in production)

---

## Future Enhancements

### Short Term

1. **Streaming Responses**: Stream AI responses in real-time
2. **Message Editing**: Allow users to edit/regenerate messages
3. **Conversation Sharing**: Share conversations via links
4. **Export Conversations**: Export to JSON/Markdown
5. **Search**: Full-text search across conversations

### Medium Term

1. **Multiple AI Models**: Support for different models (GPT-4, Claude, etc.)
2. **Custom Instructions**: User-defined system prompts
3. **Conversation Templates**: Pre-built conversation starters
4. **File Uploads**: Support for document analysis
5. **Voice Input**: Speech-to-text integration

### Long Term

1. **Multi-user Conversations**: Collaborative chats
2. **Plugin System**: Extend functionality with plugins
3. **Fine-tuning**: Custom model fine-tuning
4. **Analytics Dashboard**: Usage analytics
5. **Enterprise Features**: SSO, team management, etc.

### Database Schema Additions

```prisma
// Future models
model ConversationShare {
  id             String       @id @default(cuid())
  conversationId String
  shareToken     String       @unique
  expiresAt      DateTime?
  createdAt      DateTime     @default(now())
}

model UserSettings {
  id        String   @id @default(cuid())
  userId    String   @unique
  model     String   @default("gpt-3.5-turbo")
  temperature Float  @default(0.7)
  maxTokens  Int     @default(1000)
}
```

---

## Troubleshooting

### Common Issues

**Database Connection Errors**
- Verify DATABASE_URL format
- Check PostgreSQL is running
- Verify credentials

**Prisma Client Errors**
- Run `npx prisma generate` after schema changes
- Clear `node_modules` and reinstall

**OpenAI API Errors**
- Verify API key is correct
- Check API quota/credits
- Verify network connectivity

**CORS Errors**
- Update FRONTEND_URL in backend
- Check CORS middleware configuration

**JWT Errors**
- Verify JWT_SECRET is set
- Check token expiration
- Verify token format in Authorization header

---

## Contact & Support

For questions or issues:
1. Check existing documentation
2. Review error logs
3. Test with curl/Postman
4. Check Prisma Studio for database state

---

**Last Updated:** 2024-01-01
**Version:** 1.0.0

