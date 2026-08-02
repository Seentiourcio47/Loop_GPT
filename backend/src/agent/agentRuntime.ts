/**
 * The agent runtime: a streaming tool-calling loop.
 *
 * Robustness strategy for an unknown llama.cpp deployment:
 *  - We ALWAYS inject a compact JSON tool protocol into the system prompt, so a
 *    model that ignores the OpenAI "tools" channel can still call tools by
 *    emitting an inline JSON object (ReAct-style).
 *  - We ALSO pass native `tools` to the API (best effort). If that request
 *    errors (e.g. server started without --jinja), we cache that the endpoint
 *    lacks native tool support and continue in inline-JSON mode.
 *  - Each turn we look for a tool call in BOTH `message.tool_calls` and the
 *    inline JSON — whichever appears.
 */
import type { AIProvider } from '../services/aiProviders'
import { toolRegistry } from './toolRegistry'
import {
  createClient,
  resolveModel,
  streamTurn,
  isOpenAICompatible,
} from './llmClient'
import { aiProviderService } from '../services/aiProviders'
import type {
  ChatMessage,
  RunAgentOptions,
  ToolDefinition,
} from './types'

/** Per-baseURL memo of whether native tool-calling works. */
const nativeToolSupport = new Map<string, boolean>()

export interface RunAgentResult {
  content: string
  steps: Array<{ tool?: string; args?: any; result?: string }>
  toolsUsed: string[]
}

function buildToolGuide(tools: ToolDefinition[]): string {
  const lines = tools.map((t) => {
    const params = JSON.stringify(t.parameters?.properties || {})
    return `- ${t.name}: ${t.description} | arguments: ${params}`
  })
  return [
    'You have access to the following tools:',
    ...lines,
    '',
    'To use a tool, reply with ONLY a JSON object and nothing else:',
    '{"tool": "<tool_name>", "arguments": { ... }}',
    'You will then receive a message starting with "TOOL_RESULT". Use it to decide your next step.',
    'You may call tools multiple times in sequence. When you have enough information,',
    'reply to the user in normal prose (no JSON). Never fabricate tool results.',
  ].join('\n')
}

/** Try to extract an inline JSON tool call from a model turn. */
export function parseInlineToolCall(
  content: string
): { name: string; args: Record<string, any> } | null {
  if (!content) return null
  const candidates: string[] = []

  // Fenced ```json ... ``` blocks.
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi
  let m: RegExpExecArray | null
  while ((m = fenceRe.exec(content))) candidates.push(m[1])

  // The largest bare {...} span.
  const first = content.indexOf('{')
  const last = content.lastIndexOf('}')
  if (first !== -1 && last > first) candidates.push(content.slice(first, last + 1))

  for (const raw of candidates) {
    try {
      const obj = JSON.parse(raw.trim())
      const name = obj.tool || obj.tool_name || obj.name || obj.action
      const args = obj.arguments || obj.args || obj.parameters || obj.input || {}
      if (name && typeof name === 'string' && toolRegistry.has(name)) {
        return { name, args: typeof args === 'object' && args ? args : {} }
      }
    } catch {
      // not valid JSON, try next candidate
    }
  }
  return null
}

/**
 * Run the agent loop, streaming events through ctx.emit. Returns the final
 * answer and a trace of the steps taken.
 */
