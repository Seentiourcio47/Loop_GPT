/**
 * generate_image tool: text-to-image generation.
 *
 * Primary path uses Hugging Face Inference Providers text-to-image with the
 * HF token (model from HF_IMAGE_MODEL, default FLUX.1-schnell). If an external
 * IMAGE_API_URL service is configured, it is used as a fallback.
 */
import { saveArtifact } from '../artifacts'
import { imageApiService } from '../../services/imageApi'
import { fetchBuffer, postJson } from '../httpClient'
import type { ToolDefinition } from '../types'

/**
 * Generate an image via Hugging Face Inference Providers.
 *
 * The legacy `hf-inference` text-to-image route is deprecated, so we use the
 * provider-routed OpenAI-compatible images endpoint
 * (`router.huggingface.co/<provider>/v1/images/generations`) and try live
 * providers in order until one returns an image. Responses come back either as
 * base64 (`data[].b64_json`) or a URL (`data[].url`), both of which we handle.
 */
async function hfTextToImage(prompt: string, model: string): Promise<Buffer> {
  const configured = process.env.HF_IMAGE_PROVIDER
  const providers = configured ? [configured] : ['nscale', 'together', 'fal-ai']
  const auth = { Authorization: `Bearer ${process.env.HF_TOKEN || ''}` }
  let lastErr = ''

  for (const provider of providers) {
    try {
      const data = await postJson<any>(
        `https://router.huggingface.co/${provider}/v1/images/generations`,
        { model, prompt, response_format: 'b64_json' },
        { headers: auth, timeoutMs: 120000 }
      )
      const item = data?.data?.[0] || data?.images?.[0]
      if (item?.b64_json) return Buffer.from(item.b64_json, 'base64')
      if (item?.url) return fetchBuffer(item.url, { timeoutMs: 60000 })
      lastErr = `provider ${provider} returned no image`
    } catch (e: any) {
      lastErr = `${provider}: ${e?.message || e}`
    }
  }
  throw new Error(lastErr || 'no image provider succeeded')
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
