import { Request, Response, NextFunction } from 'express'

/**
 * Simple in-memory rate limiter
 * For production, consider using redis-based rate limiting
 */
interface RateLimitStore {
  [key: string]: {
    count: number
    resetTime: number
  }
}

const store: RateLimitStore = {}

/**
 * Rate limiter middleware
 */
export const rateLimiter = (
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100 // max requests per window
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip rate limiting in development
    if (process.env.NODE_ENV === 'development' && process.env.ENABLE_RATE_LIMIT !== 'true') {
      return next()
    }

    const key = (req as any).userId || req.ip || 'anonymous'
    const now = Date.now()
    const record = store[key]

    // Clean up old records
    if (record && now > record.resetTime) {
      delete store[key]
    }

    const currentRecord = store[key]

    if (!currentRecord) {
      // First request in window
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      }
      return next()
    }

    if (currentRecord.count >= maxRequests) {
      // Rate limit exceeded
      const retryAfter = Math.ceil((currentRecord.resetTime - now) / 1000)
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again after ${retryAfter} seconds.`,
        retryAfter,
      })
    }

    // Increment count
    currentRecord.count++
    next()
  }
}

/**
 * Clean up old rate limit records periodically
 */
setInterval(() => {
  const now = Date.now()
  for (const key in store) {
    if (store[key].resetTime < now) {
      delete store[key]
    }
  }
}, 60 * 1000) // Clean up every minute

