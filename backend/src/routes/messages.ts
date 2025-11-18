import express from 'express'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import { authenticateToken } from './auth'
import { imageApiService } from '../services/imageApi'
import { ToolDetector } from '../services/toolDetector'
import { memoryStore } from '../services/memoryStore'
import { aiProviderService, AIProvider } from '../services/aiProviders'
import { multiModelRouter, ModelConfig, SelectionMode } from '../services/multiModelRouter'
import { interactionModesService, InteractionMode } from '../services/interactionModes'
import { validate, validationSchemas } from '../middleware/validation'
import multer from 'multer'
import path from 'path'
import fs from 'fs'

const router = express.Router()
let prisma: PrismaClient | null = null

// Initialize Prisma only if DATABASE_URL is set
try {
  if (process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('postgresql://user:password')) {
    prisma = new PrismaClient()
  }
} catch (error) {
  console.log('Database not available, using in-memory store')
}

const USE_MEMORY_STORE = !prisma

// Initialize OpenAI only if API key is provided and valid
let openai: OpenAI | null = null
if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your-openai-api-key') {
  try {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  } catch (error) {
    console.log('OpenAI not available, will use fallback responses')
  }
}

// Configure multer for image uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase())
    const mimetype = allowedTypes.test(file.mimetype)
    
    if (mimetype && extname) {
      return cb(null, true)
    } else {
      cb(new Error('Only image files are allowed'))
    }
  },
})

// Get messages for a conversation
router.get('/:conversationId/messages', authenticateToken, validate(validationSchemas.getMessages), async (req, res) => {
  try {
    const userId = (req as any).userId
    const { conversationId } = req.params

    if (USE_MEMORY_STORE) {
      const conversation = memoryStore.getConversation(conversationId)
      if (!conversation || conversation.userId !== userId) {
        return res.status(404).json({ error: 'Conversation not found' })
      }
      const messages = memoryStore.getMessages(conversationId)
      return res.json(messages.map(msg => ({
        ...msg,
        createdAt: msg.createdAt.toISOString(),
      })))
    }

    // Verify conversation belongs to user (skip in dev mode)
    const whereClause: any = { id: conversationId }
    if (process.env.NODE_ENV !== 'development' || userId !== 'dev-user-123') {
      whereClause.userId = userId
    }
    
    const conversation = await prisma!.conversation.findFirst({
      where: whereClause,
    })

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' })
    }

    const messages = await prisma!.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        messageType: true,
        imageUrl: true,
        imagePath: true,
        toolUsed: true,
        metadata: true,
      },
    })

    res.json(messages)
  } catch (error) {
    console.error('Get messages error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// Upload image for analysis or vision chat
router.post('/:conversationId/upload-image', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    const userId = (req as any).userId
    const { conversationId } = req.params

    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' })
    }

    let conversation: any

    if (USE_MEMORY_STORE) {
      memoryStore.ensureUser(userId)
      
      if (conversationId === 'new') {
        conversation = memoryStore.createConversation(userId, 'Image Chat')
      } else {
        conversation = memoryStore.getConversation(conversationId)
        if (!conversation || conversation.userId !== userId) {
          fs.unlinkSync(req.file.path)
          return res.status(404).json({ error: 'Conversation not found' })
        }
      }
    } else {
      // Verify conversation belongs to user
      let conversationQuery = await prisma!.conversation.findFirst({
        where: {
          id: conversationId === 'new' ? undefined : conversationId,
          userId,
        },
      })

      if (!conversationQuery && conversationId === 'new') {
        conversationQuery = await prisma!.conversation.create({
          data: {
            title: 'Image Chat',
            userId,
          },
        })
      }

      if (!conversationQuery) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path)
        return res.status(404).json({ error: 'Conversation not found' })
      }
      conversation = conversationQuery
    }

    res.json({
      success: true,
      imagePath: req.file.path,
      conversationId: conversation.id,
      filename: req.file.originalname,
    })
  } catch (error: any) {
    console.error('Upload image error:', error)
    if (req.file) {
      fs.unlinkSync(req.file.path)
    }
    res.status(500).json({ error: 'Failed to upload image', details: error.message })
  }
})

