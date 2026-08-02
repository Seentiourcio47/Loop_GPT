/**
 * Agentic endpoints: streaming chat/agent/research runs (SSE) plus management
 * of tools, MCP servers, connectors, skills, and plugins.
 */
import express from 'express'
import fs from 'fs'
import { authenticateToken } from './auth'
import { getOrCreateConversation, getHistory, saveMessage } from '../services/chatStore'
import { runAgent } from '../agent/agentRuntime'
import { runDeepResearch } from '../agent/research/deepResearch'
import { toolRegistry } from '../agent/toolRegistry'
import { initSSE, sendEvent, endSSE, makeEmitter } from '../agent/streaming'
import type { AgentEvent, ChatMessage, ContentPart, ToolContext } from '../agent/types'
import type { AIProvider } from '../services/aiProviders'
import { getActiveSkills, buildSkillPrompt, getAllSkills, createUserSkill, deleteUserSkill } from '../agent/skills/skillLoader'
import { customToolRegistry } from '../agent/customTools'
import { mcpRegistry } from '../agent/mcp/mcpRegistry'
import { connectorRegistry } from '../agent/connectors/connectorRegistry'
import { pluginRegistry } from '../agent/plugins/pluginLoader'
import { configStore } from '../agent/configStore'
import { agentConfig } from '../agent/config'

const router = express.Router()

const BASE_SYSTEM_PROMPT =
  'You are Loop GPT, an advanced agentic AI assistant. You are helpful, precise, and thorough. ' +
  'You can read images, search and read the web, generate images, and create documents when it helps. ' +
  'Prefer using a tool to look things up rather than guessing. Answer in clear Markdown.'

