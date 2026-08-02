'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, Plus, PanelLeft, Trash2, Edit2, Image as ImageIcon, Settings, Sparkles, X,
  MessageSquare, Bot, Search, Wrench, FileDown, Loader2, Cpu, ChevronRight, CreditCard, ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { API_URL, authHeaders, getProviderSettings, getStoredUser, type AgentMode } from '../lib/api'
import { runAgentStream, type ArtifactRef } from '../lib/stream'
import AgentComputer, { type LiveStep } from '../components/AgentComputer'
import SettingsPanel from '../components/SettingsPanel'
import { track } from '../components/Analytics'

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
interface Conversation { id: string; title: string; createdAt: string; updatedAt: string }

const MODES: { id: AgentMode; label: string; icon: any; hint: string }[] = [
  { id: 'agent', label: 'Agent', icon: Bot, hint: 'Full tool use' },
  { id: 'chat', label: 'Chat', icon: MessageSquare, hint: 'Fast, no tools' },
  { id: 'research', label: 'Deep Research', icon: Search, hint: 'Search + cite' },
]

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [showSettings, setShowSettings] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  const [running, setRunning] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [liveUser, setLiveUser] = useState<{ content: string; image?: string } | null>(null)
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([])
  const [liveArtifacts, setLiveArtifacts] = useState<ArtifactRef[]>([])
  const [toolCount, setToolCount] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const queryClient = useQueryClient()

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => (await axios.get(`${API_URL}/api/conversations`, { headers: authHeaders(false) }).catch(() => ({ data: [] }))).data,
    enabled: typeof window !== 'undefined',
  })

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId) return []
      return (await axios.get(`${API_URL}/api/conversations/${currentConversationId}/messages`, { headers: authHeaders(false) }).catch(() => ({ data: [] }))).data
    },
    enabled: !!currentConversationId && typeof window !== 'undefined',
  })

  useEffect(() => {
    fetch(`${API_URL}/api/agent/tools`, { headers: authHeaders() }).then((r) => r.json()).then((t) => setToolCount(t.length || 0)).catch(() => {})
  }, [])

  // Responsive panels: on desktop the rail + computer are docked open; on mobile
  // they're overlays that start closed. Track the breakpoint live.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      setIsDesktop(mq.matches)
      setSidebarOpen(mq.matches)
      setComputerOpen(mq.matches)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // On mobile, opening the computer should close the rail (and vice-versa) so a
  // single overlay is visible at a time.
  const openComputer = () => { setComputerOpen(true); if (!isDesktop) setSidebarOpen(false) }
  const closeOverlays = () => { if (!isDesktop) { setSidebarOpen(false); setComputerOpen(false) } }

  // Auth guard: if not signed in and the backend doesn't allow guest access,
  // send the visitor to login instead of letting API calls silently 401.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (getStoredUser() || localStorage.getItem('token')) return
    fetch(`${API_URL}/api/auth/providers`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.guest) window.location.href = '/login'
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, liveSteps, statusMsg])

  async function ensureConversation(firstMessage: string): Promise<string> {
    if (currentConversationId) return currentConversationId
    const res = await axios.post(`${API_URL}/api/conversations`, { title: firstMessage.slice(0, 50) || 'New Chat' }, { headers: authHeaders() })
    setCurrentConversationId(res.data.id)
    queryClient.invalidateQueries({ queryKey: ['conversations'] })
    return res.data.id
  }

  async function uploadImage(convId: string, file: File): Promise<string | undefined> {
    const fd = new FormData()
    fd.append('image', file)
    try {
      return (await axios.post(`${API_URL}/api/conversations/${convId}/upload-image`, fd, { headers: authHeaders(false) })).data.imagePath
    } catch { return undefined }
  }

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault()
    if ((!input.trim() && !selectedImage) || running) return
    const content = input.trim()
    const image = selectedImage
    const preview = imagePreview
    setInput(''); setSelectedImage(null); setImagePreview(null)
    setRunning(true); setStatusMsg(''); setLiveSteps([]); setLiveArtifacts([])
    setLiveUser({ content, image: preview || undefined })
    if (!computerOpen) setComputerOpen(true)
    track('message_sent', { mode })

    let convId: string | null = null
    try {
      convId = await ensureConversation(content)
      let imagePath: string | undefined
      if (image) imagePath = await uploadImage(convId, image)
      const { provider, model, apiKey } = getProviderSettings()
      const abort = new AbortController()
      abortRef.current = abort

      await runAgentStream(convId, { content, imagePath, mode, provider, model, apiKey }, {
        onStatus: (m) => { if (!m.startsWith('conversation:')) setStatusMsg(m) },
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
            const t: LiveStep = { index: step, kind: 'tool', text: '', tool: { name, args, source } }
            if (i === -1) next.push(t); else next[i] = t
            return next
          })
        },
        onToolResult: (step, name, resultContent, _d, isError) => {
          setLiveSteps((prev) => prev.map((s) => (s.index === step && s.tool ? { ...s, tool: { ...s.tool, result: resultContent, isError } } : s)))
        },
        onArtifact: (a) => setLiveArtifacts((prev) => [...prev, a]),
        onError: (m) => setStatusMsg(`⚠️ ${m}`),
        onFinal: () => {},
        onDone: () => {},
      }, abort.signal)
    } catch (err: any) {
      setStatusMsg(`⚠️ ${err?.message || 'Run failed'}`)
    } finally {
      setRunning(false)
      abortRef.current = null
      if (convId) await queryClient.invalidateQueries({ queryKey: ['messages', convId] })
      await queryClient.invalidateQueries({ queryKey: ['conversations'] })
      // Hand the chat back to the persisted messages, but KEEP the run's tool
      // steps + artifacts so the Agent Computer keeps showing the completed run
      // (they're reset when the next run starts or the session changes).
      setLiveUser(null); setStatusMsg('')
    }
  }

  function selectConversation(id: string | null) {
    setCurrentConversationId(id)
    setLiveUser(null); setLiveSteps([]); setLiveArtifacts([]); setStatusMsg('')
  }

  function stopRun() { abortRef.current?.abort(); setRunning(false) }

  const updateConv = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => (await axios.patch(`${API_URL}/api/conversations/${id}`, { title }, { headers: authHeaders() })).data,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['conversations'] }); setEditingConversationId(null) },
  })
  const deleteConv = useMutation({
    mutationFn: async (id: string) => (await axios.delete(`${API_URL}/api/conversations/${id}`, { headers: authHeaders(false) })).data,
    onSuccess: (_d, id) => { queryClient.invalidateQueries({ queryKey: ['conversations'] }); if (currentConversationId === id) setCurrentConversationId(null) },
  })

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) { setSelectedImage(file); const r = new FileReader(); r.onloadend = () => setImagePreview(r.result as string); r.readAsDataURL(file) }
  }
  const fmtTime = (s: string) => new Date(s).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const liveAnswer = liveSteps.filter((s) => s.kind === 'text').map((s) => s.text).join('')
  const showEmpty = messages.length === 0 && !liveUser

  return (
    <div className="flex h-[100dvh] overflow-hidden text-slate-200">
      {/* Mobile backdrop for the overlay panels */}
      {(sidebarOpen || computerOpen) && !isDesktop && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden" onClick={closeOverlays} />
      )}

      {/* ============ Left rail ============ */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed lg:relative inset-y-0 left-0 w-[264px] max-w-[82vw] shrink-0 glass-strong lg:glass border-r border-white/5 flex flex-col h-full z-40 lg:z-20 pt-[env(safe-area-inset-top)] lg:pt-0"
          >
            <div className="px-4 pt-4 pb-3 flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center shadow-glow">
                <Sparkles size={15} className="text-white" />
              </div>
              <span className="font-semibold text-gradient text-[15px]">Loop GPT</span>
              <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-slate-400"><PanelLeft size={16} /></button>
            </div>
            <div className="px-3">
              <button onClick={() => { selectConversation(null); closeOverlays() }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 transition shadow-glow">
                <Plus size={17} strokeWidth={2.5} /> New session
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 mt-1 space-y-0.5">
              {conversations.map((c) => (
                <div key={c.id} className={`group rounded-lg transition ${currentConversationId === c.id ? 'bg-white/8 accent-ring' : 'hover:bg-white/5'}`}>
                  {editingConversationId === c.id ? (
                    <input value={editingTitle} onChange={(e) => setEditingTitle(e.target.value)} autoFocus
                      onBlur={() => editingTitle.trim() && updateConv.mutate({ id: c.id, title: editingTitle.trim() })}
                      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                      className="w-full m-1 px-2 py-1 text-sm bg-ink-800 border border-white/10 rounded text-slate-100" />
                  ) : (
                    <button onClick={() => { selectConversation(c.id); closeOverlays() }} className="w-full text-left px-3 py-2 text-[13px] text-slate-300 flex items-center gap-2">
                      <MessageSquare size={13} className="text-slate-500 shrink-0" />
                      <span className="truncate flex-1">{c.title || 'New session'}</span>
                      <span className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5">
                        <span onClick={(e) => { e.stopPropagation(); setEditingConversationId(c.id); setEditingTitle(c.title || '') }} className="p-1 hover:bg-white/10 rounded"><Edit2 size={12} /></span>
                        <span onClick={(e) => { e.stopPropagation(); if (confirm('Delete this session?')) deleteConv.mutate(c.id) }} className="p-1 hover:bg-white/10 rounded text-rose-400"><Trash2 size={12} /></span>
                      </span>
                    </button>
                  )}
                </div>
              ))}
            </div>
            <div className="m-3 mt-0 space-y-1">
              <button onClick={() => setShowSettings(true)} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 border border-white/5">
                <Settings size={15} /> Agent settings
              </button>
              <Link href="/account" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/5 border border-white/5">
                <CreditCard size={15} /> Account & billing
              </Link>
              {getStoredUser()?.role === 'admin' && (
                <Link href="/admin" className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-neon-violet hover:bg-white/5 border border-neon-violet/20">
                  <ShieldCheck size={15} /> Admin portal
                </Link>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ============ Center: chat ============ */}
      <div className="flex-1 flex flex-col h-full min-w-0 relative pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-white/5 shrink-0">
          {!sidebarOpen && <button onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400"><PanelLeft size={17} /></button>}
          <span className="text-sm font-medium text-slate-300 truncate">{conversations.find((c) => c.id === currentConversationId)?.title || 'New session'}</span>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => (computerOpen ? setComputerOpen(false) : openComputer())} title="Toggle Agent Computer"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition ${computerOpen ? 'border-neon-violet/40 text-neon-violet bg-neon-violet/10' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>
              <Cpu size={14} /> <span className="hidden sm:inline">Computer</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center px-2">
              <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.4 }}
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-neon-violet via-neon-indigo to-neon-cyan flex items-center justify-center shadow-glow mb-5 sm:mb-6">
                <Sparkles size={28} className="text-white" />
              </motion.div>
              <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-3"><span className="text-gradient">How can I help you today?</span></h1>
              <p className="text-slate-400 text-sm sm:text-base max-w-md">Search the web, run deep research, read &amp; generate images, and produce documents — with every tool call streamed live to the Agent Computer.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((m) => <MessageBubble key={m.id} message={m} fmtTime={fmtTime} />)}

              {liveUser && (
                <>
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3 justify-end">
                    <div className="glass rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
                      {liveUser.image && <img src={liveUser.image} alt="upload" className="max-w-[240px] max-h-52 rounded-lg border border-white/10 mb-2" />}
                      <div className="whitespace-pre-wrap text-slate-100 text-[15px]">{liveUser.content}</div>
                    </div>
                    <Avatar role="user" />
                  </motion.div>
                  <div className="flex gap-3">
                    <Avatar role="assistant" running />
                    <div className="flex-1 min-w-0 glass rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="text-xs font-medium text-slate-400 mb-1.5 flex items-center gap-2">
                        Loop GPT
                        {running && <span className="text-[10px] text-neon-violet flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> {mode}</span>}
                      </div>
                      {statusMsg && !liveAnswer && (
                        <div className="flex items-center gap-2 text-sm text-slate-400"><span className="shimmer inline-block h-3 w-32 rounded" /> <span>{statusMsg}</span></div>
                      )}
                      {liveAnswer && <div className={`whitespace-pre-wrap text-slate-100 leading-relaxed text-[15px] ${running ? 'cursor' : ''}`}>{liveAnswer}</div>}
                      {!liveAnswer && !statusMsg && running && <Dots />}
                    </div>
                  </div>
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/5 px-3 sm:px-4 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center flex-wrap gap-1.5 mb-2">
              {MODES.map((m) => {
                const Icon = m.icon
                const active = mode === m.id
                return (
                  <button key={m.id} onClick={() => setMode(m.id)} title={m.hint}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? 'bg-gradient-to-r from-neon-violet to-neon-indigo text-white border-transparent shadow-glow' : 'text-slate-400 border-white/10 hover:bg-white/5'}`}>
                    <Icon size={13} /> {m.label}
                  </button>
                )
              })}
            </div>
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img src={imagePreview} alt="preview" className="max-h-28 rounded-lg border border-white/10" />
                <button onClick={() => { setSelectedImage(null); setImagePreview(null) }} className="absolute -top-1.5 -right-1.5 p-1 bg-ink-700 rounded-full text-slate-200 border border-white/10"><X size={12} /></button>
              </div>
            )}
            <form onSubmit={handleSend} className="glass rounded-2xl flex items-end gap-2 px-2 focus-within:accent-ring transition">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="p-2.5 rounded-lg hover:bg-white/5 text-slate-400 mb-1.5" title="Upload image"><ImageIcon size={19} /></button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              <textarea value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder={mode === 'research' ? 'Ask a research question…' : 'Message Loop GPT…'} rows={1}
                className="flex-1 bg-transparent py-3.5 resize-none focus:outline-none placeholder-slate-500 text-[15px] text-slate-100" style={{ maxHeight: 200 }} />
              {running ? (
                <button type="button" onClick={stopRun} className="p-2.5 mb-1.5 rounded-lg text-slate-300 hover:text-rose-400" title="Stop"><X size={19} /></button>
              ) : (
                <button type="submit" disabled={!input.trim() && !selectedImage}
                  className="p-2 mb-1.5 mr-0.5 rounded-xl text-white bg-gradient-to-br from-neon-violet to-neon-indigo disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition" title="Send">
                  <Send size={18} />
                </button>
              )}
            </form>
            <p className="text-[11px] text-slate-600 mt-2 text-center">Loop GPT can make mistakes. Verify important info.</p>
          </div>
        </div>
      </div>

      {/* ============ Right: Agent Computer ============ */}
      <AnimatePresence initial={false}>
        {computerOpen && (
          <motion.aside initial={{ x: 400, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 400, opacity: 0 }} transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="fixed lg:relative inset-y-0 right-0 z-40 lg:z-auto flex w-full max-w-[92vw] sm:max-w-[440px] lg:w-[380px] lg:max-w-none shrink-0 px-2.5 sm:px-3 lg:p-3 h-full pt-[max(0.625rem,env(safe-area-inset-top))] pb-[max(0.625rem,env(safe-area-inset-bottom))] lg:pt-3 lg:pb-3">
            <AgentComputer running={running} status={statusMsg} steps={liveSteps} artifacts={liveArtifacts} toolCount={toolCount} onClose={() => setComputerOpen(false)} />
          </motion.aside>
        )}
      </AnimatePresence>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  )
}

function Avatar({ role, running }: { role: 'user' | 'assistant'; running?: boolean }) {
  if (role === 'user') return <div className="w-8 h-8 rounded-full bg-ink-700 border border-white/10 flex items-center justify-center text-[11px] font-semibold text-slate-300 shrink-0">You</div>
  return (
    <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center shrink-0 ${running ? 'shadow-glow' : ''}`}>
      <Sparkles size={15} className="text-white" />
    </div>
  )
}

function Dots() {
  return <div className="flex gap-1.5 py-1">{[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-neon-violet/70 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
}

function MessageBubble({ message, fmtTime }: { message: Message; fmtTime: (s: string) => string }) {
  const artifacts: ArtifactRef[] = message.metadata?.artifacts || []
  const sources = message.metadata?.sources as { index: number; title: string; url: string }[] | undefined
  const steps = message.metadata?.steps as { tool?: string }[] | undefined
  const isUser = message.role === 'user'
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}>
      {!isUser && <Avatar role="assistant" />}
      <div className={`min-w-0 ${isUser ? 'max-w-[80%]' : 'flex-1'}`}>
        <div className={`glass rounded-2xl px-4 py-3 ${isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-slate-400">{isUser ? 'You' : 'Loop GPT'}</span>
            <span className="text-[10px] text-slate-600">{fmtTime(message.createdAt)}</span>
            {!isUser && message.toolUsed && <span className="text-[10px] px-1.5 py-0.5 rounded bg-neon-violet/15 text-neon-violet">{message.toolUsed}</span>}
          </div>
          {isUser && message.imagePath && <img src={message.imageUrl || `${API_URL}/uploads/${message.imagePath.split('/').pop()}`} alt="Uploaded" className="max-w-[280px] max-h-64 rounded-lg border border-white/10 mb-2" />}
          {steps && steps.filter((s) => s.tool).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {steps.filter((s) => s.tool).map((s, i) => <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-[11px] text-slate-400"><Wrench size={10} />{s.tool}</span>)}
            </div>
          )}
          {message.content && <div className="whitespace-pre-wrap text-slate-100 leading-relaxed text-[15px]">{message.content}</div>}
          {artifacts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{artifacts.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>}
          {sources && sources.length > 0 && (
            <div className="mt-3 text-xs text-slate-500">
              <div className="font-medium mb-1 text-slate-400">Sources</div>
              <ol className="space-y-0.5">{sources.map((s) => <li key={s.index}>[{s.index}] <a href={s.url} target="_blank" rel="noreferrer" className="text-neon-cyan hover:underline">{s.title}</a></li>)}</ol>
            </div>
          )}
        </div>
      </div>
      {isUser && <Avatar role="user" />}
    </motion.div>
  )
}

function ArtifactCard({ a }: { a: ArtifactRef }) {
  const href = a.url ? (a.url.startsWith('http') ? a.url : `${API_URL}${a.url}`) : undefined
  if (a.kind === 'image' && href) return <img src={href} alt={a.name} className="max-w-md max-h-96 rounded-xl border border-white/10" />
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-3 py-2 rounded-lg glass hover:accent-ring transition text-sm">
      <FileDown size={15} className="text-neon-violet" /><span>{a.name}</span><span className="text-[10px] uppercase text-slate-500">{a.kind}</span>
    </a>
  )
}
