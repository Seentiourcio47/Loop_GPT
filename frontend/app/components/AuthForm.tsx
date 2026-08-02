'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, ArrowRight } from 'lucide-react'
import { API_URL } from '../lib/api'

export default function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const isSignup = mode === 'signup'

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
      if (data.token && typeof window !== 'undefined') localStorage.setItem('token', data.token)
      router.push('/chat')
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
