import axios from 'axios'

const VIDEO_API_URL = process.env.HF_VIDEO_ENDPOINT || process.env.VIDEO_API_URL || 'http://localhost:8082'
const VIDEO_LONG_API_URL = process.env.HF_VIDEO_LONG_ENDPOINT || process.env.VIDEO_LONG_API_URL || VIDEO_API_URL
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_TOKEN || ''

interface GenerateVideoRequest {
  prompt: string
  duration?: 'short' | 'long'
  num_frames?: number
  width?: number
  height?: number
  fps?: number
  num_inference_steps?: number
}

interface GenerateVideoResponse {
  success: boolean
  video_base64?: string
  video_url?: string
  format: string
  frames?: number
  duration_seconds?: number
  model: string
}

class VideoApiService {
  private videoUrl: string
  private videoLongUrl: string
  private token: string
  private isHfEndpoint: boolean

  constructor() {
    this.videoUrl = VIDEO_API_URL
    this.videoLongUrl = VIDEO_LONG_API_URL
    this.token = HF_TOKEN
    this.isHfEndpoint = this.videoUrl.includes('endpoints.huggingface.cloud')
  }

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
   * Generate video from text prompt
   */
  async generateVideo(request: GenerateVideoRequest): Promise<GenerateVideoResponse> {
    const isLong = request.duration === 'long'
    const apiUrl = isLong ? this.videoLongUrl : this.videoUrl
    const isHf = apiUrl.includes('endpoints.huggingface.cloud')

    try {
      // Check API availability first
      await this.ensureApiAvailable(apiUrl, isHf)

      if (!request.prompt || request.prompt.trim().length === 0) {
        throw new Error('Prompt is required for video generation')
      }

      // Default params based on duration
      const defaultFrames = isLong ? 257 : 25  // long: ~10s, short: ~1s
      const defaultSteps = isLong ? 10 : 15
      const defaultHeight = isLong ? 544 : 480
      const defaultWidth = isLong ? 960 : 832

      const num_frames = request.num_frames || defaultFrames
      const num_inference_steps = request.num_inference_steps || defaultSteps
      const height = request.height || defaultHeight
      const width = request.width || defaultWidth
      const fps = request.fps || 24

      console.log(`[video] Generating ${isLong ? 'long' : 'short'} video: ${request.prompt.substring(0, 100)}`)
      console.log(`[video] Params: ${width}x${height}, ${num_frames} frames, ${num_inference_steps} steps, ${fps}fps`)

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (this.token && isHf) {
        headers['Authorization'] = `Bearer ${this.token}`
      }

      // HF endpoint format: POST / with {inputs, parameters}
      // Also try /api/generate-video format for backend compatibility
      const body = JSON.stringify({
        inputs: request.prompt,
        parameters: {
          num_frames,
          height,
          width,
          num_inference_steps,
          fps,
        }
      })

      // Use longer timeout for video generation (10 minutes)
      const response = await axios.post(apiUrl, body, {
        headers,
        timeout: 600000,
      })

      if (!response.data) {
        throw new Error('Invalid response from video API: missing data')
      }

      const video_base64 = response.data.video || response.data.video_base64
      if (!video_base64) {
        throw new Error('Invalid response from video API: missing video data')
      }

      const frames = response.data.frames || num_frames
      const duration_seconds = response.data.duration || frames / fps

      console.log(`[video] Done: ${frames} frames, ${duration_seconds}s`)

      return {
        success: true,
        video_base64,
        format: response.data.format || 'mp4',
        frames,
        duration_seconds,
        model: isLong ? 'skyreels-v2-df-1.3b' : 'wan2.2-ti2v-5b',
      }
    } catch (error: any) {
      console.error('Video generation error:', error)
      
      if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        throw new Error(`Video API is not reachable at ${apiUrl}. Please check if the service is running.`)
      }
      
      if (error.response?.status === 400) {
        throw new Error(error.response?.data?.error || 'Invalid request to video API')
      }
      
      if (error.response?.status === 500) {
        const errMsg = error.response?.data?.error || error.response?.data?.traceback || 'Server error'
        throw new Error(`Video API server error: ${typeof errMsg === 'string' ? errMsg.substring(0, 200) : 'Unknown'}`)
      }
      
      throw new Error(error.message || 'Failed to generate video')
    }
  }

  /**
   * Health check for video API
   */
  async healthCheck(apiUrl?: string, isHf?: boolean): Promise<{ healthy: boolean; error?: string }> {
    const url = apiUrl || this.videoUrl
    const hf = isHf !== undefined ? isHf : this.isHfEndpoint
    try {
      const headers: Record<string, string> = {}
      if (this.token && hf) {
        headers['Authorization'] = `Bearer ${this.token}`
      }
      const response = await axios.get(`${url}/health`, {
        headers,
        timeout: 10000,
      })
      return { healthy: response.status === 200 }
    } catch (error: any) {
      return {
        healthy: false,
        error: error.message || 'Video API is not reachable',
      }
    }
  }

  /**
   * Check if video API is available before making requests
   */
  private async ensureApiAvailable(apiUrl: string, isHf: boolean): Promise<void> {
    const health = await this.healthCheck(apiUrl, isHf)
    if (!health.healthy) {
      throw new Error(`Video API is not available: ${health.error || 'Unknown error'}`)
    }
  }
}

export const videoApiService = new VideoApiService()
