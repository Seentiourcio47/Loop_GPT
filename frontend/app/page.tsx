'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Plus, Menu, X, Trash2, Edit2, Image as ImageIcon, Settings, Sparkles } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const API_URL = 'https://api.loop-gpt.cyou'

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

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState<string>('')
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Fetch conversations
  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ['conversations'],
    queryFn: async () => {
      if (typeof window === 'undefined') return []
      const token = localStorage.getItem('token')
      if (!token) return []
      const response = await axios.get(`${API_URL}/api/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
    enabled: typeof window !== 'undefined',
  })

  // Fetch messages for current conversation
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['messages', currentConversationId],
    queryFn: async () => {
      if (!currentConversationId || typeof window === 'undefined') return []
      const token = localStorage.getItem('token')
      if (!token) return []
      const response = await axios.get(
        `${API_URL}/api/conversations/${currentConversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      return response.data
    },
    enabled: !!currentConversationId && typeof window !== 'undefined',
  })

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Create new conversation
  const createConversationMutation = useMutation({
    mutationFn: async () => {
      if (typeof window === 'undefined') throw new Error('Not in browser')
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Not authenticated')
      const response = await axios.post(
        `${API_URL}/api/conversations`,
        {},
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      return response.data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setCurrentConversationId(data.id)
      setSidebarOpen(false)
    },
  })

  // Send message
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (typeof window === 'undefined') throw new Error('Not in browser')
      let convId = currentConversationId
      if (!convId) {
        const conv = await createConversationMutation.mutateAsync()
        convId = conv.id
        setCurrentConversationId(convId)
      }
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Not authenticated')
      const response = await axios.post(
        `${API_URL}/api/conversations/${convId}/messages`,
        {
          content,
          imagePath: selectedImage ? 'pending' : undefined,
          provider: localStorage.getItem('aiProvider') || 'openai',
          model: localStorage.getItem('aiModel') || '',
          apiKey: localStorage.getItem('aiApiKey') || '',
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', currentConversationId] })
      setInput('')
      setSelectedImage(null)
      setImagePreview(null)
    },
  })

  // Update conversation title
  const updateConversationMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      if (typeof window === 'undefined') throw new Error('Not in browser')
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Not authenticated')
      const response = await axios.patch(`${API_URL}/api/conversations/${id}`, { title }, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      setEditingConversationId(null)
      setEditingTitle('')
    },
  })

  // Delete conversation
  const deleteConversationMutation = useMutation({
    mutationFn: async (id: string) => {
      if (typeof window === 'undefined') throw new Error('Not in browser')
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Not authenticated')
      const response = await axios.delete(`${API_URL}/api/conversations/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] })
      if (currentConversationId === deletingConversationId) {
        setCurrentConversationId(null)
      }
      setDeletingConversationId(null)
    },
  })

  const handleNewChat = () => {
    createConversationMutation.mutate()
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() && !selectedImage) return
    sendMessageMutation.mutate(input)
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedImage(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleEditConversation = (conv: Conversation) => {
    setEditingConversationId(conv.id)
    setEditingTitle(conv.title || '')
  }

  const handleSaveEdit = () => {
    if (editingConversationId && editingTitle.trim()) {
      updateConversationMutation.mutate({ id: editingConversationId, title: editingTitle.trim() })
    }
  }

  const handleCancelEdit = () => {
    setEditingConversationId(null)
    setEditingTitle('')
  }

  const handleDeleteConversation = (id: string) => {
    if (confirm('Are you sure you want to delete this conversation?')) {
      setDeletingConversationId(id)
      deleteConversationMutation.mutate(id)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }

  return (
    <div className="flex h-screen bg-white text-gray-900 overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col h-full flex-shrink-0">
          {/* Header */}
          <div className="p-4 border-b border-gray-200">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-claude-purple text-white rounded-xl hover:bg-claude-purple-dark transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
            >
              <Plus size={18} strokeWidth={2.5} />
              <span>New chat</span>
            </button>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto">
            <div className="p-2 space-y-1">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  className={`group relative rounded-lg ${
                    currentConversationId === conv.id ? 'bg-gray-100' : 'hover:bg-gray-50'
                  } transition-colors`}
                >
                  {editingConversationId === conv.id ? (
                    <div className="p-2">
                      <input
                        type="text"
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        onBlur={handleSaveEdit}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') handleCancelEdit()
                        }}
                        className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-claude-purple"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCurrentConversationId(conv.id)
                        setSidebarOpen(false)
                      }}
                      disabled={deletingConversationId === conv.id}
                      className="w-full text-left p-2.5 text-sm text-gray-700 hover:text-gray-900 flex items-center justify-between"
                    >
                      <span className="truncate flex-1">
                        {conv.title || 'New Conversation'}
                      </span>
                      <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 ml-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleEditConversation(conv)
                          }}
                          className="p-1 hover:bg-gray-200 rounded"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteConversation(conv.id)
                          }}
                          className="p-1 hover:bg-gray-200 rounded text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Sidebar Toggle */}
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 p-2 hover:bg-gray-100 rounded-lg z-10"
          >
            <Menu size={20} />
          </button>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto">
              <div className="mb-8">
                <div className="relative">
                  <Sparkles className="w-20 h-20 text-claude-purple" strokeWidth={1.5} />
                </div>
              </div>
              <h1 className="text-5xl font-semibold mb-4 text-gray-900 tracking-tight">How can I help you today?</h1>
              <p className="text-gray-500 text-center max-w-md text-base leading-relaxed">
                Start a conversation or ask me anything. I'm here to help with your questions and tasks.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto space-y-8">
              {messages.map((message) => (
                <div key={message.id} className="flex gap-4">
                  {/* Avatar */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${
                    message.role === 'user' 
                      ? 'bg-gray-200 text-gray-700' 
                      : 'bg-claude-purple text-white'
                  }`}>
                    {message.role === 'user' ? 'You' : 'C'}
                  </div>

                  {/* Message Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {message.role === 'user' ? 'You' : 'Claude'}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatTime(message.createdAt)}
                      </span>
                    </div>

                    {/* User image preview */}
                    {message.role === 'user' && message.imagePath && (
                      <div className="mb-3 rounded-lg overflow-hidden">
                        <img 
                          src={message.imageUrl || `${API_URL}/uploads/${message.imagePath.split('/').pop()}`}
                          alt="Uploaded"
                          className="max-w-md max-h-64 object-contain rounded-lg border border-gray-200"
                        />
                      </div>
                    )}

                    {/* Assistant generated image */}
                    {message.role === 'assistant' && message.imageUrl && (
                      <div className="mb-3 rounded-lg overflow-hidden">
                        <img 
                          src={message.imageUrl}
                          alt="Generated"
                          className="max-w-md max-h-96 object-contain rounded-lg border border-gray-200"
                        />
                      </div>
                    )}

                    {/* Text Content */}
                    {message.content && (
                      <div className="prose prose-sm max-w-none">
                        <div className="whitespace-pre-wrap text-gray-800 leading-relaxed">
                          {message.content}
                        </div>
                      </div>
                    )}

                    {/* Metadata badges */}
                    {(message.metadata?.mode || message.toolUsed) && (
                      <div className="mt-3 flex items-center gap-2 flex-wrap">
                        {message.metadata?.mode && message.metadata.mode !== 'ask' && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                            {message.metadata.mode === 'plan' && 'ðŸ“‹ Plan Mode'}
                            {message.metadata.mode === 'agentic' && 'ðŸ¤– Agentic Mode'}
                            {message.metadata.mode === 'automation' && 'âš™ï¸ Automation Mode'}
                          </span>
                        )}
                        {message.toolUsed && message.toolUsed !== 'chat' && (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">
                            {message.toolUsed.replace('-', ' ')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* Loading Indicator */}
              {(sendMessageMutation.isPending || createConversationMutation.isPending) && (
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-claude-purple text-white font-semibold text-sm">
                    C
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">Claude</span>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white">
          <div className="max-w-3xl mx-auto px-4 py-4">
            {/* Image Preview */}
            {imagePreview && (
              <div className="mb-3 relative inline-block">
                <div className="relative inline-block">
                  <img 
                    src={imagePreview} 
                    alt="Preview" 
                    className="max-w-xs max-h-32 object-contain rounded-lg border border-gray-200"
                  />
                  <button
                    type="button"
                    onClick={removeImage}
                    className="absolute -top-1 -right-1 p-1 bg-gray-700 hover:bg-gray-800 rounded-full text-white"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Input Form */}
            <form onSubmit={handleSend} className="relative">
              <div className="flex items-end gap-2 bg-gray-50 rounded-2xl border border-gray-200 hover:border-gray-300 focus-within:border-claude-purple focus-within:ring-2 focus-within:ring-claude-purple/20 transition-all duration-200">
                {/* Image Upload Button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 hover:bg-gray-200/80 rounded-lg transition-colors ml-2 mb-2 active:scale-95"
                  title="Upload image"
                >
                  <ImageIcon size={20} className="text-gray-500" strokeWidth={1.5} />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />

                {/* Text Input */}
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSend(e)
                    }
                  }}
                  placeholder="Message Claude..."
                  rows={1}
                  className="flex-1 bg-transparent text-gray-900 px-3 py-3.5 resize-none focus:outline-none placeholder-gray-400 text-sm leading-6"
                  style={{
                    maxHeight: '200px',
                    minHeight: '24px',
                  }}
                />

                {/* Send Button */}
                <button
                  type="submit"
                  disabled={(!input.trim() && !selectedImage) || sendMessageMutation.isPending}
                  className="p-2.5 mr-2 mb-2 text-gray-400 hover:text-claude-purple hover:bg-gray-200/80 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors active:scale-95"
                  title="Send message"
                >
                  <Send size={20} strokeWidth={1.5} />
                </button>
              </div>

              {/* Footer Text */}
              <p className="text-xs text-gray-400 mt-3 text-center">
                Claude can make mistakes. Check important info.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

