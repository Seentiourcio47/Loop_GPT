'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, Plus, Menu, Trash2, Edit2, Image as ImageIcon, Settings, Sparkles, X,
  MessageSquare, Bot, Search, Wrench, FileDown, Loader2, ChevronDown,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { API_URL, authHeaders, getProviderSettings, type AgentMode } from './lib/api'
import { runAgentStream, type ArtifactRef } from './lib/stream'
import SettingsPanel from './components/SettingsPanel'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
  messageType?: string
  imageUrl?: string
  imagePath?: string
  toolUsed?: string
  metadata?: any
}

interface Conversation {
  id: string
  title: string
  createdAt: string
  updatedAt: string
}

interface LiveStep {
  index: number
  kind: 'text' | 'tool'
  text: string
  tool?: { name: string; args: any; source?: string; result?: string; isError?: boolean }
}

const MODES: { id: AgentMode; label: string; icon: any; hint: string }[] = [
  { id: 'agent', label: 'Agent', icon: Bot, hint: 'Full tool use' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, hint: 'Fast, no tools' },
  { id: 'research', label: 'Deep Research', icon: Search, hint: 'Search + cite' },
]

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState<string>('')

  // Live streaming run state
  const [running, setRunning] = useState(false)
  const [statusMsg, setStatusMsg] = useState<string>('')
  const [liveUser, setLiveUser] = useState<{ content: string; image?: string } | null>(null)
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const [liveArtifacts, setLiveArtifacts] = useState<ArtifactRef[]>([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      const res = await axios.get(`${API_URL}/api/conversations`, { headers: authHeaders(false) }).catch(() => ({ data: [] }))
      return res.data
    },
    enabled: typeof window !== 'undefined',
  })

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId) return []
      const res = await axios
        .get(`${API_URL}/api/conversations/${currentConversationId}/messages`, { headers: authHeaders(false) })
        .catch(() => ({ data: [] }))
      return res.data
    },
    enabled: !!currentConversationId && typeof window !== 'undefined',
  })

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveSteps, statusMsg])

  async function ensureConversation(firstMessage: string): Promise<string> {
    if (currentConversationId) return currentConversationId
    const res = await axios.post(
      `${API_URL}/api/conversations`,
      { title: firstMessage.slice(0, 50) || 'New Chat' },
      { headers: authHeaders() }
    )
    const id = res.data.id
    setCurrentConversationId(id)
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
    return id
  }

  async function uploadImage(convId: string, file: File): Promise<string | undefined> {
    const fd = new FormData()
    fd.append('image', file)
    try {
      const res = await axios.post(`${API_URL}/api/conversations/${convId}/upload-image`, fd, { headers: authHeaders(false) })
      return res.data.imagePath
    } catch {
      return undefined
    }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if ((!input.trim() && !selectedImage) || running) return
    const content = input.trim()
    const image = selectedImage
    const preview = imagePreview
    setInput('')
    setSelectedImage(null)
    setImagePreview(null)

    setRunning(true)
    setStatusMsg('')
    setLiveSteps([])
    setLiveArtifacts([])
    setLiveUser({ content, image: preview || undefined })

    let convId: string | null = null
    try {
      convId = await ensureConversation(content)
      let imagePath: string | undefined
      if (image) imagePath = await uploadImage(convId, image)

      const { provider, model, apiKey } = getProviderSettings()
      const abort = new AbortController()
      abortRef.current = abort

      await runAgentStream(
        convId,
        { content, imagePath, mode, provider, model, apiKey },
        {
          onStatus: (m) => { if (m.startsWith('conversation:')) return; setStatusMsg(m) },
          onWarming: (m) => setStatusMsg(m),
          onDelta: (step, text) => {
            setStatusMsg('')
            setLiveSteps((prev) => {
              const next = [...prev]
              const i = next.findIndex((s) => s.index === step)
              if (i === -1) next.push({ index: step, kind: 'text', text })
              else if (next[i].kind === 'text') next[i] = { ...next[i], text: next[i].text + text }
              return next
            })
          },
          onToolCall: (step, name, args, source) => {
            setLiveSteps((prev) => {
              const next = [...prev]
              const i = next.findIndex((s) => s.index === step)
              const toolStep: LiveStep = { index: step, kind: 'tool', text: '', tool: { name, args, source } }
              if (i === -1) next.push(toolStep)
              else next[i] = toolStep
              return next
            })
          },
          onToolResult: (step, name, resultContent, _data, isError) => {
            setLiveSteps((prev) => prev.map((s) => (s.index === step && s.tool ? { ...s, tool: { ...s.tool, result: resultContent, isError } } : s)))
          },
          onArtifact: (a) => setLiveArtifacts((prev) => [...prev, a]),
          onError: (m) => setStatusMsg(`⚠️ ${m}`),
          onFinal: () => {},
          onDone: () => {},
        },
        abort.signal
      )
    } catch (err: any) {
      setStatusMsg(`⚠️ ${err?.message || 'Run failed'}`)
    } finally {
      setRunning(false)
      abortRef.current = null
      // Refetch the persisted messages for THIS conversation and wait for the
      // cache to update before clearing the live run, so the answer never flashes
      // away. (Uses the concrete convId, not the possibly-stale state value.)
      if (convId) {
        await queryClient.invalidateQueries({ queryKey: ['messages', convId] })
      }
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setLiveUser(null)
      setLiveSteps([])
      setLiveArtifacts([])
      setStatusMsg('')
    }
  }

  function stopRun() {
    abortRef.current?.abort()
    setRunning(false)
  }

  const createConversationMutation = useMutation({
    mutationFn: async () => {
      const res = await axios.post(`${API_URL}/api/conversations`, {}, { headers: authHeaders() })
      return res.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setCurrentConversationId(data.id)
    },
  })

  const updateConversationMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const res = await axios.patch(`${API_URL}/api/conversations/${id}`, { title }, { headers: authHeaders() })
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setEditingConversationId(null)
      setEditingTitle('')
    },
  })

  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await axios.delete(`${API_URL}/api/conversations/${id}`, { headers: authHeaders(false) })
      return res.data
    },
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (currentConversationId === id) setCurrentConversationId(null)
    },
  })

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

  const showEmpty = messages.length === 0 && !liveUser

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden">
      {sidebarOpen && (
        <div className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col h-full flex-shrink-0">
          <div className="p-3 border-b border-gray-200 flex items-center gap-2">
            <button
              onClick={() => { setCurrentConversationId(null); setLiveUser(null) }}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 bg-claude-purple text-white rounded-xl hover:opacity-90 transition font-medium text-sm"
            >
              <Plus size={18} strokeWidth={2.5} /> New chat
            </button>
            <button onClick={() => setShowSettings(true)} className="p-2.5 hover:bg-gray-200 rounded-xl" title="Agent settings">
              <Settings size={18} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.map((conv) => (
              <div key={conv.id} className={`group relative rounded-lg ${currentConversationId === conv.id ? 'bg-gray-200' : 'hover:bg-gray-100'} transition-colors`}>
                {editingConversationId === conv.id ? (
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => editingTitle.trim() && updateConversationMutation.mutate({ id: conv.id, title: editingTitle.trim() })}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                    className="w-full m-1 px-2 py-1 text-sm border border-gray-300 rounded"
                    autoFocus
                  />
                ) : (
                  <button onClick={() => setCurrentConversationId(conv.id)} className="w-full text-left p-2.5 text-sm text-gray-700 flex items-center justify-between">
                    <span className="truncate flex-1">{conv.title || 'New Conversation'}</span>
                    <span className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2">
                      <span onClick={(e) => { e.stopPropagation(); setEditingConversationId(conv.id); setEditingTitle(conv.title || '') }} className="p-1 hover:bg-gray-300 rounded"><Edit2 size={13} /></span>
                      <span onClick={(e) => { e.stopPropagation(); if (confirm('Delete this conversation?')) deleteConversationMutation.mutate(conv.id) }} className="p-1 hover:bg-gray-300 rounded text-red-600"><Trash2 size={13} /></span>
                    </span>
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-gray-200 text-[11px] text-gray-400">Loop GPT · agentic portal</div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full relative">
        {!sidebarOpen && (
          <button onClick={() => setSidebarOpen(true)} className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-lg z-10"><Menu size={20} /></button>
        )}
        {sidebarOpen && (
          <button onClick={() => setSidebarOpen(false)} className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-lg z-10 md:hidden"><X size={20} /></button>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-8">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto">
              <Sparkles className="w-16 h-16 text-claude-purple mb-6" strokeWidth={1.5} />
              <h1 className="text-4xl font-semibold mb-3 tracking-tight">How can I help you today?</h1>
              <p className="text-gray-500 text-center max-w-md">Ask anything. I can search the web, run deep research, read images, generate images, and produce documents.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} formatTime={formatTime} />
              ))}

              {/* Live streaming run */}
              {liveUser && (
                <>
                  <div className="flex gap-4">
                    <Avatar role="user" />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold mb-1">You</div>
                      {liveUser.image && <img src={liveUser.image} alt="upload" className="max-w-xs max-h-48 rounded-lg border border-gray-200 mb-2" />}
                      <div className="whitespace-pre-wrap text-gray-800">{liveUser.content}</div>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <Avatar role="assistant" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="font-semibold mb-1">Loop GPT</div>
                      {statusMsg && (
                        <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 size={14} className="animate-spin" /> {statusMsg}</div>
                      )}
                      {liveSteps.map((s) => (
                        <StepView key={s.index} step={s} />
                      ))}
                      {liveArtifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
                      {running && liveSteps.length === 0 && !statusMsg && <Dots />}
                    </div>
                  </div>
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              {MODES.map((m) => {
                const Icon = m.icon
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    title={m.hint}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${
                      mode === m.id ? 'bg-claude-purple text-white border-claude-purple' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <Icon size={14} /> {m.label}
                  </button>
                )
              })}
            </div>

            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img src={imagePreview} alt="Preview" className="max-w-xs max-h-32 rounded-lg border border-gray-200" />
                <button onClick={() => { setSelectedImage(null); setImagePreview(null) }} className="absolute -top-1 -right-1 p-1 bg-gray-700 rounded-full text-white"><X size={14} /></button>
              </div>
            )}

            <form onSubmit={handleSend} className="relative">
              <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 focus-within:border-claude-purple focus-within:ring-2 focus-within:ring-claude-purple/20 transition">
                <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 hover:bg-gray-200 rounded-lg ml-2 mb-2" title="Upload image">
                  <ImageIcon size={20} className="text-gray-500" strokeWidth={1.5} />
                </button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                  placeholder={mode === 'research' ? 'Ask a research question…' : 'Message Loop GPT…'}
                  rows={1}
                  className="flex-1 bg-transparent px-3 py-3.5 resize-none focus:outline-none placeholder-gray-400 text-sm leading-6"
                  style={{ maxHeight: '200px' }}
                />
                {running ? (
                  <button type="button" onClick={stopRun} className="p-2.5 mr-2 mb-2 text-gray-500 hover:text-red-500 rounded-lg" title="Stop"><X size={20} /></button>
                ) : (
                  <button type="submit" disabled={!input.trim() && !selectedImage} className="p-2.5 mr-2 mb-2 text-gray-400 hover:text-claude-purple disabled:opacity-40 rounded-lg" title="Send"><Send size={20} strokeWidth={1.5} /></button>
                )}
              </div>
              <p className="text-xs text-gray-400 mt-2 text-center">Loop GPT can make mistakes. Verify important info.</p>
            </form>
          </div>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function Avatar({ role }: { role: 'user' | 'assistant' }) {
  return (
    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${role === 'user' ? 'bg-gray-200 text-gray-700' : 'bg-claude-purple text-white'}`}>
      {role === 'user' ? 'You' : <Sparkles size={16} />}
    </div>
  )
}

function Dots() {
  return (
    <div className="flex gap-1.5 items-center">
      {[0, 150, 300].map((d) => <div key={d} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
    </div>
  )
}

function StepView({ step }: { step: LiveStep }) {
  const [open, setOpen] = useState(false)
  if (step.kind === 'tool' && step.tool) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
        <button onClick={() => setOpen(!open)} className={`w-full flex items-center gap-2 px-3 py-2 ${step.tool.isError ? 'bg-red-50' : 'bg-gray-50'} hover:bg-gray-100`}>
          <Wrench size={14} className="text-claude-purple" />
          <span className="font-mono text-xs">{step.tool.name}</span>
          {!step.tool.result && <Loader2 size={12} className="animate-spin text-gray-400" />}
          <ChevronDown size={14} className={`ml-auto text-gray-400 transition ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="px-3 py-2 space-y-1 border-t border-gray-100">
            <div className="text-xs text-gray-500">args: <code className="text-gray-700">{JSON.stringify(step.tool.args)}</code></div>
            {step.tool.result && <div className="text-xs text-gray-600 whitespace-pre-wrap max-h-40 overflow-y-auto">{step.tool.result}</div>}
          </div>
        )}
      </div>
    )
  }
  return <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800 leading-relaxed">{step.text}</div>
}

function ArtifactCard({ artifact }: { artifact: ArtifactRef }) {
  const href = artifact.url ? (artifact.url.startsWith('http') ? artifact.url : `${API_URL}${artifact.url}`) : undefined
  if (artifact.kind === 'image' && href) {
    return <img src={href} alt={artifact.name} className="max-w-md max-h-96 rounded-lg border border-gray-200" />
  }
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">
      <FileDown size={16} className="text-claude-purple" />
      <span>{artifact.name}</span>
      <span className="text-xs text-gray-400 uppercase">{artifact.kind}</span>
    </a>
  )
}

