/**
 * generate_image tool: text-to-image generation.
 *
 * Primary path uses Hugging Face Inference Providers text-to-image with the
 * HF token (model from HF_IMAGE_MODEL, default FLUX.1-schnell). If an external
 * IMAGE_API_URL service is configured, it is used as a fallback.
 */
import { saveArtifact } from '../artifacts'
import { imageApiService } from '../../services/imageApi'
import { fetchBuffer } from '../httpClient'
import type { ToolDefinition } from '../types'

async function hfTextToImage(prompt: string, model: string): Promise<Buffer> {
  // HF Inference Providers router — returns raw image bytes.
  const url = `https://router.huggingface.co/hf-inference/models/${model}`
  return fetchBuffer(url, {
    method: 'POST',
    body: { inputs: prompt },
    headers: {
      Authorization: `Bearer ${process.env.HF_TOKEN || ''}`,
      'Content-Type': 'application/json',
      Accept: 'image/png',
    },
    timeoutMs: 120000,
  })
}

export const generateImageTool: ToolDefinition = {
  name: 'generate_image',
  source: 'builtin',
  description: 'Generate an image from a text prompt. Returns an image artifact the user can view and download.',
  parameters: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'A detailed description of the image to generate.' },
    },
    required: ['prompt'],
  },
  async handler(args, ctx) {
    const prompt = String(args.prompt || '').trim()
    if (!prompt) return { content: 'Error: prompt is required.', isError: true }
    const model = process.env.HF_IMAGE_MODEL || 'black-forest-labs/FLUX.1-schnell'

    let buffer: Buffer | null = null
    let usedModel = model
    try {
      if (process.env.HF_TOKEN) {
        buffer = await hfTextToImage(prompt, model)
      }
    } catch (error: any) {
      ctx.emit({ type: 'status', message: `HF image gen failed (${error?.message || error}); trying fallback…` })
    }

    // Fallback to the external image service if configured.
    if (!buffer && process.env.IMAGE_API_URL) {
      try {
        const result = await imageApiService.generateImage({ prompt, model: 'flux-schnell', return_base64: true })
        if (result.image_base64) {
          buffer = Buffer.from(result.image_base64, 'base64')
          usedModel = result.model
        }
      } catch (error: any) {
        return { content: `Image generation failed: ${error?.message || error}`, isError: true }
      }
    }

    if (!buffer) {
      return { content: 'Image generation is not configured (set HF_TOKEN or IMAGE_API_URL).', isError: true }
    }

    const artifact = saveArtifact(`${prompt.slice(0, 30).replace(/\s+/g, '-')}.png`, buffer)
    ctx.scratch.artifacts = ctx.scratch.artifacts || []
    ctx.scratch.artifacts.push(artifact)
    ctx.emit({ type: 'artifact', artifact })
    return {
      content: `Generated an image for "${prompt}" using ${usedModel}. It is shown to the user.`,
      data: { artifact },
    }
  },
}
