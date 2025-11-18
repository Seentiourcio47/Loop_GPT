/**
 * Multi-Model Router - Supports multiple LLM selection and auto-routing
 */

import { aiProviderService, AIProvider } from './aiProviders'

export interface ModelConfig {
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  weight?: number // For weighted selection
  priority?: number // For priority-based selection
}

export type SelectionMode = 'auto' | 'all' | 'best' | 'first' | 'round-robin'

export class MultiModelRouter {
  private selectedModels: ModelConfig[] = []
  private currentIndex = 0 // For round-robin
  private selectionMode: SelectionMode = 'auto'

  /**
   * Set selected models
   */
  setModels(models: ModelConfig[], mode: SelectionMode = 'auto') {
    this.selectedModels = models
    this.selectionMode = mode
  }

  /**
   * Get models for current selection mode
   */
  getModelsForQuery(): ModelConfig[] {
    if (this.selectedModels.length === 0) {
      return []
    }

    switch (this.selectionMode) {
      case 'auto':
        return this.selectAutoModels()
      case 'all':
        return this.selectedModels
      case 'best':
        return [this.selectedModels.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0]]
      case 'first':
        return [this.selectedModels[0]]
      case 'round-robin':
        return [this.selectedModels[this.currentIndex++ % this.selectedModels.length]]
      default:
        return this.selectedModels
    }
  }

  /**
   * Auto-select models based on criteria (speed, cost, quality)
   */
  private selectAutoModels(): ModelConfig[] {
    if (this.selectedModels.length === 0) return []
    if (this.selectedModels.length === 1) return this.selectedModels

    // Auto mode: prefer faster models for simple queries, better models for complex
    // For now, return the first two models (you can enhance this with query complexity detection)
    const sorted = this.selectedModels.sort((a, b) => {
      // Prioritize by priority, then by weight
      if (a.priority !== b.priority) {
        return (b.priority || 0) - (a.priority || 0)
      }
      return (b.weight || 0) - (a.weight || 0)
    })

    // Return top 1-2 models based on priority
    return sorted.slice(0, Math.min(2, sorted.length))
  }

  /**
   * Get chat completion using multiple models
   */
  async getMultiModelCompletion(
    messages: Array<{ role: string; content: string }>,
    mode?: SelectionMode
  ): Promise<string> {
    const models = mode ? this.getModelsForMode(mode) : this.getModelsForQuery()

    if (models.length === 0) {
      throw new Error('No models selected')
    }

    // If single model, use it directly
    if (models.length === 1) {
      const model = models[0]
      return aiProviderService.getChatCompletion(
        model.provider,
        messages,
        model.model,
        model.apiKey,
        model.baseUrl
      )
    }

    // Multiple models: try in parallel and return first successful response
    // Or you could implement ensemble voting, best-of-N, etc.
    const promises = models.map(async (model) => {
      try {
        const response = await aiProviderService.getChatCompletion(
          model.provider,
          messages,
          model.model,
          model.apiKey,
          model.baseUrl
        )
        return { model: model.provider, response, success: true }
      } catch (error: any) {
        return { model: model.provider, response: null, success: false, error: error.message }
      }
    })

    const results = await Promise.allSettled(promises)

    // Return first successful response
    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.response) {
        return result.value.response
      }
    }

    // If all failed, throw error
    throw new Error('All selected models failed to generate response')
  }

  /**
   * Get models for specific mode
   */
  private getModelsForMode(mode: SelectionMode): ModelConfig[] {
    const originalMode = this.selectionMode
    this.selectionMode = mode
    const models = this.getModelsForQuery()
    this.selectionMode = originalMode
    return models
  }

  /**
   * Get all selected models
   */
  getAllModels(): ModelConfig[] {
    return this.selectedModels
  }

  /**
   * Get current selection mode
   */
  getSelectionMode(): SelectionMode {
    return this.selectionMode
  }
}

export const multiModelRouter = new MultiModelRouter()

