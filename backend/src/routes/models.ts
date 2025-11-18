import express from 'express'
import { authenticateToken } from './auth'
import { multiModelRouter } from '../services/multiModelRouter'

const router = express.Router()

// Conditional auth middleware
const optionalAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_MODE === 'true') {
    return next()
  }
  authenticateToken(req, res, next)
}

// Get current model selection
router.get('/selection', optionalAuth, (req, res) => {
  const models = multiModelRouter.getAllModels()
  const mode = multiModelRouter.getSelectionMode()
  
  res.json({
    models,
    mode,
  })
})

// Set model selection
router.post('/selection', optionalAuth, (req, res) => {
  try {
    const { models, mode } = req.body
    
    if (!models || !Array.isArray(models)) {
      return res.status(400).json({ error: 'Models array is required' })
    }

    multiModelRouter.setModels(models, mode || 'auto')

    res.json({
      success: true,
      message: 'Model selection updated',
      models: multiModelRouter.getAllModels(),
      mode: multiModelRouter.getSelectionMode(),
    })
  } catch (error: any) {
    console.error('Update model selection error:', error)
    res.status(500).json({ error: 'Failed to update model selection' })
  }
})

export default router

