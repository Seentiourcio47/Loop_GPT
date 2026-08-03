'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  Sparkles, Bot, Search, Image as ImageIcon, FileText, Cpu, Cable, Blocks,
  Check, ArrowRight, Wrench, Eye,
} from 'lucide-react'

const FEATURES = [
  { icon: Bot, title: 'Agentic tool use', desc: 'A real tool-calling agent that searches, computes, reads, and acts — streamed live.' },
  { icon: Search, title: 'Deep research', desc: 'Plans queries, reads sources, and writes a cited report you can trust.' },
  { icon: Eye, title: 'Vision', desc: 'Upload an image and ask about it — native multimodal understanding.' },
  { icon: ImageIcon, title: 'Image generation', desc: 'Generate images from a prompt with FLUX, right in the chat.' },
  { icon: FileText, title: 'Documents', desc: 'Produce PDF, Word, Excel, and PowerPoint files as downloadable outputs.' },
  { icon: Cpu, title: 'Agent Computer', desc: 'Watch every tool call stream in a live terminal, Manus-style.' },
  { icon: Cable, title: 'MCP & connectors', desc: 'Plug in Model Context Protocol servers and external services.' },
  { icon: Blocks, title: 'Skills & builders', desc: 'Create skills and no-code tools that extend the agent.' },
]

const PLANS = [
  {
    name: 'Free', price: '$0', period: 'forever', cta: 'Start free', href: '/signup', highlight: false,
    features: ['~30 messages/day', 'Chat + web search + calculator', '3 images/day', '1 deep-research/day', 'PDF export', 'Community support'],
  },
  {
    name: 'Pro', price: '$15', period: '/mo', cta: 'Go Pro', href: '/signup?plan=pro', highlight: true,
    features: ['High daily limits', 'All tools + deep research', 'Vision + unlimited docs', 'MCP, connectors, skills, builders', 'Priority (warm) model', 'No image watermark'],
  },
]

export default function Landing() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="max-w-6xl mx-auto flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-neon-violet to-neon-cyan flex items-center justify-center shadow-glow"><Sparkles size={15} className="text-white" /></div>
          <span className="font-semibold text-gradient text-[15px]">Loop GPT</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <a href="#features" className="text-slate-400 hover:text-slate-100 hidden sm:block">Features</a>
          <a href="#pricing" className="text-slate-400 hover:text-slate-100 hidden sm:block">Pricing</a>
          <Link href="/login" className="text-slate-300 hover:text-white">Log in</Link>
          <Link href="/signup" className="px-3 py-1.5 rounded-lg text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 transition shadow-glow">Sign up</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto text-center px-5 pt-16 pb-14">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full glass text-xs text-slate-300 mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulseGlow" /> Agentic AI · streaming · your own model
          </div>
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight leading-[1.05] mb-5">
            The <span className="text-gradient">agentic</span> chat portal<br />that actually does the work.
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto mb-8">
            Deep research, vision, image &amp; document generation, MCP connectors, skills, and a live Agent Computer — all streamed in real time. Bring your own model.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link href="/signup" className="group inline-flex items-center gap-2 px-5 py-3 rounded-xl text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 transition shadow-glow font-medium">
              Try it free <ArrowRight size={18} className="group-hover:translate-x-0.5 transition" />
            </Link>
            <a href="#pricing" className="px-5 py-3 rounded-xl glass hover:accent-ring transition text-slate-200 font-medium">See pricing</a>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-6xl mx-auto px-5 py-12">
        <h2 className="text-3xl font-semibold text-center mb-2">Everything a flagship assistant has</h2>
        <p className="text-slate-500 text-center mb-10">And the transparency of watching it work.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((f, i) => {
            const Icon = f.icon
            return (
              <motion.div key={f.title} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.04 }}
                className="glass rounded-2xl p-5 hover:accent-ring transition">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-neon-violet/30 to-neon-cyan/20 flex items-center justify-center mb-3"><Icon size={18} className="text-neon-violet" /></div>
                <div className="font-medium text-slate-100 mb-1">{f.title}</div>
                <div className="text-sm text-slate-500">{f.desc}</div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-4xl mx-auto px-5 py-16">
        <h2 className="text-3xl font-semibold text-center mb-2">Simple pricing</h2>
        <p className="text-slate-500 text-center mb-10">Start free. Upgrade when you need more.</p>
        <div className="grid sm:grid-cols-2 gap-5">
          {PLANS.map((p) => (
            <div key={p.name} className={`rounded-2xl p-6 ${p.highlight ? 'glass-strong accent-ring' : 'glass'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-lg text-slate-100">{p.name}</span>
                {p.highlight && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gradient-to-r from-neon-violet to-neon-indigo text-white">Popular</span>}
              </div>
              <div className="mb-5"><span className="text-4xl font-semibold text-white">{p.price}</span><span className="text-slate-500">{p.period}</span></div>
              <ul className="space-y-2 mb-6">
                {p.features.map((f) => <li key={f} className="flex items-start gap-2 text-sm text-slate-300"><Check size={16} className="text-neon-green mt-0.5 shrink-0" />{f}</li>)}
              </ul>
              <Link href={p.href} className={`block text-center py-2.5 rounded-xl font-medium transition ${p.highlight ? 'text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 shadow-glow' : 'glass hover:accent-ring text-slate-200'}`}>{p.cta}</Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-slate-600 mt-6">AI usage is metered with credits so the free tier stays sustainable. Cancel anytime.</p>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-5 py-16 text-center">
        <div className="glass-strong rounded-3xl p-10">
          <Wrench size={28} className="text-neon-violet mx-auto mb-4" />
          <h2 className="text-3xl font-semibold mb-3">Put an agent to work in seconds.</h2>
          <p className="text-slate-400 mb-6">No setup. Ask a question, run deep research, or generate a document.</p>
          <Link href="/signup" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white bg-gradient-to-r from-neon-violet to-neon-indigo hover:opacity-90 transition shadow-glow font-medium">Get started free <ArrowRight size={18} /></Link>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-5 py-10 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
        <div className="flex items-center gap-2"><Sparkles size={14} className="text-neon-violet" /> Loop GPT</div>
        <div className="flex items-center gap-4">
          <Link href="/signup" className="hover:text-slate-300">Get started</Link>
          <a href="#pricing" className="hover:text-slate-300">Pricing</a>
          <Link href="/login" className="hover:text-slate-300">Log in</Link>
        </div>
        <span className="text-slate-600">© Loop GPT</span>
      </footer>
    </div>
  )
}