function fileToDataUri(imagePath: string): string | null {
  try {
    if (!fs.existsSync(imagePath)) return null
    const buf = fs.readFileSync(imagePath)
    const ext = imagePath.split('.').pop()?.toLowerCase() || 'png'
    const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

function resolveProvider(body: any): { provider: AIProvider; model?: string; apiKey?: string; baseUrl?: string } {
  const provider = (body.provider as AIProvider) || (process.env.DEFAULT_PROVIDER as AIProvider) || 'huggingface'
  const model = body.model || process.env.DEFAULT_MODEL || undefined
  const apiKey = body.apiKey || undefined
  const baseUrl = body.baseUrl || undefined
  return { provider, model, apiKey, baseUrl }
}

/**
 * POST /:conversationId/stream
 * Body: { content, imagePath?, mode?: 'chat'|'agent'|'research', provider?, model?, apiKey? }
 * Streams Server-Sent Events describing the run; persists both messages.
 */
router.post('/:conversationId/stream', authenticateToken, async (req, res) => {
  const userId = (req as any).userId
  const { conversationId } = req.params
  const { content, imagePath, mode = 'agent' } = req.body || {}

  if (!content && !imagePath) {
    return res.status(400).json({ error: 'Message content or image is required' })
  }

  const conversation = await getOrCreateConversation(userId, conversationId, content || 'New Chat')
  if (!conversation) return res.status(404).json({ error: 'Conversation not found' })

  // Persist the user message before streaming.
  const hasImage = !!imagePath
  await saveMessage(conversation.id, {
    role: 'user',
    content: content || '',
    messageType: hasImage ? 'mixed' : 'text',
    imagePath: imagePath || null,
    toolUsed: mode,
  })

  initSSE(res)
  sendEvent(res, { type: 'status', message: `conversation:${conversation.id}` })

  const abort = new AbortController()
  req.on('close', () => abort.abort())

  const emit = makeEmitter(res)
  const ctx: ToolContext = { userId, conversationId: conversation.id, emit, signal: abort.signal, scratch: {} }

  // Build message history + current turn (conversation memory window).
  const history = await getHistory(conversation.id, agentConfig.historyWindow)
  const priorTurns: ChatMessage[] = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(0, -1) // exclude the user message we just saved (re-added below with image)
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  let currentContent: string | ContentPart[] = content || ''
  if (hasImage) {
    const dataUri = fileToDataUri(imagePath)
    if (dataUri) {
      currentContent = [
        ...(content ? [{ type: 'text', text: content } as ContentPart] : []),
        { type: 'image_url', image_url: { url: dataUri } },
      ]
    }
  }
  const messages: ChatMessage[] = [...priorTurns, { role: 'user', content: currentContent }]

  const { provider, model, apiKey, baseUrl } = resolveProvider(req.body)

  // Active skills contribute prompt guidance and recommended tools.
  const { skills, toolNames: skillTools } = getActiveSkills(content || '')
  const systemPrompt = [BASE_SYSTEM_PROMPT, buildSkillPrompt(skills)].filter(Boolean).join('\n\n')

  let finalContent = ''
  let finalMetadata: any = {}
  const artifacts: any[] = []

  // Capture final + artifact events for persistence while forwarding all events.
  const capturingCtx: ToolContext = {
    ...ctx,
    emit: (event: AgentEvent) => {
      if (event.type === 'final') {
        finalContent = event.content
        finalMetadata = event.metadata || {}
      } else if (event.type === 'artifact') {
        artifacts.push(event.artifact)
      }
      emit(event)
    },
  }

  try {
    if (mode === 'research') {
      await runDeepResearch({ query: content || '', provider, model: model || '', apiKey, baseUrl, ctx: capturingCtx })
    } else {
      // 'chat' → no tools (fast); 'agent' → all registered tools + skill tools.
      const toolNames = mode === 'chat' ? (skillTools.length ? skillTools : undefined) : undefined
      await runAgent({
        messages,
        provider,
        model: model || '',
        apiKey,
        baseUrl,
        toolNames: mode === 'chat' && !skillTools.length ? [] : toolNames,
        systemPrompt,
        ctx: capturingCtx,
      })
    }

    await saveMessage(conversation.id, {
      role: 'assistant',
      content: finalContent || '(no response)',
      messageType: artifacts.some((a) => a.kind === 'image') ? 'image' : 'text',
      imageUrl: artifacts.find((a) => a.kind === 'image')?.url || null,
      toolUsed: mode,
      metadata: { ...finalMetadata, artifacts, provider, model },
    })
  } catch (error: any) {
    sendEvent(res, { type: 'error', message: error?.message || 'Agent run failed' })
    await saveMessage(conversation.id, {
      role: 'assistant',
      content: `⚠️ ${error?.message || 'The agent run failed.'}`,
      toolUsed: mode,
      metadata: { error: true },
    })
  } finally {
    endSSE(res)
  }
})

// ---- Tool catalog -----------------------------------------------------------
router.get('/tools', authenticateToken, (_req, res) => {
  res.json(
    toolRegistry.list().map((t) => ({ name: t.name, description: t.description, source: t.source || 'builtin' }))
  )
})

// ---- MCP servers ------------------------------------------------------------
router.get('/mcp-servers', authenticateToken, (_req, res) => {
  const configs = configStore.listMcpServers()
  const status = mcpRegistry.status()
  res.json(configs.map((c) => ({ ...c, runtime: status.find((s) => s.id === c.id) || null })))
})

router.post('/mcp-servers', authenticateToken, async (req, res) => {
  const { id, name, transport, command, args, url, headers, enabled } = req.body || {}
  if (!name || !transport) return res.status(400).json({ error: 'name and transport are required' })
  const servers = configStore.listMcpServers()
  const serverId = id || `mcp-${Date.now()}`
  const cfg = { id: serverId, name, transport, command, args, url, headers, enabled: enabled !== false }
  const idx = servers.findIndex((s) => s.id === serverId)
  if (idx >= 0) servers[idx] = cfg
  else servers.push(cfg)
  configStore.saveMcpServers(servers)
  const result = cfg.enabled ? await mcpRegistry.connectServer(cfg) : await mcpRegistry.disconnectServer(serverId).then(() => ({ ok: true }))
  res.json({ server: cfg, result })
})

router.delete('/mcp-servers/:id', authenticateToken, async (req, res) => {
  const servers = configStore.listMcpServers().filter((s) => s.id !== req.params.id)
  configStore.saveMcpServers(servers)
  await mcpRegistry.disconnectServer(req.params.id)
  res.json({ ok: true })
})

// ---- Connectors -------------------------------------------------------------
router.get('/connectors', authenticateToken, (_req, res) => {
  const types = connectorRegistry.listTypes()
  const configured = configStore.listConnectors().map((c) => ({ id: c.id, type: c.type, name: c.name, enabled: c.enabled }))
  res.json({ types, configured })
})

router.post('/connectors', authenticateToken, (req, res) => {
  const { id, type, name, config, enabled } = req.body || {}
  if (!type || !name) return res.status(400).json({ error: 'type and name are required' })
  const connectors = configStore.listConnectors()
  const connId = id || `conn-${Date.now()}`
  const cfg = { id: connId, type, name, config: config || {}, enabled: enabled !== false }
  const idx = connectors.findIndex((c) => c.id === connId)
  if (idx >= 0) connectors[idx] = cfg
  else connectors.push(cfg)
  configStore.saveConnectors(connectors)
  if (cfg.enabled) connectorRegistry.activate(cfg)
  else connectorRegistry.deactivate(connId)
  res.json({ id: connId, type, name, enabled: cfg.enabled })
})

router.delete('/connectors/:id', authenticateToken, (req, res) => {
  const connectors = configStore.listConnectors().filter((c) => c.id !== req.params.id)
  configStore.saveConnectors(connectors)
  connectorRegistry.deactivate(req.params.id)
  res.json({ ok: true })
})

// ---- Skills -----------------------------------------------------------------
router.get('/skills', authenticateToken, (_req, res) => {
  const enabled = new Set(configStore.getEnabledSkills())
  res.json(
    getAllSkills().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      builtin: !!s.builtin,
      enabled: enabled.has(s.id),
    }))
  )
})

