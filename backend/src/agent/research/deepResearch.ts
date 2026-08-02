/**
 * Deep research: a multi-step orchestrated agent that plans queries, searches
 * the web, reads the top sources, and synthesizes a cited report — streaming
 * progress the whole way. Modeled on Claude/ChatGPT "deep research".
 */
import type { AIProvider } from '../../services/aiProviders'
import { createClient, resolveModel, completeOnce, streamTurn } from '../llmClient'
import { searchWeb, type SearchResult } from '../tools/webSearch'
import { fetchReadable } from '../tools/webFetch'
import type { ChatMessage, ToolContext } from '../types'
import { agentConfig } from '../config'
import { CONFIDENTIALITY_PROMPT, sanitizeText, sanitizeMetadata, makeStreamSanitizer, guardrailsEnabled } from '../guardrails'

export interface DeepResearchOptions {
  query: string
  provider: AIProvider
  model: string
  apiKey?: string
  baseUrl?: string
  ctx: ToolContext
  maxQueries?: number
  maxSources?: number
}

export interface DeepResearchResult {
  content: string
  sources: Array<{ index: number; title: string; url: string }>
}

async function planQueries(client: any, model: string, query: string, max: number): Promise<string[]> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You plan web research. Given a topic, output ONLY a JSON array of 3-5 focused, diverse search queries. No prose.' },
    { role: 'user', content: `Topic: ${query}` },
  ]
  try {
    const out = await completeOnce(client, model, messages, 0.3, 400)
    const m = out.match(/\[[\s\S]*\]/)
    if (m) {
      const arr = JSON.parse(m[0])
      if (Array.isArray(arr)) return arr.map(String).slice(0, max)
    }
  } catch {
    /* fall through */
  }
  return [query]
}

export async function runDeepResearch(opts: DeepResearchOptions): Promise<DeepResearchResult> {
  const { ctx, query } = opts
  const model = resolveModel(opts.provider, opts.model)
  const client = createClient(opts.provider, opts.apiKey, opts.baseUrl)
  const maxQueries = opts.maxQueries ?? agentConfig.research.maxQueries
  const maxSources = opts.maxSources ?? agentConfig.research.maxSources

  let step = 0
  ctx.emit({ type: 'warming', message: 'Planning research…' })
  const queries = await planQueries(client, model, query, maxQueries)

  // Search phase.
  ctx.emit({ type: 'tool_call', step, name: 'plan', args: { queries } })
  ctx.emit({ type: 'tool_result', step, name: 'plan', content: `Planned ${queries.length} queries:\n${queries.map((q) => '• ' + q).join('\n')}` })
  step++

  const seen = new Set<string>()
  const hits: SearchResult[] = []
  await Promise.all(
    queries.map(async (q) => {
      ctx.emit({ type: 'tool_call', step, name: 'web_search', args: { query: q } })
      try {
        const results = await searchWeb(q, 5)
        for (const r of results) {
          if (!seen.has(r.url)) {
            seen.add(r.url)
            hits.push(r)
          }
        }
        ctx.emit({ type: 'tool_result', step, name: 'web_search', content: `${results.length} results for "${q}"`, data: { results } })
      } catch (e: any) {
        ctx.emit({ type: 'tool_result', step, name: 'web_search', content: `Search failed: ${e?.message}`, isError: true })
      }
    })
  )
  step++

  // Read the top sources.
  const chosen = hits.slice(0, maxSources)
  const sources: Array<{ index: number; title: string; url: string; text: string }> = []
  await Promise.all(
    chosen.map(async (r, i) => {
      ctx.emit({ type: 'tool_call', step, name: 'web_fetch', args: { url: r.url } })
      try {
        const { title, text } = await fetchReadable(r.url, 4000)
        sources.push({ index: i + 1, title: title || r.title, url: r.url, text })
        ctx.emit({ type: 'tool_result', step, name: 'web_fetch', content: `Read [${i + 1}] ${title || r.title}`, data: { url: r.url } })
      } catch (e: any) {
        // Fall back to the snippet if the page cannot be fetched.
        sources.push({ index: i + 1, title: r.title, url: r.url, text: r.snippet })
        ctx.emit({ type: 'tool_result', step, name: 'web_fetch', content: `Could not fully read [${i + 1}]; using snippet.`, isError: true })
      }
    })
  )
  sources.sort((a, b) => a.index - b.index)
  step++

  // Synthesis phase (streamed).
  ctx.emit({ type: 'warming', message: 'Synthesizing findings…' })
  const sourceBlock = sources
    .map((s) => `[${s.index}] ${s.title} — ${s.url}\n${s.text}`)
    .join('\n\n---\n\n')

  const synthMessages: ChatMessage[] = [
    {
      role: 'system',
      content:
        (guardrailsEnabled ? CONFIDENTIALITY_PROMPT + '\n\n' : '') +
        'You are a meticulous research analyst. Write a well-structured, comprehensive report answering the user\'s topic using ONLY the provided sources. Cite claims inline with [n] matching the source numbers. Use Markdown headings and bullet points. End with a "Sources" list of [n] title — url.',
    },
    { role: 'user', content: `Topic: ${query}\n\nSOURCES:\n${sourceBlock}` },
  ]

  const sanitizer = makeStreamSanitizer((text) => ctx.emit({ type: 'delta', step, text }))
  const turn = await streamTurn({
    client,
    model,
    messages: synthMessages,
    maxTokens: agentConfig.maxSynthesisTokens,
    signal: ctx.signal,
    onDelta: (text) => sanitizer.push(text),
  })
  sanitizer.flush()

  const finalContent = sanitizeText(turn.content)
  const citations = sources.map((s) => ({ index: s.index, title: s.title, url: s.url }))
  ctx.emit({ type: 'final', content: finalContent, metadata: sanitizeMetadata({ mode: 'research', sources: citations }) })
  return { content: finalContent, sources: citations }
}
