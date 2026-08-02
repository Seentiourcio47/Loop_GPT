import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import path from 'path'
import conversationRoutes from './routes/conversations'
import messageRoutes from './routes/messages'
import authRoutes from './routes/auth'
import settingsRoutes from './routes/settings'
import modelsRoutes from './routes/models'
import agentRoutes from './routes/agent'
import telemetryRoutes from './routes/telemetry'
import { validateEnv } from './middleware/envValidation'
import { rateLimiter } from './middleware/rateLimiter'
import { errorLogger } from './middleware/errorLogger'
import { initAgent } from './agent'

dotenv.config()

// Validate environment variables on startup
validateEnv()

// Initialize the agent runtime (register tools, connect MCP servers, etc.)
initAgent().catch((err) => console.error('Agent init error:', err))

const app = express()
const PORT = process.env.PORT || 3001

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}))
app.use(express.json())

// Rate limiting (100 requests per 15 minutes per user/IP)
app.use('/api', rateLimiter(15 * 60 * 1000, 100))

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, '../uploads')))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/models', modelsRoutes)
app.use('/api/conversations', conversationRoutes)
app.use('/api/conversations', messageRoutes)
app.use('/api/conversations', agentRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/telemetry', telemetryRoutes)

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Loop GPT API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
    endpoints: {
      health: '/health',
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
      },
      conversations: {
        list: 'GET /api/conversations',
        get: 'GET /api/conversations/:id',
        create: 'POST /api/conversations',
        update: 'PATCH /api/conversations/:id',
        delete: 'DELETE /api/conversations/:id',
      },
      messages: {
        get: 'GET /api/conversations/:id/messages',
        send: 'POST /api/conversations/:id/messages',
        uploadImage: 'POST /api/conversations/:id/upload-image',
      },
    },
    features: [
      'Chat with AI (GPT models)',
      'Image generation (FLUX/SD models)',
      'Vision analysis (BLIP/LLaVA)',
      'Vision Q&A',
      'Conversation management',
    ],
  })
})

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling middleware (must be last)
app.use(errorLogger)

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`🌐 CORS enabled for: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`)
})

