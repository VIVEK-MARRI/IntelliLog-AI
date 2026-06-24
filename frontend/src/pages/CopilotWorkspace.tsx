import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Cpu, PaperPlaneTilt, Stop, ArrowRight, Sparkle,
  MagnifyingGlass, WarningCircle, Trash,
} from '@phosphor-icons/react'
import { copilotAPI } from '@/api/copilot'
import { useToast } from '@/components/notifications'
import { WorkspaceResponse } from '@/components/copilot/WorkspaceResponse'
import type {
  WorkspaceMessage as WorkspaceMessageType,
  WorkspaceRecommendedAction,
} from '@/types/copilot'
import { useAuthStore } from '@/store/authStore'

// ─── Suggested Questions ──────────────────────────────────────────────────

const SUGGESTED_QUESTIONS = [
  { label: 'Which orders are at risk?', icon: WarningCircle },
  { label: 'Why is fleet health declining?', icon: MagnifyingGlass },
  { label: 'Show delayed deliveries', icon: ArrowRight },
  { label: 'What actions should operators take?', icon: Sparkle },
]

// ─── Main Page ───────────────────────────────────────────────────────────

export const CopilotWorkspace: React.FC = () => {
  const navigate = useNavigate()
  const auth = useAuthStore((state) => state.auth)
  const { addToast } = useToast()

  const [messages, setMessages] = useState<WorkspaceMessageType[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  const handleQuery = useCallback(async (query: string) => {
    if (!query.trim() || loading) return

    const userMsg: WorkspaceMessageType = {
      id: crypto.randomUUID(),
      query: query.trim(),
      timestamp: new Date(),
      response: null,
      loading: false,
    }

    const assistantMsg: WorkspaceMessageType = {
      id: crypto.randomUUID(),
      query: '',
      timestamp: new Date(),
      response: null,
      loading: true,
    }

    setMessages((prev) => [...prev, userMsg, assistantMsg])
    setInput('')
    setLoading(true)

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const result = await copilotAPI.workspaceQuery(query.trim(), controller.signal)
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, response: result, loading: false }
            : m
        )
      )
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      const errMsg = err?.message || 'Failed to get response'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, loading: false, error: errMsg }
            : m
        )
      )
      addToast({ type: 'error', title: 'Query Failed', message: errMsg })
    } finally {
      setLoading(false)
      setAbortController(null)
    }
  }, [loading, addToast])

  const handleCancel = useCallback(() => {
    abortController?.abort()
    setLoading(false)
    setAbortController(null)
    setMessages((prev) =>
      prev.map((m) => (m.loading ? { ...m, loading: false, error: 'Cancelled' } : m))
    )
  }, [abortController])

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault()
    handleQuery(input)
  }, [input, handleQuery])

  const handleSuggested = useCallback((q: string) => {
    handleQuery(q)
  }, [handleQuery])

  const handleAction = useCallback((action: WorkspaceRecommendedAction) => {
    switch (action.type) {
      case 'open_order':
        navigate(`/orders/${action.params.order_id}`)
        break
      case 'explain':
        navigate(`/explain/${action.params.order_id}`)
        break
      case 'view_route':
        navigate(`/orders/${action.params.order_id}`)
        break
      case 'create_alert':
        addToast({ type: 'info', title: 'Alert Created', message: `Alert sent to operations team` })
        break
      case 'generate_report':
        addToast({ type: 'success', title: 'Report Generated', message: `Report will be available shortly` })
        break
    }
  }, [navigate, addToast])

  const handleClear = useCallback(() => {
    setMessages([])
  }, [])

  if (!auth) {
    return <div className="flex items-center justify-center h-full bg-obsidian text-mist text-sm">Please log in</div>
  }

  const hasMessages = messages.length > 0

  return (
    <div className="h-full flex flex-col bg-obsidian">
      {/* Header */}
      <header className="border-b border-steel-grey/30 px-6 py-3 flex items-center justify-between shrink-0 bg-abyss">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-teal-DEFAULT/80 flex items-center justify-center">
            <Cpu className="w-4 h-4 text-white" weight="fill" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-pearl">AI Copilot Workspace</h1>
            <p className="text-[10px] text-mist/50">Operational Intelligence Assistant</p>
          </div>
        </div>
        {hasMessages && (
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-mist/50 hover:text-critical hover:bg-critical-bg border border-transparent hover:border-critical-border transition-all"
          >
            <Trash className="w-3.5 h-3.5" />
            Clear
          </button>
        )}
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {!hasMessages && (
            /* Empty State */
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/20 to-teal-DEFAULT/20 flex items-center justify-center mb-5">
                <Cpu className="w-8 h-8 text-accent" weight="fill" />
              </div>
              <h2 className="text-xl font-semibold text-pearl mb-2">What would you like to analyze?</h2>
              <p className="text-sm text-mist/60 mb-8 max-w-md">
                Ask about risk, fleet health, delays, or operational recommendations.
                Every response is grounded in live platform data.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => handleSuggested(q.label)}
                    className="flex items-center gap-2 px-4 py-3 rounded-xl bg-abyss border border-steel-grey/30 hover:border-accent/30 hover:bg-navy/40 transition-all text-left group"
                  >
                    <q.icon className="w-4 h-4 text-mist/40 group-hover:text-accent transition-colors shrink-0" weight="fill" />
                    <span className="text-[12px] text-mist/70 group-hover:text-pearl/80 transition-colors">{q.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {hasMessages && (
            <div className="space-y-4">
              {messages.map((msg) => (
                <div key={msg.id}>
                  {msg.query && (
                    /* User Message */
                    <div className="flex justify-end mb-3">
                      <div className="bg-accent/10 border border-accent/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                        <p className="text-sm text-pearl/90">{msg.query}</p>
                        <span className="text-[9px] text-mist/40 mt-1 block">
                          {msg.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {msg.loading && (
                    /* Loading State */
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                        <Cpu className="w-3.5 h-3.5 text-accent" weight="fill" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-semibold text-pearl">Copilot</span>
                          <span className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        </div>
                        <div className="space-y-2">
                          <div className="h-3 bg-navy/60 rounded w-3/4 animate-pulse" />
                          <div className="h-3 bg-navy/60 rounded w-1/2 animate-pulse" />
                          <div className="h-3 bg-navy/60 rounded w-2/3 animate-pulse" />
                        </div>
                      </div>
                    </div>
                  )}

                  {msg.error && !msg.loading && (
                    /* Error State */
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-critical-bg flex items-center justify-center shrink-0">
                        <WarningCircle className="w-3.5 h-3.5 text-critical" weight="fill" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[11px] font-semibold text-pearl">Copilot</span>
                          <span className="text-[10px] text-critical">Error</span>
                        </div>
                        <p className="text-xs text-critical/80 bg-critical-bg border border-critical-border rounded-lg px-3 py-2">
                          {msg.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {msg.response && !msg.loading && !msg.error && (
                    /* Assistant Response */
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent/20 to-teal-DEFAULT/20 flex items-center justify-center shrink-0">
                        <Cpu className="w-3.5 h-3.5 text-accent" weight="fill" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[11px] font-semibold text-pearl">Copilot</span>
                          <span className="text-[9px] text-mist/40 font-mono">
                            {msg.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <WorkspaceResponse response={msg.response} onAction={handleAction} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <div className="border-t border-steel-grey/30 shrink-0 bg-abyss">
        <div className="max-w-3xl mx-auto px-4 py-3">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about operations, risks, or recommendations..."
              disabled={loading}
              className="flex-1 bg-navy border border-steel-grey/40 rounded-xl px-4 py-3 text-sm text-pearl placeholder:text-mist/30 font-mono focus:outline-none focus:border-accent/40 transition-colors disabled:opacity-50"
            />
            {loading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-3 bg-critical/10 text-critical border border-critical/30 rounded-xl hover:bg-critical/20 transition-colors flex items-center gap-1.5 text-sm font-medium"
              >
                <Stop className="w-4 h-4" weight="fill" />
                Stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="px-4 py-3 bg-accent text-white rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 text-sm font-medium"
              >
                <PaperPlaneTilt className="w-4 h-4" weight="fill" />
                Send
              </button>
            )}
          </form>
          <p className="text-[9px] text-mist/30 mt-2 text-center">
            AI Copilot is grounded in live platform data. Responses cite specific orders, predictions, and agent decisions.
          </p>
        </div>
      </div>
    </div>
  )
}

export default CopilotWorkspace