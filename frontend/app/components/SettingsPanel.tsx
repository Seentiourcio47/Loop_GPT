'use client'

import { useEffect, useState } from 'react'
import { X, Wrench, Puzzle, Blocks, Cable, Sparkles, Plug } from 'lucide-react'
import { API_URL, authHeaders, getProviderSettings } from '../lib/api'

interface Props {
  onClose: () => void
}

type Tab = 'model' | 'skills' | 'plugins' | 'mcp' | 'connectors' | 'tools'

export default function SettingsPanel({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('model')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold">Agent settings</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>
        <div className="flex border-b border-gray-200 text-sm overflow-x-auto">
          {([
            ['model', 'Model', Sparkles],
            ['skills', 'Skills', Blocks],
            ['plugins', 'Plugins', Puzzle],
            ['mcp', 'MCP', Cable],
            ['connectors', 'Connectors', Plug],
            ['tools', 'Tools', Wrench],
          ] as [Tab, string, any][]).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 whitespace-nowrap border-b-2 ${
                tab === id ? 'border-claude-purple text-claude-purple' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'model' && <ModelTab />}
          {tab === 'skills' && <ToggleList endpoint="skills" emptyLabel="No skills found." />}
          {tab === 'plugins' && <ToggleList endpoint="plugins" emptyLabel="No plugins found." />}
          {tab === 'mcp' && <McpTab />}
          {tab === 'connectors' && <ConnectorTab />}
          {tab === 'tools' && <ToolsTab />}
        </div>
      </div>
    </div>
  )
}

function ModelTab() {
  const [s, setS] = useState(getProviderSettings())
  const save = (patch: Partial<typeof s>) => {
    const next = { ...s, ...patch }
    setS(next)
    localStorage.setItem('aiProvider', next.provider)
    localStorage.setItem('aiModel', next.model)
    localStorage.setItem('aiApiKey', next.apiKey)
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-500">
        The default backend is your Hugging Face Inference Endpoint (configured server-side via
        <code className="mx-1 px-1 bg-gray-100 rounded">HF_ENDPOINT_URL</code>/<code className="px-1 bg-gray-100 rounded">HF_TOKEN</code>).
        Override the provider here only if you want to use a different model.
      </p>
      <label className="block">
        <span className="text-gray-700 font-medium">Provider</span>
        <select
          value={s.provider}
          onChange={(e) => save({ provider: e.target.value })}
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2"
        >
          {['huggingface', 'openai', 'anthropic', 'groq', 'together', 'nvidia', 'xai', 'perplexity', 'ollama', 'local'].map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-gray-700 font-medium">Model (optional)</span>
        <input value={s.model} onChange={(e) => save({ model: e.target.value })} placeholder="leave blank for endpoint default" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
      </label>
      <label className="block">
        <span className="text-gray-700 font-medium">API key override (optional)</span>
        <input type="password" value={s.apiKey} onChange={(e) => save({ apiKey: e.target.value })} placeholder="stored in your browser only" className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2" />
      </label>
    </div>
  )
}

interface ToggleItem { id: string; name: string; description: string; enabled: boolean; builtin?: boolean }

function ToggleList({ endpoint, emptyLabel }: { endpoint: string; emptyLabel: string }) {
  const [items, setItems] = useState<ToggleItem[]>([])
  const [loading, setLoading] = useState(true)
  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/agent/${endpoint}`, { headers: authHeaders() })
      setItems(await res.json())
    } catch { /* ignore */ }
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  const toggle = async (id: string, enabled: boolean) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)))
    await fetch(`${API_URL}/api/agent/${endpoint}/${id}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ enabled }) })
  }
  if (loading) return <p className="text-gray-400 text-sm">Loading…</p>
  if (!items.length) return <p className="text-gray-400 text-sm">{emptyLabel}</p>
  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="flex items-start justify-between gap-3 p-3 border border-gray-200 rounded-lg">
          <div>
            <div className="font-medium text-sm flex items-center gap-2">{i.name}{i.builtin && <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">built-in</span>}</div>
            <div className="text-xs text-gray-500">{i.description}</div>
          </div>
          <button
            onClick={() => toggle(i.id, !i.enabled)}
            className={`shrink-0 w-11 h-6 rounded-full transition-colors ${i.enabled ? 'bg-claude-purple' : 'bg-gray-300'}`}
          >
            <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${i.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  )
}