// Send a message and get AI response (with tool detection)
router.post('/:conversationId/messages', authenticateToken, validate(validationSchemas.sendMessage), async (req, res) => {
  try {
    const userId = (req as any).userId
    const { conversationId } = req.params
    const { content, imagePath, tool, provider, model, apiKey, models, selectionMode, interactionMode, schedule } = req.body

    if (!content && !imagePath) {
      return res.status(400).json({ error: 'Message content or image is required' })
    }

    let conversation: any

    if (USE_MEMORY_STORE) {
      memoryStore.ensureUser(userId)
      
      if (conversationId === 'new') {
        conversation = memoryStore.createConversation(userId, content ? content.slice(0, 50) : 'New Chat')
      } else {
        conversation = memoryStore.getConversation(conversationId)
        if (!conversation || conversation.userId !== userId) {
          return res.status(404).json({ error: 'Conversation not found' })
        }
      }
    } else {
      // Handle new conversation
      if (conversationId === 'new') {
        // In development, ensure user exists
        if (process.env.NODE_ENV === 'development' && userId === 'dev-user-123') {
          let devUser = await prisma!.user.findUnique({
            where: { id: userId },
          })
          
          if (!devUser) {
            const bcrypt = require('bcryptjs')
            devUser = await prisma!.user.create({
              data: {
                id: 'dev-user-123',
                email: 'dev@test.com',
                password: await bcrypt.hash('dev', 10),
                name: 'Dev User',
              },
            })
          }
        }

        conversation = await prisma!.conversation.create({
          data: {
            title: content ? content.slice(0, 50) : 'New Chat',
            userId,
          },
        })
      } else {
        // Verify conversation belongs to user (skip in dev mode if using dev user)
        const whereClause: any = { id: conversationId }
        if (process.env.NODE_ENV !== 'development' || userId !== 'dev-user-123') {
          whereClause.userId = userId
        }
        
        conversation = await prisma!.conversation.findFirst({
          where: whereClause,
        })

        if (!conversation) {
          // In dev mode, create conversation if it doesn't exist
          if (process.env.NODE_ENV === 'development' && userId === 'dev-user-123') {
            conversation = await prisma!.conversation.create({
              data: {
                id: conversationId,
                title: content ? content.slice(0, 50) : 'New Chat',
                userId,
              },
            })
          } else {
            return res.status(404).json({ error: 'Conversation not found' })
          }
        }
      }
    }

    // Detect tool to use
    const hasImage = !!imagePath
    const detection = tool ? { tool: tool as any, confidence: 1.0, parameters: {} } : ToolDetector.detect(content || '', hasImage)
    const toolType = detection.tool

    // Save user message
    let userMessage: any
    if (USE_MEMORY_STORE) {
      userMessage = memoryStore.addMessage(conversation.id, {
        role: 'user',
        content: content || '',
        conversationId: conversation.id,
        messageType: hasImage ? 'mixed' : 'text',
        imagePath: imagePath || null,
        toolUsed: toolType,
      })
    } else {
      userMessage = await prisma!.message.create({
        data: {
          role: 'user',
          content: content || '',
          conversationId: conversation.id,
          messageType: hasImage ? 'mixed' : 'text',
          imagePath: imagePath || null,
          toolUsed: toolType,
        },
      })
    }

    let assistantResponse: any = {
      role: 'assistant',
      content: '',
      messageType: 'text',
      toolUsed: toolType,
    }

    // Process based on tool type
    switch (toolType) {
      case 'generate-image': {
        const prompt = ToolDetector.extractPrompt(content)
        const model = (detection as any).parameters?.model || 'flux-schnell'
        
        const imageResult = await imageApiService.generateImage({
          prompt,
          model: model as any,
          return_base64: true,
        })

        assistantResponse = {
          role: 'assistant',
          content: `Here's your generated image using ${imageResult.model}:`,
          messageType: 'image',
          imageUrl: imageResult.image_base64 ? `data:image/png;base64,${imageResult.image_base64}` : null,
          imagePath: imageResult.image_path || null,
          toolUsed: 'generate-image',
          metadata: {
            model: imageResult.model,
            generationTime: imageResult.generation_time,
          },
        }
        break
      }

      case 'analyze-image': {
        if (!imagePath) {
          return res.status(400).json({ error: 'Image path required for analysis' })
        }

        const analysisResult = await imageApiService.analyzeImage({
          image_path: imagePath,
          model: 'blip',
        })

        assistantResponse = {
          role: 'assistant',
          content: `Image Analysis (${analysisResult.model}):\n\n${analysisResult.description}`,
          messageType: 'text',
          toolUsed: 'analyze-image',
          metadata: {
            model: analysisResult.model,
          },
        }
        break
      }

      case 'vision-chat': {
        if (!imagePath) {
          return res.status(400).json({ error: 'Image path required for vision chat' })
        }

        const question = content || 'What is in this image?'
        const visionResult = await imageApiService.visionChat({
          image_path: imagePath,
          question,
          model: 'llava',
        })

        assistantResponse = {
          role: 'assistant',
          content: visionResult.answer,
          messageType: 'text',
          toolUsed: 'vision-chat',
          metadata: {
            model: visionResult.model,
          },
        }
        break
      }

      case 'chat':
      default: {
        // Regular GPT chat
        let previousMessages: any[]
        if (USE_MEMORY_STORE) {
          previousMessages = memoryStore.getMessages(conversation.id).slice(-20)
        } else {
          previousMessages = await prisma!.message.findMany({
            where: { conversationId: conversation.id },
            orderBy: { createdAt: 'asc' },
            take: 20,
          })
        }

        // Handle interaction modes
        const mode = (interactionMode as InteractionMode) || 'ask'
        
        // Support multiple models or single model
        let aiResponse: string | null = null
        let usedModels: any[] = []
        let modeResult: any = null

        try {
          const aiMessages = previousMessages.map((msg) => ({
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
          }))

          // Handle special interaction modes
          if (mode !== 'ask') {
            // Get provider info for mode-specific handling
            const selectedProvider = (provider as AIProvider) || 'openai'
            const selectedModel = model || process.env.OPENAI_MODEL || aiProviderService.getDefaultModel(selectedProvider)
            const finalApiKey = apiKey || process.env[`${selectedProvider.toUpperCase()}_API_KEY` as any]

            switch (mode) {
              case 'plan':
                modeResult = await interactionModesService.planMode(
                  content,
                  aiMessages,
                  selectedProvider,
                  selectedModel,
                  finalApiKey
                )
                aiResponse = modeResult.response
                break

              case 'agentic':
                modeResult = await interactionModesService.agenticMode(
                  content,
                  aiMessages,
                  selectedProvider,
                  selectedModel,
                  finalApiKey
                )
                aiResponse = modeResult.response
                break

              case 'automation':
                modeResult = await interactionModesService.automationMode(
                  content,
                  aiMessages,
                  selectedProvider,
                  selectedModel,
                  finalApiKey,
                  schedule
                )
                aiResponse = modeResult.response
                break

              default:
                // Fall through to regular chat
                break
            }

            // If mode handling succeeded, prepare response with mode metadata
            if (modeResult) {
              assistantResponse = {
                role: 'assistant',
                content: aiResponse || 'Sorry, I could not generate a response.',
                messageType: 'text',
                toolUsed: 'chat',
                metadata: {
                  mode,
                  plan: modeResult.plan,
                  execution: modeResult.execution,
                  automation: modeResult.automation,
                  provider: selectedProvider,
                  model: selectedModel,
                },
              }
              break
            }
          }

          // Regular chat processing (ask mode or fallback)
          // Check if multiple models are provided
          if (models && Array.isArray(models) && models.length > 0) {
            // Multi-model mode
            const modelConfigs: ModelConfig[] = models.map((m: any) => ({
              provider: m.provider as AIProvider,
              model: m.model,
              apiKey: m.apiKey,
              baseUrl: m.baseUrl,
              priority: m.priority || 0,
              weight: m.weight || 1,
            }))

            multiModelRouter.setModels(modelConfigs, (selectionMode as SelectionMode) || 'auto')
            aiResponse = await multiModelRouter.getMultiModelCompletion(aiMessages, selectionMode as SelectionMode)
            
            usedModels = multiModelRouter.getModelsForQuery().map(m => ({
              provider: m.provider,
              model: m.model,
            }))
          } else {
            // Single model mode (backward compatible)
            const selectedProvider = (provider as AIProvider) || 'openai'
            const selectedModel = model || process.env.OPENAI_MODEL || aiProviderService.getDefaultModel(selectedProvider)

            if (selectedProvider === 'openai' && openai) {
              // Use OpenAI SDK if OpenAI is configured
              try {
                const completion = await openai.chat.completions.create({
                  model: selectedModel,
                  messages: aiMessages as any,
                  temperature: 0.7,
                  max_tokens: 2000,
                })
                aiResponse = completion.choices[0]?.message?.content || ''
              } catch (error: any) {
                // Fallback to provider service
                aiResponse = await aiProviderService.getChatCompletion(
                  selectedProvider,
                  aiMessages,
                  selectedModel,
                  apiKey
                )
              }
            } else {
              // Use provider service for other providers
              aiResponse = await aiProviderService.getChatCompletion(
                selectedProvider,
                aiMessages,
                selectedModel,
                apiKey
              )
            }

            usedModels = [{
              provider: selectedProvider,
              model: selectedModel,
            }]
          }

          assistantResponse = {
            role: 'assistant',
            content: aiResponse || 'Sorry, I could not generate a response.',
            messageType: 'text',
            toolUsed: 'chat',
            metadata: {
              models: usedModels,
              selectionMode: models ? (selectionMode || 'auto') : 'single',
            },
          }
        } catch (error: any) {
          const errorProvider = models && Array.isArray(models) && models.length > 0
            ? `selected models (${models.length} models)`
            : (provider as AIProvider) || 'unknown'
          
          console.error(`AI Provider (${errorProvider}) error:`, error.message)
          
          let errorMessage = `I couldn't get a response from ${errorProvider}`
          if (error.code === 'invalid_api_key' || error.response?.status === 401) {
            errorMessage += '.\n\n**API Key Error**: Please check your API key in the settings.'
          } else if (error.code === 'insufficient_quota') {
            errorMessage += '.\n\n**Quota Exceeded**: Please check your API quota/credits.'
          } else {
            errorMessage += `.\n\nError: ${error.message || 'Unknown error'}\n\nPlease check your API key and provider settings.`
          }
          
          assistantResponse = {
            role: 'assistant',
            content: errorMessage,
            messageType: 'text',
            toolUsed: 'chat',
          }
        }
        
        // If no provider was tried (openai not configured and no provider selected)
        if (!aiResponse && !openai && !provider) {
          // Enhanced response when OpenAI is not available - try to be helpful
          let response = `I understand you said: "${content}"\n\n`
          
          // Check if it's a greeting or question
          const lowerContent = content.toLowerCase()
          if (lowerContent.includes('who') && lowerContent.includes('you')) {
            response = `Hello! I'm Loop GPT, an AI assistant powered by advanced language models.\n\nCurrently, I'm running in fallback mode because the OpenAI API key is not configured. To enable full AI chat capabilities, please set OPENAI_API_KEY in your backend/.env file.\n\nHowever, I can still help you with:\n🎨 Image generation (type "generate image of...")\n👁️ Vision analysis (upload an image)\n🔍 Vision Q&A (upload image + ask questions)\n\nTo get started with image generation, try: "generate image of a sunset" or "draw a cat"`
          } else if (lowerContent.includes('hello') || lowerContent.includes('hi') || lowerContent.includes('hey')) {
            response = `Hello! 👋 I'm Loop GPT, an AI assistant.\n\nI'm currently in fallback mode (OpenAI API not configured), but I can still help with:\n- Image generation\n- Vision analysis\n- Image Q&A\n\nTry: "generate image of a beautiful landscape" or upload an image to analyze it!`
          } else if (lowerContent.includes('help') || lowerContent.includes('what can you do')) {
            response = `I'm Loop GPT! Here's what I can do:\n\n🎨 **Image Generation**\nTry: "generate image of a sunset"\nModels: flux-schnell (fast), flux-dev (quality), sd35\n\n👁️ **Vision Analysis**\nUpload an image and I'll describe it\n\n🔍 **Vision Q&A**\nUpload an image and ask questions about it\n\n💬 **AI Chat**\nSet OPENAI_API_KEY in backend/.env to enable\n\nTo use image generation, say: "generate image of..." or "draw..." or "/image ..."`
          } else {
            response += `\nI'm currently running without OpenAI API. To enable full AI chat, set OPENAI_API_KEY in backend/.env\n\nBut I can help with:\n- Image generation (try "generate image of...")\n- Vision analysis (upload image)\n- Image Q&A (upload + questions)`
          }
          
          assistantResponse = {
            role: 'assistant',
            content: response,
            messageType: 'text',
            toolUsed: 'chat',
          }
        }
        break
      }
    }

    // Save AI message
    let assistantMessage: any
    if (USE_MEMORY_STORE) {
      assistantMessage = memoryStore.addMessage(conversation.id, {
        role: assistantResponse.role,
        content: assistantResponse.content,
        conversationId: conversation.id,
        messageType: assistantResponse.messageType,
        imageUrl: assistantResponse.imageUrl,
        imagePath: assistantResponse.imagePath,
        toolUsed: assistantResponse.toolUsed,
        metadata: assistantResponse.metadata,
      })
      memoryStore.updateConversation(conversation.id, { updatedAt: new Date() })
    } else {
      assistantMessage = await prisma!.message.create({
        data: {
          role: assistantResponse.role,
          content: assistantResponse.content,
          conversationId: conversation.id,
          messageType: assistantResponse.messageType,
          imageUrl: assistantResponse.imageUrl,
          imagePath: assistantResponse.imagePath,
          toolUsed: assistantResponse.toolUsed,
          metadata: assistantResponse.metadata,
        },
      })

      // Update conversation timestamp
      await prisma!.conversation.update({
        where: { id: conversation.id },
        data: { updatedAt: new Date() },
      })
    }

    res.json({
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        createdAt: userMessage.createdAt instanceof Date ? userMessage.createdAt.toISOString() : userMessage.createdAt,
        messageType: userMessage.messageType,
        imagePath: userMessage.imagePath,
        toolUsed: userMessage.toolUsed,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt instanceof Date ? assistantMessage.createdAt.toISOString() : assistantMessage.createdAt,
        messageType: assistantMessage.messageType,
        imageUrl: assistantMessage.imageUrl,
        imagePath: assistantMessage.imagePath,
        toolUsed: assistantMessage.toolUsed,
        metadata: assistantMessage.metadata,
      },
      conversationId: conversation.id,
      toolUsed: toolType,
    })
  } catch (error: any) {
    console.error('Send message error:', error)
    
    // Handle specific OpenAI errors
    if (error.code === 'insufficient_quota') {
      return res.status(402).json({ error: 'OpenAI API quota exceeded' })
    }
    
    if (error.code === 'invalid_api_key') {
      return res.status(500).json({ 
        error: 'OpenAI API key is invalid', 
        details: 'Please set a valid OPENAI_API_KEY in your .env file. The chat will work with a mock response until configured.',
        suggestion: 'Set OPENAI_API_KEY=sk-your-key-here in backend/.env'
      })
    }
    
    // Return a more helpful error message
    const errorMessage = error.message || 'Unknown error'
    res.status(500).json({ 
      error: 'Internal server error', 
      details: errorMessage,
      hint: 'Check backend logs for more details'
    })
  }
})

export default router

