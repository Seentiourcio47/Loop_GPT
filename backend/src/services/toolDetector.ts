/**
 * Detects what tools/actions to use based on user input
 */

export type ToolType = 
  | 'chat'           // Regular chat with GPT
  | 'generate-image' // Text-to-image generation
  | 'analyze-image'  // Image analysis
  | 'vision-chat'    // Vision Q&A
  | 'mcp'            // Model Context Protocol
  | 'gpt-creation'   // GPT creations/tools

interface ToolDetection {
  tool: ToolType
  confidence: number
  parameters?: {
    model?: string
    prompt?: string
  }
}

export class ToolDetector {
  /**
   * Detect tool type from user input
   */
  static detect(input: string, hasImage?: boolean): ToolDetection {
    const lowerInput = input.toLowerCase().trim()

    // Image-related commands
    if (hasImage) {
      // Vision Q&A - questions about images
      if (this.isQuestion(lowerInput)) {
        return {
          tool: 'vision-chat',
          confidence: 0.9,
          parameters: { model: 'llava' },
        }
      }
      // Image analysis
      return {
        tool: 'analyze-image',
        confidence: 0.8,
        parameters: { model: 'blip' },
      }
    }

    // Image generation commands
    const imageKeywords = [
      'generate image',
      'create image',
      'draw',
      'paint',
      'make a picture',
      'show me',
      'image of',
      '/image',
      '/generate',
      '/draw',
    ]

    if (imageKeywords.some(keyword => lowerInput.includes(keyword))) {
      let model: string = 'flux-schnell'
      
      // Detect model preference
      if (lowerInput.includes('flux-dev') || lowerInput.includes('flux dev')) {
        model = 'flux-dev'
      } else if (lowerInput.includes('sd35') || lowerInput.includes('stable diffusion')) {
        model = 'sd35'
      } else if (lowerInput.includes('fast') || lowerInput.includes('quick')) {
        model = 'flux-schnell'
      }

      return {
        tool: 'generate-image',
        confidence: 0.95,
        parameters: { model },
      }
    }

    // MCP commands
    if (lowerInput.startsWith('/mcp') || lowerInput.includes('use mcp')) {
      return {
        tool: 'mcp',
        confidence: 0.9,
      }
    }

    // GPT creation commands
    if (lowerInput.startsWith('/create') || lowerInput.includes('gpt creation')) {
      return {
        tool: 'gpt-creation',
        confidence: 0.9,
      }
    }

    // Default to regular chat
    return {
      tool: 'chat',
      confidence: 1.0,
    }
  }

  private static isQuestion(input: string): boolean {
    const questionWords = ['what', 'where', 'when', 'why', 'how', 'who', 'which', '?']
    return questionWords.some(word => input.startsWith(word)) || input.includes('?')
  }

  /**
   * Extract prompt from input, removing tool commands
   */
  static extractPrompt(input: string): string {
    let prompt = input.trim()

    // Remove tool commands
    const commands = ['/image', '/generate', '/draw', '/mcp', '/create']
    for (const cmd of commands) {
      if (prompt.toLowerCase().startsWith(cmd)) {
        prompt = prompt.substring(cmd.length).trim()
      }
    }

    // Remove model mentions
    prompt = prompt
      .replace(/\b(flux-schnell|flux-dev|sd35|stable diffusion)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()

    return prompt
  }
}