function MessageBubble({ message, formatTime }: { message: Message; formatTime: (s: string) => string }) {
  const artifacts: ArtifactRef[] = message.metadata?.artifacts || []
  const sources = message.metadata?.sources as { index: number; title: string; url: string }[] | undefined
  const steps = message.metadata?.steps as { tool?: string; result?: string }[] | undefined
  return (
    <div className="flex gap-4">
      <Avatar role={message.role} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold">{message.role === 'user' ? 'You' : 'Loop GPT'}</span>
          <span className="text-xs text-gray-500">{formatTime(message.createdAt)}</span>
          {message.toolUsed && ['agent', 'research', 'chat'].includes(message.toolUsed) && (
            <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">{message.toolUsed}</span>
          )}
        </div>

        {message.role === 'user' && message.imagePath && (
          <img src={message.imageUrl || `${API_URL}/uploads/${message.imagePath.split('/').pop()}`} alt="Uploaded" className="max-w-md max-h-64 rounded-lg border border-gray-200 mb-3" />
        )}

        {steps && steps.filter((s) => s.tool).length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {steps.filter((s) => s.tool).map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600"><Wrench size={11} />{s.tool}</span>
            ))}
          </div>
        )}

        {message.content && (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-800 leading-relaxed">{message.content}</div>
        )}

        {artifacts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} />)}
          </div>
        )}

        {sources && sources.length > 0 && (
          <div className="mt-3 text-xs text-gray-500">
            <div className="font-medium mb-1">Sources</div>
            <ol className="space-y-0.5">
              {sources.map((s) => (
                <li key={s.index}>[{s.index}] <a href={s.url} target="_blank" rel="noreferrer" className="text-claude-purple hover:underline">{s.title}</a></li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
