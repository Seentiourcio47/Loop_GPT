import axios from 'axios'

const IMAGE_API_URL = process.env.IMAGE_API_URL || process.env.HF_IMAGE_ENDPOINT || 'http://localhost:8081'
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_TOKEN || ''

interface GenerateImageRequest {
  prompt: string
  model?: 'flux-schnell' | 'flux-dev' | 'sd35'
  return_base64?: boolean
}

interface GenerateImageResponse {
  image_path?: string
  image_base64?: string
  success: boolean
  model: string
  generation_time?: number
}

interface AnalyzeImageRequest {
  image_path: string
  model?: 'blip' | 'llava'
}

interface AnalyzeImageResponse {
  description: string
  success: boolean
  model: string
}

interface VisionChatRequest {
  image_path: string
  question: string
  model?: 'llava'
}

interface VisionChatResponse {
  answer: string
  success: boolean
  model: string
}

class ImageApiService {
  private apiUrl: string
  private token: string
  private isHfEndpoint: boolean

  constructor() {
    this.apiUrl = IMAGE_API_URL
    this.token = HF_TOKEN
    // Detect if we're using a HF dedicated inference endpoint
    this.isHfEndpoint = this.apiUrl.includes('endpoints.huggingface.cloud')
  }

  /**
   * Get auth headers for HF endpoint
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.token && this.isHfEndpoint) {
      headers['Authorization'] = `Bearer ${this.token}`
    }
    return headers
  }

  /**
   * Generate image from text prompt
   */
  async generateImage(request: GenerateImageRequest): Promise<GenerateImageResponse> {
    try {
      // Check API availability first
      await this.ensureApiAvailable()

      if (!request.prompt || request.prompt.trim().length === 0) {
        throw new Error('Prompt is required for image generation')
      }

      if (this.isHfEndpoint) {
        // HF dedicated endpoint format: POST / with {"inputs": "...", "parameters": {...}}
        const response = await axios.post(`${this.apiUrl}`, {
          inputs: request.prompt,
          parameters: {
            width: 1024,
            height: 1024,
            num_inference_steps: 30,
            guidance_scale: 1.5,
          },
        }, {
          headers: this.getHeaders(),
          timeout: 300000, // 5 minutes for GLM-Image on A100
        })

        if (!response.data || !response.data.image) {
          throw new Error('Invalid response from image API: missing image data')
        }

        return {
          success: true,
          image_base64: response.data.image,
          model: 'glm-image',
          generation_time: response.data.generation_time,
        }
      } else {
        // Original format for local image API service
        const response = await axios.post(`${this.apiUrl}/api/generate`, {
          prompt: request.prompt,
          model: request.model || 'flux-schnell',
          return_base64: request.return_base64 !== false,
        }, {
          timeout: 120000,
        })

        if (!response.data || (!response.data.image_path && !response.data.image_base64)) {
          throw new Error('Invalid response from image API: missing image data')
        }

        return {
          success: true,
          image_path: response.data.image_path,
          image_base64: response.data.image_base64,
          model: response.data.model || request.model || 'flux-schnell',
          generation_time: response.data.generation_time,
        }
      }
    } catch (error: any) {
      console.error('Image generation error:', error)
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Image API is not reachable at ${this.apiUrl}. Please check if the service is running.`)
      }
      
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error || 'Invalid request to image API')
      }
      
      if (error.response?.status === 500) {
        throw new Error('Image API server error. Please try again later.')
      }
      
      throw new Error(error.message || 'Failed to generate image')
    }
  }

  /**
   * Analyze image and get description
   */
  async analyzeImage(request: AnalyzeImageRequest): Promise<AnalyzeImageResponse> {
    try {
      await this.ensureApiAvailable()

      if (!request.image_path) {
        throw new Error('Image path is required for analysis')
      }

      // For HF endpoint, use the chat LLM for vision analysis
      if (this.isHfEndpoint) {
        const chatEndpoint = process.env.HF_CHAT_ENDPOINT || ''
        if (chatEndpoint) {
          const response = await axios.post(`${chatEndpoint}/v1/chat/completions`, {
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: `Describe this image in detail: ${request.image_path}` },
                  { type: 'image_url', image_url: { url: request.image_path } },
                ],
              },
            ],
            max_tokens: 500,
          }, {
            headers: this.getHeaders(),
            timeout: 60000,
          })

          return {
            success: true,
            description: response.data.choices[0]?.message?.content || 'Unable to analyze image',
            model: 'qwen3.6-27b',
          }
        }
      }

      const response = await axios.post(`${this.apiUrl}/api/analyze`, {
        image_path: request.image_path,
        model: request.model || 'blip',
      }, {
        headers: this.getHeaders(),
        timeout: 30000,
      })

      if (!response.data || !response.data.description) {
        throw new Error('Invalid response from image API: missing description')
      }

      return {
        success: true,
        description: response.data.description,
        model: response.data.model || request.model || 'blip',
      }
    } catch (error: any) {
      console.error('Image analysis error:', error)
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Image API is not reachable at ${this.apiUrl}. Please check if the service is running.`)
      }
      
      throw new Error(error.response?.data?.error || error.message || 'Failed to analyze image')
    }
  }

  /**
   * Vision Q&A - ask questions about images
   */
  async visionChat(request: VisionChatRequest): Promise<VisionChatResponse> {
    try {
      await this.ensureApiAvailable()

      if (!request.image_path) {
        throw new Error('Image path is required for vision chat')
      }

      if (!request.question || request.question.trim().length === 0) {
        throw new Error('Question is required for vision chat')
      }

      // For HF endpoint, use the chat LLM for vision Q&A
      if (this.isHfEndpoint) {
        const chatEndpoint = process.env.HF_CHAT_ENDPOINT || ''
        if (chatEndpoint) {
          const response = await axios.post(`${chatEndpoint}/v1/chat/completions`, {
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'text', text: request.question },
                  { type: 'image_url', image_url: { url: request.image_path } },
                ],
              },
            ],
            max_tokens: 500,
          }, {
            headers: this.getHeaders(),
            timeout: 60000,
          })

          return {
            success: true,
            answer: response.data.choices[0]?.message?.content || 'Unable to process vision chat',
            model: 'qwen3.6-27b',
          }
        }
      }

      const response = await axios.post(`${this.apiUrl}/api/vision-chat`, {
        image_path: request.image_path,
        question: request.question,
        model: request.model || 'llava',
      }, {
        headers: this.getHeaders(),
        timeout: 60000,
      })

      if (!response.data || !response.data.answer) {
        throw new Error('Invalid response from image API: missing answer')
      }

      return {
        success: true,
        answer: response.data.answer,
        model: response.data.model || request.model || 'llava',
      }
    } catch (error: any) {
      console.error('Vision chat error:', error)
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Image API is not reachable at ${this.apiUrl}. Please check if the service is running.`)
      }
      
      throw new Error(error.response?.data?.error || error.message || 'Failed to process vision chat')
    }
  }

  /**
   * Health check for image API
   */
  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, {
        headers: this.getHeaders(),
        timeout: 10000,
      })
      return { healthy: response.status === 200 }
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message || 'Image API is not reachable',
      }
    }
  }

  /**
   * Check if image API is available before making requests
   */
  private async ensureApiAvailable(): Promise<void> {
    const health = await this.healthCheck()
    if (!health.healthy) {
      throw new Error(`Image API is not available: ${health.error || 'Unknown error'}`)
    }
  }
}

export const imageApiService = new ImageApiService()

