import express from 'express'
import { authenticateToken } from './auth'
import { aiProviderService, AIProvider } from '../services/aiProviders'

const router = express.Router()

// Conditional auth middleware (skip in dev mode)
const optionalAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (process.env.NODE_ENV === 'development' || process.env.ENABLE_DEV_MODE === 'true') {
    return next()
  }
  authenticateToken(req, res, next)
}

// Get available providers and models (with optional API key for fetching models)
router.get('/providers', optionalAuth, async (req, res) => {
  try {
    const { apiKey, baseUrl } = req.query
    
    // Fetch models for each provider (with optional API key)
    const providers = await Promise.all([
      aiProviderService.getAvailableModels('openai', apiKey as string).then(models => ({
        id: 'openai',
        name: 'OpenAI',
        models,
      })),
      aiProviderService.getAvailableModels('anthropic', apiKey as string).then(models => ({
        id: 'anthropic',
        name: 'Anthropic Claude',
        models,
      })),
      aiProviderService.getAvailableModels('groq', apiKey as string).then(models => ({
        id: 'groq',
        name: 'Groq',
        models,
      })),
      aiProviderService.getAvailableModels('together', apiKey as string).then(models => ({
        id: 'together',
        name: 'Together AI',
        models,
      })),
      aiProviderService.getAvailableModels('ollama', undefined, baseUrl as string).then(models => ({
        id: 'ollama',
        name: 'Ollama (Local)',
        models,
      })),
      aiProviderService.getAvailableModels('local', undefined, baseUrl as string).then(models => ({
        id: 'local',
        name: 'Local API',
        models,
      })),
      aiProviderService.getAvailableModels('xai', apiKey as string).then(models => ({
        id: 'xai',
        name: 'x.ai (Grok)',
        models,
      })),
      aiProviderService.getAvailableModels('perplexity', apiKey as string).then(models => ({
        id: 'perplexity',
        name: 'Perplexity AI',
        models,
      })),
      aiProviderService.getAvailableModels('nvidia', apiKey as string, baseUrl as string).then(models => ({
        id: 'nvidia',
        name: 'NVIDIA NIM',
        models,
      })),
    ])

    res.json(providers)
  } catch (error: any) {
    console.error('Error fetching providers:', error)
    res.status(500).json({ error: 'Failed to fetch providers' })
  }
})

// Get models for a specific provider (requires API key in body for authenticated fetch)
router.post('/providers/:providerId/models', optionalAuth, async (req, res) => {
  try {
    const { providerId } = req.params
    const { apiKey, baseUrl } = req.body

    // Clear cache for this provider to force fresh fetch
    aiProviderService.clearModelCache(providerId as AIProvider)

    const models = await aiProviderService.getAvailableModels(
      providerId as AIProvider,
      apiKey,
      baseUrl
    )

    res.json({ provider: providerId, models })
  } catch (error: any) {
    console.error(`Error fetching models for ${req.params.providerId}:`, error)
    res.status(500).json({ error: `Failed to fetch models: ${error.message}` })
  }
})

// Update provider configuration
router.post('/provider', optionalAuth, async (req, res) => {
  try {
    const { provider, apiKey, model, baseUrl } = req.body

    if (!provider) {
      return res.status(400).json({ error: 'Provider is required' })
    }

    // Clear cache when API key changes to force refresh
    if (apiKey) {
      aiProviderService.clearModelCache(provider as AIProvider)
    }

    aiProviderService.setProviderConfig(provider as AIProvider, {
      name: provider,
      apiKey,
      model,
      baseUrl,
    })

    // Optionally refresh models when API key is provided
    let models: string[] = []
    if (apiKey) {
      try {
        models = await aiProviderService.getAvailableModels(
          provider as AIProvider,
          apiKey,
          baseUrl
        )
      } catch (error) {
        // Continue even if model fetch fails
        console.warn(`Could not fetch models for ${provider}`, error)
      }
    }

    res.json({ 
      success: true, 
      message: 'Provider configuration updated',
      models: models.length > 0 ? models : undefined,
    })
  } catch (error: any) {
    console.error('Update provider error:', error)
    res.status(500).json({ error: 'Failed to update provider configuration' })
  }
})

// Get current provider configuration
router.get('/provider/:providerId', optionalAuth, (req, res) => {
  const { providerId } = req.params
  const config = aiProviderService.getProviderConfig(providerId as AIProvider)

  if (!config) {
    return res.json({
      provider: providerId,
      model: aiProviderService.getDefaultModel(providerId as AIProvider),
      apiKey: '',
      baseUrl: '',
    })
  }

  res.json({
    provider: providerId,
    ...config,
    // Don't send full API key for security
    apiKey: config.apiKey ? '***' : '',
  })
})

export default router