router.post('/skills/:id', authenticateToken, (req, res) => {
  const { enabled } = req.body || {}
  const set = new Set(configStore.getEnabledSkills())
  if (enabled) set.add(req.params.id)
  else set.delete(req.params.id)
  configStore.setEnabledSkills(Array.from(set))
  res.json({ id: req.params.id, enabled: !!enabled })
})

// Create a user skill (skill creator).
router.post('/skills', authenticateToken, (req, res) => {
  const { name, description, instructions, triggers, tools, enable } = req.body || {}
  if (!name || !instructions) return res.status(400).json({ error: 'name and instructions are required' })
  const skill = createUserSkill({
    name,
    description: description || '',
    instructions,
    triggers: Array.isArray(triggers) ? triggers : typeof triggers === 'string' ? triggers.split(',').map((s: string) => s.trim()).filter(Boolean) : undefined,
    tools: Array.isArray(tools) ? tools : undefined,
  })
  if (enable !== false) {
    const set = new Set(configStore.getEnabledSkills())
    set.add(skill.id)
    configStore.setEnabledSkills(Array.from(set))
  }
  res.json({ ...skill, enabled: enable !== false, builtin: false })
})

// Delete a user skill.
router.delete('/skills/:id', authenticateToken, (req, res) => {
  const ok = deleteUserSkill(req.params.id)
  const set = new Set(configStore.getEnabledSkills())
  set.delete(req.params.id)
  configStore.setEnabledSkills(Array.from(set))
  res.json({ ok })
})

// ---- Custom webhook tools (plugin/tool builder) ----------------------------
router.get('/custom-tools', authenticateToken, (_req, res) => {
  res.json(customToolRegistry.list())
})

router.post('/custom-tools', authenticateToken, (req, res) => {
  const { id, name, description, method, url, headers, params, enabled } = req.body || {}
  if (!name || !url) return res.status(400).json({ error: 'name and url are required' })
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) return res.status(400).json({ error: 'name must be a valid identifier (letters, numbers, underscores)' })
  const cfg = {
    id: id || `custom-${Date.now()}`,
    name,
    description: description || `Custom tool ${name}`,
    method: method === 'GET' ? 'GET' : 'POST',
    url,
    headers: headers || {},
    params: Array.isArray(params) ? params : [],
    enabled: enabled !== false,
  } as const
  customToolRegistry.upsert(cfg as any)
  res.json(cfg)
})

router.delete('/custom-tools/:id', authenticateToken, (req, res) => {
  customToolRegistry.remove(req.params.id)
  res.json({ ok: true })
})

// ---- Plugins ----------------------------------------------------------------
router.get('/plugins', authenticateToken, (_req, res) => {
  res.json(pluginRegistry.list())
})

router.post('/plugins/:id', authenticateToken, (req, res) => {
  const { enabled } = req.body || {}
  const set = new Set(configStore.getEnabledPlugins())
  if (enabled) {
    set.add(req.params.id)
    pluginRegistry.enable(req.params.id)
  } else {
    set.delete(req.params.id)
    pluginRegistry.disable(req.params.id)
  }
  configStore.setEnabledPlugins(Array.from(set))
  res.json({ id: req.params.id, enabled: !!enabled })
})

export default router
