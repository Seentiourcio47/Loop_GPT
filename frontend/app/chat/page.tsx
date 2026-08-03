'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Send, Plus, PanelLeft, Trash2, Edit2, Image as ImageIcon, Settings, Sparkles, X,
  MessageSquare, Bot, Search, Wrench, FileDown, Loader2, Cpu, ChevronRight, CreditCard, ShieldCheck,
  Copy, Check, RotateCcw, Camera, Paperclip, Plug, ChevronDown, ClipboardCheck, Zap, LogOut, User,
} from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { API_URL, authHeaders, getProviderSettings, getStoredUser, type AgentMode } from '../lib/api'
import { runAgentStream, type ArtifactRef } from '../lib/stream'
import AgentComputer, { type LiveStep } from '../components/AgentComputer'
import SettingsPanel from '../components/SettingsPanel'
import Markdown from '../components/chat/Markdown'
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

// Slash commands replace the old mode pills. Default (no slash) = agent.
const SLASH_COMMANDS: { cmd: string; mode: AgentMode; label: string; icon: any; hint: string }[] = [
  { cmd: '/research', mode: 'research', label: 'Deep Research', icon: Search, hint: 'Search the web and synthesize a cited answer' },
  { cmd: '/chat', mode: 'chat', label: 'Quick Chat', icon: MessageSquare, hint: 'Fast reply, no tools' },
]

