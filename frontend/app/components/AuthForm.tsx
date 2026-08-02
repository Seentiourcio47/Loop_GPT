'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { API_URL, setAuth } from '../lib/api'
import { track } from './Analytics'

const PROVIDER_META: Record<string, { label: string; icon: JSX.Element }> = {
  google: {
    label: 'Google',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1Z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"/></svg>
    ),
  },
  github: {
    label: 'GitHub',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1A11 11 0 0 0 8.52 22.44c.55.1.75-.24.75-.53v-1.87c-3.06.67-3.7-1.47-3.7-1.47-.5-1.27-1.22-1.61-1.22-1.61-1-.68.08-.67.08-.67 1.1.08 1.68 1.13 1.68 1.13.98 1.68 2.57 1.2 3.2.92.1-.71.38-1.2.7-1.47-2.45-.28-5.02-1.22-5.02-5.45 0-1.2.43-2.19 1.13-2.96-.11-.28-.49-1.4.11-2.92 0 0 .92-.3 3.02 1.13a10.4 10.4 0 0 1 5.5 0c2.1-1.43 3.02-1.13 3.02-1.13.6 1.52.22 2.64.11 2.92.7.77 1.13 1.76 1.13 2.96 0 4.24-2.58 5.17-5.03 5.44.39.34.74 1.01.74 2.04v3.03c0 .3.2.64.76.53A11 11 0 0 0 12 1Z"/></svg>
    ),
  },
  apple: {
    label: 'Apple',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 12.54c-.02-2.05 1.67-3.03 1.75-3.08-.95-1.4-2.44-1.59-2.97-1.61-1.27-.13-2.47.74-3.11.74-.64 0-1.63-.72-2.68-.7-1.38.02-2.65.8-3.36 2.03-1.43 2.49-.37 6.17 1.03 8.19.68.99 1.5 2.1 2.56 2.06 1.03-.04 1.42-.66 2.66-.66 1.24 0 1.59.66 2.68.64 1.1-.02 1.8-1.01 2.48-2 .78-1.15 1.1-2.26 1.12-2.32-.02-.01-2.15-.83-2.17-3.27ZM15.1 6.4c.56-.68.94-1.63.84-2.57-.81.03-1.79.54-2.37 1.22-.52.6-.97 1.56-.85 2.48.9.07 1.82-.46 2.38-1.13Z"/></svg>
    ),
  },
}

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [providers, setProviders] = useState<string[]>([])

  const isSignup = mode === 'signup'

  // Discover which social providers are configured on the backend.
  useEffect(() => {
    fetch(`${API_URL}/api/auth/providers`)
      .then((r) => r.json())
      .then((d) => setProviders(Array.isArray(d.providers) ? d.providers : []))
      .catch(() => setProviders([]))
  }, [])

  // Handle the OAuth redirect back: ?token=...&role=...&error=...
  useEffect(() => {
    if (typeof window === 'undefined') return
    const p = new URLSearchParams(window.location.search)
    const token = p.get('token')
    const err = p.get('error')
    if (err) {
      setError(err === 'db_required' ? 'Sign-in needs the database enabled.' : `Sign-in failed: ${err}`)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }
    if (token) {
      setAuth(token, { id: '', email: p.get('email') || '', name: p.get('name') || '', role: p.get('role') || 'user' })
      track(p.get('welcome') ? 'signed_up' : 'logged_in', { method: 'oauth' })
      window.history.replaceState({}, '', window.location.pathname)
      router.push(p.get('role') === 'admin' ? '/admin' : '/chat')
    }
  }, [router])

  function social(provider: string) {
    window.location.href = `${API_URL}/api/auth/oauth/${provider}`
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/auth/${isSignup ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSignup ? { email, password, name } : { email, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || `Request failed (${res.status})`)
        setLoading(false)
        return
      }
      if (data.token) setAuth(data.token, data.user)
      track(isSignup ? 'signed_up' : 'logged_in', { method: 'email' })
      router.push(data.user?.role === 'admin' ? '/admin' : '/chat')
    } catch (err: any) {
      setError(err?.message || 'Network error')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <Link href="/" className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center shadow-glow"><Sparkles size={16} className="text-white" /></div>
          <span className="font-semibold text-gradient text-lg">Loop GPT</span>
        </Link>
        <div className="glass-strong rounded-2xl p-6 shadow-panel">
          <h1 className="text-xl font-semibold text-slate-100 mb-1">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
          <p className="text-sm text-slate-500 mb-5">{isSignup ? 'Start free — no card required.' : 'Log in to continue.'}</p>

          {/* Social sign-in */}
          <div className="space-y-2 mb-4">
            {(['google', 'apple', 'github'] as const).map((p) => {
              const live = providers.includes(p)
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => live && social(p)}
                  disabled={!live}
                  title={live ? `Continue with ${PROVIDER_META[p].label}` : `${PROVIDER_META[p].label} sign-in not configured yet`}
                  className={`w-full flex items-center justify-center gap-2.5 py-2.5 rounded-lg text-sm font-medium border transition ${
                    live
                      ? 'bg-ink-800 border-white/10 text-slate-100 hover:bg-ink-700'
                      : 'bg-ink-900 border-white/5 text-slate-600 cursor-not-allowed'
                  }`}
                >
                  {PROVIDER_META[p].icon}
                  Continue with {PROVIDER_META[p].label}
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-3 mb-4">
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[11px] text-slate-600 uppercase tracking-wider">or email</span>
            <div className="h-px flex-1 bg-white/5" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            {isSignup && (
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:accent-ring placeholder-slate-600" />
            )}
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:accent-ring placeholder-slate-600" />
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="w-full bg-ink-800 border border-white/10 rounded-lg px-3 py-2.5 text-slate-100 text-sm focus:outline-none focus:accent-ring placeholder-slate-600" />
            {error && <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 disabled:opacity-50 transition shadow-glow font-medium">
              {loading ? <Loader2 size={16} className="animate-spin" /> : <>{isSignup ? 'Create account' : 'Log in'} <ArrowRight size={16} /></>}
            </button>
          </form>
          <div className="mt-4 text-center text-sm text-slate-500">
            {isSignup ? <>Already have an account? <Link href="/login" className="text-neon-violet hover:underline">Log in</Link></> : <>New here? <Link href="/signup" className="text-neon-violet hover:underline">Sign up</Link></>}
          </div>
          <div className="mt-3 pt-3 border-t border-white/5 text-center">
            <Link href="/chat" className="text-xs text-slate-500 hover:text-slate-300">Continue as guest →</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
