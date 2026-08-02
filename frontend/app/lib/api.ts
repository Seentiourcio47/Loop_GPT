export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

export function authHeaders(json = true): Record<string, string> {
  const h: Record<string, string> = {}
  if (json) h['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) h['Authorization'] = `Bearer ${token}`
  return h
}

export type AgentMode = 'chat' | 'agent' | 'research'

export interface ProviderSettings {
  provider: string
  model: string
  apiKey: string
}

export function getProviderSettings(): ProviderSettings {
  if (typeof window === 'undefined') return { provider: 'huggingface', model: '', apiKey: '' }
  return {
    provider: localStorage.getItem('aiProvider') || 'huggingface',
    model: localStorage.getItem('aiModel') || '',
    apiKey: localStorage.getItem('aiApiKey') || '',
  }
}
