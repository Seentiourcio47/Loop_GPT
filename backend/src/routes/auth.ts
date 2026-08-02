import express from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { validate, validationSchemas } from '../middleware/validation'

const router = express.Router()

// Only construct Prisma when a real database is configured; otherwise the app
// runs on the in-memory store and auth endpoints return 503. Constructing it
// unconditionally crashes boot when no DB (or engine) is present.
let prisma: PrismaClient | null = null
try {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('postgresql://user:password')) {
    prisma = new PrismaClient()
  }
} catch {
  prisma = null
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'

// Register
router.post('/register', validate(validationSchemas.register), async (req, res) => {
  try {
    if (!prisma) return res.status(503).json({ error: 'Account registration requires a database (set DATABASE_URL).' })
    const { email, password, name } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name: name || email.split('@')[0],
      },
    })

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Login
router.post('/login', validate(validationSchemas.login), async (req, res) => {
  try {
    if (!prisma) return res.status(503).json({ error: 'Login requires a database (set DATABASE_URL).' })
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' })
    }

    const user = await prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const isValidPassword = await bcrypt.compare(password, user.password)

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' })

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Middleware to verify JWT token
export const authenticateToken = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  // Development mode: Auto-create/use a default user if no token provided
  // Allow dev mode if NODE_ENV is development OR if ENABLE_DEV_MODE is set
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_MODE === 'true'
  
  if (isDevMode && !token) {
    // Use a default test user ID for development
    ;(req as any).userId = 'dev-user-123'
    return next()
  }

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  jwt.verify(token, JWT_SECRET, (err: any, decoded: any) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' })
    }
    ;(req as any).userId = decoded.userId
    next()
  })
}

export default router