export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const {
    provider,
    apiKey,
    baseUrl,
    ctx,
    maxSteps = 8,
    systemPrompt,
    toolNames,
  } = opts

  const model = resolveModel(provider, opts.model)
  const tools = toolRegistry.resolve(toolNames)
  const hasTools = tools.length > 0

  // Providers that aren't OpenAI-compatible (e.g. Anthropic native): use the
  // simple non-streaming path with no tools.
  if (!isOpenAICompatible(provider)) {
    ctx.emit({ type: 'status', message: `Querying ${provider}…` })
    const text = await aiProviderService.getChatCompletion(
      provider,
      opts.messages.map((m) => ({ role: m.role, content: contentToString(m.content) })),
      model,
      apiKey,
      baseUrl
    )
    ctx.emit({ type: 'delta', step: 0, text })
    ctx.emit({ type: 'final', content: text })
    return { content: text, steps: [], toolsUsed: [] }
  }

  const client = createClient(provider, apiKey, baseUrl)
  const cfgKey = `${provider}:${baseUrl || process.env.HF_ENDPOINT_URL || ''}`

  // Assemble the working message list with system prompt + tool guide.
  const working: ChatMessage[] = []
  const sys = [systemPrompt, hasTools ? buildToolGuide(tools) : '']
    .filter(Boolean)
    .join('\n\n')
  if (sys) working.push({ role: 'system', content: sys })
  working.push(...opts.messages)

  const openaiTools = hasTools ? toolRegistry.toOpenAITools(toolNames) : undefined
  const steps: RunAgentResult['steps'] = []
  const toolsUsed = new Set<string>()

  let stepIndex = 0
  let finalContent = ''

  ctx.emit({ type: 'warming', message: 'Contacting model (may take a moment on cold start)…' })

  for (let iter = 0; iter < maxSteps; iter++) {
    const useNative = hasTools && nativeToolSupport.get(cfgKey) !== false

    let turn
    try {
      turn = await streamTurn({
        client,
        model,
        messages: working,
        tools: useNative ? openaiTools : undefined,
        signal: ctx.signal,
        onDelta: (text) => ctx.emit({ type: 'delta', step: stepIndex, text }),
      })
    } catch (err: any) {
      // If native tool params likely caused the failure, disable and retry.
      if (useNative && nativeToolSupport.get(cfgKey) === undefined) {
        nativeToolSupport.set(cfgKey, false)
        iter--
        continue
      }
      throw err
    }

    // A successful native-tools request confirms support.
    if (useNative && nativeToolSupport.get(cfgKey) === undefined) {
      nativeToolSupport.set(cfgKey, true)
    }

    // Determine whether a tool was requested (native first, then inline JSON).
    let toolName: string | null = null
    let toolArgs: Record<string, any> = {}
    let nativeCallId: string | undefined

    if (turn.toolCalls.length > 0) {
      const call = turn.toolCalls[0]
      toolName = call.name
      nativeCallId = call.id
      try {
        toolArgs = call.arguments ? JSON.parse(call.arguments) : {}
      } catch {
        toolArgs = {}
      }
    } else if (hasTools) {
      const inline = parseInlineToolCall(turn.content)
      if (inline) {
        toolName = inline.name
        toolArgs = inline.args
      }
    }

    if (!toolName) {
      // No tool requested → this is the final answer.
      finalContent = turn.content
      break
    }

    // Execute the tool.
    ctx.emit({ type: 'tool_call', step: stepIndex, name: toolName, args: toolArgs, source: toolRegistry.get(toolName)?.source })
    toolsUsed.add(toolName)
    const result = await toolRegistry.execute(toolName, toolArgs, ctx)
    ctx.emit({
      type: 'tool_result',
      step: stepIndex,
      name: toolName,
      content: truncate(result.content, 4000),
      data: result.data,
      isError: result.isError,
    })
    steps.push({ tool: toolName, args: toolArgs, result: truncate(result.content, 2000) })

    // Append the exchange to the working context for the next turn.
    if (nativeCallId) {
      working.push({
        role: 'assistant',
        content: turn.content || '',
        // @ts-expect-error tool_calls is valid on assistant messages
        tool_calls: [
          { id: nativeCallId, type: 'function', function: { name: toolName, arguments: JSON.stringify(toolArgs) } },
        ],
      })
      working.push({ role: 'tool', tool_call_id: nativeCallId, name: toolName, content: result.content })
    } else {
      // Inline-JSON mode: use plain messages that any server accepts.
      working.push({ role: 'assistant', content: turn.content })
      working.push({ role: 'user', content: `TOOL_RESULT (${toolName}):\n${result.content}` })
    }

    stepIndex++
  }

  if (!finalContent) {
    finalContent = 'I reached the maximum number of reasoning steps. Here is what I have so far:\n\n' +
      steps.map((s) => `- ${s.tool}: ${s.result || ''}`).join('\n')
  }

  ctx.emit({ type: 'final', content: finalContent, metadata: { toolsUsed: Array.from(toolsUsed), steps } })
  return { content: finalContent, steps, toolsUsed: Array.from(toolsUsed) }
}

function contentToString(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .map((p) => (p.type === 'text' ? p.text : '[image]'))
    .join('\n')
}

function truncate(s: string, max: number): string {
  if (!s) return ''
  return s.length > max ? s.slice(0, max) + `\n…[truncated ${s.length - max} chars]` : s
}