function McpTab() {
  const [servers, setServers] = useState<any[]>([])
  const [form, setForm] = useState({ name: '', transport: 'http', url: '', command: '' })
  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agent/mcp-servers`, { headers: authHeaders() })
      setServers(await res.json())
    } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [])
  const add = async () => {
    if (!form.name) return
    await fetch(`${API_URL}/api/agent/mcp-servers`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name: form.name, transport: form.transport, url: form.url || undefined, command: form.command || undefined, enabled: true }),
    })
    setForm({ name: '', transport: 'http', url: '', command: '' })
    load()
  }
  const remove = async (id: string) => {
    await fetch(`${API_URL}/api/agent/mcp-servers/${id}`, { method: 'DELETE', headers: authHeaders() })
    load()
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-500">Connect Model Context Protocol servers. Their tools become available to the agent.</p>
      {servers.map((s) => (
        <div key={s.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
          <div>
            <div className="font-medium">{s.name} <span className="text-xs text-gray-400">({s.transport})</span></div>
            <div className="text-xs text-gray-500">{s.url || s.command}</div>
            <div className={`text-xs ${s.runtime?.status === 'connected' ? 'text-green-600' : 'text-red-500'}`}>
              {s.runtime?.status === 'connected' ? `connected · ${s.runtime.tools.length} tools` : s.runtime?.error || 'not connected'}
            </div>
          </div>
          <button onClick={() => remove(s.id)} className="text-red-500 text-xs hover:underline">Remove</button>
        </div>
      ))}
      <div className="p-3 border border-dashed border-gray-300 rounded-lg space-y-2">
        <input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5" />
        <select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5">
          <option value="http">HTTP (Streamable)</option>
          <option value="stdio">stdio (local command)</option>
        </select>
        {form.transport === 'http' ? (
          <input placeholder="https://server/mcp" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5" />
        ) : (
          <input placeholder="command e.g. npx -y @modelcontextprotocol/server-filesystem" value={form.command} onChange={(e) => setForm({ ...form, command: e.target.value })} className="w-full border border-gray-300 rounded px-2 py-1.5" />
        )}
        <button onClick={add} className="px-3 py-1.5 bg-claude-purple text-white rounded-lg text-sm">Add server</button>
      </div>
    </div>
  )
}

function ConnectorTab() {
  const [data, setData] = useState<{ types: any[]; configured: any[] }>({ types: [], configured: [] })
  const [type, setType] = useState('github')
  const [fields, setFields] = useState<Record<string, string>>({})
  const load = async () => {
    try {
      const res = await fetch(`${API_URL}/api/agent/connectors`, { headers: authHeaders() })
      setData(await res.json())
    } catch { /* ignore */ }
  }
  useEffect(() => { load() }, [])
  const selected = data.types.find((t) => t.type === type)
  const add = async () => {
    if (!selected) return
    await fetch(`${API_URL}/api/agent/connectors`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ type, name: selected.name, config: fields, enabled: true }),
    })
    setFields({})
    load()
  }
  const remove = async (id: string) => {
    await fetch(`${API_URL}/api/agent/connectors/${id}`, { method: 'DELETE', headers: authHeaders() })
    load()
  }
  return (
    <div className="space-y-4 text-sm">
      <p className="text-gray-500">Connect external services. Secrets are stored server-side and never returned.</p>
      {data.configured.map((c) => (
        <div key={c.id} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
          <div className="font-medium">{c.name} <span className="text-xs text-gray-400">({c.type})</span></div>
          <button onClick={() => remove(c.id)} className="text-red-500 text-xs hover:underline">Remove</button>
        </div>
      ))}
      <div className="p-3 border border-dashed border-gray-300 rounded-lg space-y-2">
        <select value={type} onChange={(e) => { setType(e.target.value); setFields({}) }} className="w-full border border-gray-300 rounded px-2 py-1.5">
          {data.types.map((t) => <option key={t.type} value={t.type}>{t.name}</option>)}
        </select>
        {selected?.fields?.map((f: any) => (
          <input
            key={f.key}
            type={f.secret ? 'password' : 'text'}
            placeholder={f.label}
            value={fields[f.key] || ''}
            onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
            className="w-full border border-gray-300 rounded px-2 py-1.5"
          />
        ))}
        <button onClick={add} className="px-3 py-1.5 bg-claude-purple text-white rounded-lg text-sm">Add connector</button>
      </div>
    </div>
  )
}

function ToolsTab() {
  const [tools, setTools] = useState<any[]>([])
  useEffect(() => {
    fetch(`${API_URL}/api/agent/tools`, { headers: authHeaders() }).then((r) => r.json()).then(setTools).catch(() => {})
  }, [])
  return (
    <div className="space-y-1.5 text-sm">
      <p className="text-gray-500 mb-2">{tools.length} tools available to the agent.</p>
      {tools.map((t) => (
        <div key={t.name} className="p-2.5 border border-gray-200 rounded-lg">
          <div className="font-mono text-xs text-claude-purple">{t.name} <span className="text-gray-400">· {t.source}</span></div>
          <div className="text-xs text-gray-500">{t.description}</div>
        </div>
      ))}
    </div>
  )
}
