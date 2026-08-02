/**
 * web_search tool: search the web.
 *
 * Uses Tavily when TAVILY_API_KEY is configured (high-quality, includes
 * snippets), otherwise falls back to DuckDuckGo's HTML endpoint (no key
 * required, best-effort).
 */
import { JSDOM } from 'jsdom'
import type { ToolDefinition } from '../types'
import { postForm, postJson } from '../httpClient'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export async function searchWeb(query: string, maxResults = 6): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY
  if (tavilyKey) {
    try {
      const data = await postJson<any>(
        'https://api.tavily.com/search',
        { query, max_results: maxResults, search_depth: 'advanced', include_answer: false },
        { headers: { Authorization: `Bearer ${tavilyKey}` } }
      )
      return (data.results || []).map((r: any) => ({ title: r.title, url: r.url, snippet: r.content || '' }))
    } catch {
      // fall through to DuckDuckGo
    }
  }
  return duckDuckGoSearch(query, maxResults)
}

async function duckDuckGoSearch(query: string, maxResults: number): Promise<SearchResult[]> {
  // DuckDuckGo's HTML endpoint expects a POST form (GET returns 405).
  const html = await postForm('https://html.duckduckgo.com/html/', { q: query }, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    },
  })
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const results: SearchResult[] = []
  const nodes = doc.querySelectorAll('.result')
  nodes.forEach((node) => {
    if (results.length >= maxResults) return
    const a = node.querySelector('a.result__a') as HTMLAnchorElement | null
    const snippetEl = node.querySelector('.result__snippet')
    if (!a) return
    let href = a.getAttribute('href') || ''
    // DuckDuckGo wraps links as /l/?uddg=<encoded>
    const m = href.match(/[?&]uddg=([^&]+)/)
    if (m) href = decodeURIComponent(m[1])
    if (!href.startsWith('http')) return
    results.push({
      title: a.textContent?.trim() || href,
      url: href,
      snippet: snippetEl?.textContent?.trim() || '',
    })
  })
  return results
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  source: 'builtin',
  description: 'Search the web for up-to-date information. Returns a list of results with titles, URLs, and snippets. Follow up with web_fetch to read a source in full.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query.' },
      max_results: { type: 'number', description: 'Number of results (default 6).' },
    },
    required: ['query'],
  },
  async handler(args) {
    const query = String(args.query || '').trim()
    if (!query) return { content: 'Error: query is required.', isError: true }
    const max = Math.min(Math.max(Number(args.max_results) || 6, 1), 10)
    try {
      const results = await searchWeb(query, max)
      if (results.length === 0) return { content: `No results for "${query}".`, data: { results: [] } }
      const text = results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`)
        .join('\n\n')
      return { content: text, data: { results } }
    } catch (error: any) {
      return { content: `Search failed: ${error?.message || error}`, isError: true }
    }
  },
}