/** Parse a leading slash command → { mode, text }. Default mode is agent. */
function parseCommand(input: string): { mode: AgentMode; text: string } {
  const m = input.match(/^\/(research|chat|agent)\b[ \t]*/i)
  if (m) {
    const c = m[1].toLowerCase()
    return { mode: c === 'research' ? 'research' : c === 'chat' ? 'chat' : 'agent', text: input.slice(m[0].length) }
  }
  return { mode: 'agent', text: input }
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [computerOpen, setComputerOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(false)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [showSlash, setShowSlash] = useState(false)
  const [showPlus, setShowPlus] = useState(false)
  const [showModeMenu, setShowModeMenu] = useState(false)
  const [runMode, setRunMode] = useState<'auto' | 'plan' | 'accept'>('auto')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsTab, setSettingsTab] = useState<string | undefined>(undefined)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
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
  const autoOpenedRef = useRef(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
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

  // On-demand Activity panel: open once when a run first produces a tool step or
  // an artifact (Claude's artifact-panel behavior). Won't reopen if manually closed.
  useEffect(() => {
    const hasActivity = liveSteps.some((s) => s.kind === 'tool') || liveArtifacts.length > 0
    if (hasActivity && !autoOpenedRef.current) { autoOpenedRef.current = true; setComputerOpen(true) }
  }, [liveSteps, liveArtifacts])

  // Responsive panels: on desktop the rail + computer are docked open; on mobile
  // they're overlays that start closed. Track the breakpoint live.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(min-width: 1024px)')
    const apply = () => {
      setIsDesktop(mq.matches)
      setSidebarOpen(mq.matches)
      // Activity panel is on-demand (opens when a tool runs), not docked by default.
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
    const { mode: sendMode, text: content } = parseCommand(input.trim())
    if (!content && !selectedImage) return // a bare "/research" with no query
    setMode(sendMode)
    setShowSlash(false)
    const image = selectedImage
    const preview = imagePreview
    setInput(''); setSelectedImage(null); setImagePreview(null)
    setRunning(true); setStatusMsg(''); setLiveSteps([]); setLiveArtifacts([])
    autoOpenedRef.current = false
    setLiveUser({ content, image: preview || undefined })
    track('message_sent', { mode: sendMode })

    let convId: string | null = null
    try {
      convId = await ensureConversation(content)
      let imagePath: string | undefined
      if (image) imagePath = await uploadImage(convId, image)
      const { provider, model, apiKey } = getProviderSettings()
      const abort = new AbortController()
      abortRef.current = abort

      const sendContent = runMode === 'plan' && content ? `Plan first: briefly outline the steps you'll take, then carry them out.\n\n${content}` : content
      await runAgentStream(convId, { content: sendContent, imagePath, mode: sendMode, provider, model, apiKey }, {
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

  const user = getStoredUser()
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.href = '/login'
  }

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
              <div className="w-7 h-7 rounded-lg bg-[#c96442] flex items-center justify-center">
                <Sparkles size={15} className="text-white" />
              </div>
              <span className="font-semibold text-slate-100 text-[15px]">Loop GPT</span>
              <button onClick={() => setSidebarOpen(false)} className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-slate-400"><PanelLeft size={16} /></button>
            </div>
            <div className="px-3 space-y-2">
              <button onClick={() => { selectConversation(null); closeOverlays() }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-[#c96442] hover:bg-[#b5593a] transition">
                <Plus size={17} strokeWidth={2.5} /> New session
              </button>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input type="text" placeholder="Search chats…" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-[13px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/15 transition" />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 mt-1 space-y-0.5">
              {conversations
                .filter((c) => !searchQuery || (c.title || '').toLowerCase().includes(searchQuery.toLowerCase()))
                .map((c) => (
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
              {searchQuery && conversations.filter((c) => (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())).length === 0 && (
                <p className="px-3 py-4 text-center text-[12px] text-slate-500">No chats match "{searchQuery}"</p>
              )}
            </div>
            {/* User menu — Claude-style avatar row with dropdown */}
            <div className="border-t border-white/5 p-2">
              <div className="relative">
                <button onClick={() => setShowUserMenu((v) => !v)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-white/5 transition">
                  <div className="w-7 h-7 rounded-full bg-[#c96442] flex items-center justify-center text-xs font-semibold text-white shrink-0">
                    {(user?.name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="text-[13px] text-slate-200 truncate">{user?.name || user?.email || 'Anonymous'}</div>
                    {user?.plan && <div className="text-[11px] text-slate-500 capitalize">{user.plan} plan</div>}
                  </div>
                  <ChevronDown size={14} className={`text-slate-500 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {showUserMenu && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.15 }}
                      className="absolute bottom-full mb-1 left-0 right-0 glass rounded-xl border border-white/10 overflow-hidden shadow-panel z-10">
                      <UserMenuItem icon={Settings} label="Settings" onClick={() => { setShowUserMenu(false); setShowSettings(true) }} />
                      <UserMenuItem icon={CreditCard} label="Account & billing" href="/account" onClick={() => setShowUserMenu(false)} />
                      {user?.role === 'admin' && (
                        <UserMenuItem icon={ShieldCheck} label="Admin portal" href="/admin" onClick={() => setShowUserMenu(false)} accent />
                      )}
                      <div className="my-0.5 border-t border-white/5" />
                      <UserMenuItem icon={LogOut} label="Sign out" onClick={logout} danger />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
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
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border transition ${computerOpen ? 'border-white/15 text-slate-200 bg-white/10' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>
              <Cpu size={14} /> <span className="hidden sm:inline">Computer</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4 sm:py-6">
          {showEmpty ? (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center px-2">
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center"><Sparkles size={18} className="text-slate-200" /></div>
              </motion.div>
              <h1 className="text-2xl sm:text-[32px] font-semibold tracking-tight text-slate-100 mb-2">How can I help you today?</h1>
              <p className="text-slate-500 text-sm max-w-sm">Ask anything. Type <span className="font-mono text-slate-400">/</span> for commands like deep research.</p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-5">
              {messages.map((m) => <MessageBubble key={m.id} message={m} fmtTime={fmtTime} />)}

              {liveUser && (
                <>
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.06] border border-white/5 px-4 py-2.5">
                      {liveUser.image && <img src={liveUser.image} alt="upload" className="max-w-[240px] max-h-52 rounded-lg border border-white/10 mb-2" />}
                      <div className="whitespace-pre-wrap text-slate-100 text-[15px] leading-relaxed">{liveUser.content}</div>
                    </div>
                  </motion.div>
                  <div className="min-w-0">
                    {running && (mode === 'research' || mode === 'agent') && (
                      <button onClick={() => (computerOpen ? undefined : openComputer())} className="mb-2 inline-flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300">
                        <Loader2 size={11} className="animate-spin" /> {statusMsg || 'working'} · view activity
                      </button>
                    )}
                    {statusMsg && !liveAnswer && (
                      <div className="flex items-center gap-2 text-sm text-slate-400"><span className="shimmer inline-block h-3 w-32 rounded" /> <span>{statusMsg}</span></div>
                    )}
                    {liveAnswer && <div className={running ? 'cursor' : ''}><Markdown content={liveAnswer} /></div>}
                    {!liveAnswer && !statusMsg && running && <Dots />}
                  </div>
                </>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-white/5 px-3 sm:px-4 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="max-w-3xl mx-auto relative">
            {showSlash && (
              <div className="absolute bottom-full mb-2 left-0 right-0 glass rounded-xl border border-white/10 overflow-hidden z-10 shadow-panel">
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-slate-500">Commands</div>
                {SLASH_COMMANDS.filter((c) => c.cmd.startsWith((input.trim().split(/\s+/)[0] || '').toLowerCase())).map((c) => {
                  const Icon = c.icon
                  return (
                    <button key={c.cmd} type="button" onMouseDown={(e) => { e.preventDefault(); setInput(c.cmd + ' '); setShowSlash(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-left transition">
                      <Icon size={16} className="text-slate-400 shrink-0" />
                      <span className="min-w-0"><span className="text-sm text-slate-200">{c.label} </span><span className="text-xs text-slate-500 font-mono">{c.cmd}</span><span className="block text-xs text-slate-500 truncate">{c.hint}</span></span>
                    </button>
                  )
                })}
              </div>
            )}
            {imagePreview && (
              <div className="mb-2 relative inline-block">
                <img src={imagePreview} alt="preview" className="max-h-28 rounded-lg border border-white/10" />
                <button onClick={() => { setSelectedImage(null); setImagePreview(null) }} className="absolute -top-1.5 -right-1.5 p-1 bg-ink-700 rounded-full text-slate-200 border border-white/10"><X size={12} /></button>
              </div>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleImageSelect} className="hidden" />
            <form onSubmit={handleSend} className="glass rounded-2xl px-3 py-2 focus-within:accent-ring transition">
              <textarea value={input}
                onChange={(e) => { const v = e.target.value; setInput(v); setShowSlash(v.startsWith('/') && !/\s/.test(v)) }}
                onKeyDown={(e) => { if (e.key === 'Escape') { setShowSlash(false); setShowPlus(false) } if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
                placeholder="Message Loop GPT…    ( / for commands )" rows={1}
                className="w-full bg-transparent pt-1.5 pb-1 resize-none focus:outline-none placeholder-slate-500 text-[15px] text-slate-100" style={{ maxHeight: 200 }} />
              <div className="flex items-center gap-1.5">
                {/* + attach menu */}
                <div className="relative">
                  <button type="button" onClick={() => { setShowPlus((v) => !v); setShowModeMenu(false) }} title="Add"
                    className={`w-8 h-8 flex items-center justify-center rounded-lg border transition ${showPlus ? 'border-white/20 bg-white/10 text-slate-100' : 'border-white/10 text-slate-400 hover:bg-white/5'}`}>
                    <Plus size={18} />
                  </button>
                  {showPlus && (
                    <div className="absolute bottom-full mb-2 left-0 w-52 glass rounded-xl border border-white/10 overflow-hidden z-20 shadow-panel">
                      <PlusItem icon={Paperclip} label="Upload a file" onClick={() => { setShowPlus(false); fileInputRef.current?.click() }} />
                      <PlusItem icon={ImageIcon} label="Add photo" onClick={() => { setShowPlus(false); fileInputRef.current?.click() }} />
                      <PlusItem icon={Camera} label="Take a photo" onClick={() => { setShowPlus(false); cameraInputRef.current?.click() }} />
                      <PlusItem icon={Plug} label="Connectors" onClick={() => { setShowPlus(false); setSettingsTab('connectors'); setShowSettings(true) }} />
                    </div>
                  )}
                </div>

                {/* Mode picker: Auto / Plan / Accept edits */}
                <div className="relative">
                  <button type="button" onClick={() => { setShowModeMenu((v) => !v); setShowPlus(false) }}
                    className="h-8 px-2.5 flex items-center gap-1.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 text-xs transition">
                    {runMode === 'auto' ? <Zap size={13} /> : runMode === 'plan' ? <ClipboardCheck size={13} /> : <Check size={13} />}
                    {runMode === 'auto' ? 'Auto' : runMode === 'plan' ? 'Plan' : 'Accept edits'}
                    <ChevronDown size={13} className="text-slate-500" />
                  </button>
                  {showModeMenu && (
                    <div className="absolute bottom-full mb-2 left-0 w-56 glass rounded-xl border border-white/10 overflow-hidden z-20 shadow-panel">
                      <ModeItem icon={Zap} label="Auto" hint="Agent decides and uses tools" active={runMode === 'auto'} onClick={() => { setRunMode('auto'); setShowModeMenu(false) }} />
                      <ModeItem icon={ClipboardCheck} label="Plan" hint="Outline a plan before acting" active={runMode === 'plan'} onClick={() => { setRunMode('plan'); setShowModeMenu(false) }} />
                      <ModeItem icon={Check} label="Accept edits" hint="Run all steps without pausing" active={runMode === 'accept'} onClick={() => { setRunMode('accept'); setShowModeMenu(false) }} />
                    </div>
                  )}
                </div>

                <div className="ml-auto">
                  {running ? (
                    <button type="button" onClick={stopRun} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-300 hover:text-rose-400" title="Stop"><X size={19} /></button>
                  ) : (
                    <button type="submit" disabled={!input.trim() && !selectedImage}
                      className="w-9 h-9 flex items-center justify-center rounded-lg text-white bg-[#c96442] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#b5593a] transition" title="Send">
                      <Send size={17} />
                    </button>
                  )}
                </div>
              </div>
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

      {showSettings && <SettingsPanel initialTab={settingsTab} onClose={() => { setShowSettings(false); setSettingsTab(undefined) }} />}
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
  return <div className="flex gap-1.5 py-1">{[0, 150, 300].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-slate-400/70 animate-bounce" style={{ animationDelay: `${d}ms` }} />)}</div>
}

function PlusItem({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left text-sm text-slate-200 transition">
      <Icon size={16} className="text-slate-400 shrink-0" /> {label}
    </button>
  )
}

function UserMenuItem({ icon: Icon, label, href, onClick, accent, danger }: { icon: any; label: string; href?: string; onClick?: () => void; accent?: boolean; danger?: boolean }) {
  const cls = `w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-left transition text-sm ${danger ? 'text-rose-400' : accent ? 'text-[#c96442]' : 'text-slate-200'}`
  if (href) return (
    <Link href={href} onClick={onClick} className={cls}><Icon size={15} className="shrink-0" /> {label}</Link>
  )
  return <button type="button" onClick={onClick} className={cls}><Icon size={15} className="shrink-0" /> {label}</button>
}

function ModeItem({ icon: Icon, label, hint, active, onClick }: { icon: any; label: string; hint: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-white/5 text-left transition">
      <Icon size={16} className={`shrink-0 ${active ? 'text-[#c96442]' : 'text-slate-400'}`} />
      <span className="min-w-0 flex-1"><span className="text-sm text-slate-200">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
      {active && <Check size={14} className="text-[#c96442] shrink-0" />}
    </button>
  )
}

function MessageBubble({ message, fmtTime }: { message: Message; fmtTime: (s: string) => string }) {
  const artifacts: ArtifactRef[] = message.metadata?.artifacts || []
  const sources = message.metadata?.sources as { index: number; title: string; url: string }[] | undefined
  const isUser = message.role === 'user'
  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(message.content || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400) }) }

  // User: compact right-aligned bubble. Assistant: full-width, no card, markdown.
  if (isUser) {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-white/[0.06] border border-white/5 px-4 py-2.5">
          {message.imagePath && <img src={message.imageUrl || `${API_URL}/uploads/${message.imagePath.split('/').pop()}`} alt="Uploaded" className="max-w-[280px] max-h-64 rounded-lg border border-white/10 mb-2" />}
          {message.content && <div className="whitespace-pre-wrap text-slate-100 text-[15px] leading-relaxed">{message.content}</div>}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="group">
      {message.content && <Markdown content={message.content} />}
      {artifacts.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{artifacts.map((a) => <ArtifactCard key={a.id} a={a} />)}</div>}
      {sources && sources.length > 0 && (
        <div className="mt-3 text-xs text-slate-500">
          <div className="font-medium mb-1 text-slate-400">Sources</div>
          <ol className="space-y-0.5">{sources.map((s) => <li key={s.index}>[{s.index}] <a href={s.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">{s.title}</a></li>)}</ol>
        </div>
      )}
      {/* Hover action row (Claude-style) */}
      <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
        <button onClick={copy} title="Copy" className="p-1.5 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/5">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
      </div>
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
