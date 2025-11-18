import { Request, Response, NextFunction } from 'express'

/**
 * Enhanced error logging middleware
 */
export const errorLogger = (err: any, req: Request, res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString()
  const userId = (req as any).userId || 'anonymous'
  const ip = req.ip || req.socket.remoteAddress || 'unknown'
  
  // Log error details
  console.error(`[${timestamp}] Error:`, {
    message: err.message,
    stack: err.stack,
    userId,
    ip,
    method: req.method,
    path: req.path,
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query,
  })

  // Determine status code
  const statusCode = err.statusCode || err.status || 500

  // Don't expose internal errors in production
  const message = process.env.NODE_ENV === 'production' && statusCode === 500
    ? 'Internal server error'
    : err.message

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      details: err.details,
      stack: err.stack,
    }),
  })
}

/**
 * Async error handler wrapper
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}

