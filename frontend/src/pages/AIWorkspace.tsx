import React, { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { copilotAPI } from '@/api/copilot'
import { useAuthStore } from '@/store/authStore'
import { useToast } from '@/components/notifications'
import { WorkspaceResponse } from '@/components/copilot/WorkspaceResponse'
import type { WorkspaceMessage, WorkspaceRecommendedAction } from '@/types/copilot'
import {
  Brain, PaperPlaneRight, Stop, Clock, ArrowsClockwise,
  WarningCircle, Lightbulb, Trash, MagnifyingGlass,
  MapPin, Truck, TrendUp,
} from '@phosphor-icons/react'
import clsx from 'clsx'

const SUGGESTED_QUESTIONS = [
  {
    group: 'Risk Analysis',
    items: [
      { id: 'r1', label: 'Which orders are at risk right now?', icon: WarningCircle, color: 'text-danger' },
      { id: 'r2', label: 'What is causing delivery delays?', icon: ArrowsClockwise, color: 'text-amber' },
    ],
  },
  {
    group: 'Fleet Status',
    items: [
      { id: 'f1', label: 'How is overall fleet health?', icon: Truck, color: 'text-success' },
      { id: 'f2', label: 'Show me driver performance', icon: Clock, color: 'text-amber' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { id: 'o1', label: 'What should operators focus on?', icon: Lightbulb, color: 'text-amber' },
      { id: 'o2', label: 'Route optimization suggestions', icon: MapPin, color: 'text-amber' },
    ],
  },
  {
    group: 'Reports',
    items: [
      { id: 'g1', label: 'Daily operational summary', icon: TrendUp, color: 'text-amber' },
      { id: 'g2', label: 'Recent AI interventions', icon: Brain, color: 'text-amber' },
    ],
  },
]

export const AIWorkspace: React.FC = () => {
  const navigate = useNavigate()
  const auth = useAuthStore((state) => state.auth)
  const { addToast } = useToast()
  const [messages, setMessages] = useState<WorkspaceMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!auth) {
    navigate('/login')
    return null
  }

  const sendMessage = async (query: string) => {
    if (!query.trim() || loading) return
    setInput('')

    const userMsg: WorkspaceMessage = { id: crypto.randomUUID(), query, timestamp: new Date(), response: null, loading: false }
    const loadingMsg: WorkspaceMessage = { id: crypto.randomUUID(), query, timestamp: new Date(), response: null, loading: true }

    setMessages((prev) => [...prev, userMsg, loadingMsg])
    setLoading(true)

    const controller = new AbortController()
    setAbortController(controller)

    try {
      const response = await copilotAPI.workspaceQuery(query, controller.signal)
      setMessages((prev) => {
        const next = [...prev]
        const lastIdx = next.length - 1
        if (lastIdx >= 0 && next[lastIdx].loading) {
          next[lastIdx] = { id: next[lastIdx].id, query, timestamp: new Date(), response, loading: false }
        }
        return next
      })
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setMessages((prev) => {
          const next = [...prev]
          const lastIdx = next.length - 1
          if (lastIdx >= 0 && next[lastIdx].loading) {
            next[lastIdx] = { ...next[lastIdx], loading: false, error: err?.message || 'Failed to get response' }
          }
          return next
        })
        addToast({ type: 'error', title: 'Query Failed', message: err?.message || 'Failed to get AI response' })
      }
    } finally {
      setLoading(false)
      setAbortController(null)
    }
  }

  const cancelRequest = () => {
    abortController?.abort()
  }

  const clearConversation = () => {
    setMessages([])
  }

  const handleAction = (action: WorkspaceRecommendedAction) => {
    if (action.type === 'open_order' && action.params?.order_id) {
      navigate(`/orders?order=${action.params.order_id}`)
    }
  }

  return (
    <div className="h-full flex flex-col bg-charcoal">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-page pt-5 pb-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-card bg-amber/20 flex items-center justify-center">
            <Brain className="w-5 h-5 text-amber" weight="fill" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-silver tracking-tight">AI Workspace</h1>
            <p className="text-xs text-silver-muted/60 font-medium">Logistics Intelligence Console</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearConversation}
            className="flex items-center gap-1.5 text-xs text-silver-muted hover:text-silver px-2.5 py-1.5 rounded-lg bg-graphite border border-slate/20 hover:bg-slate/30 transition-colors"
          >
            <Trash size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-page py-4">
        {messages.length === 0 ? (
          /* ── Perplexity-style Empty State ── */
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-amber/10 flex items-center justify-center mb-5">
              <MagnifyingGlass size={28} className="text-amber" weight="bold" />
            </div>
            <h2 className="text-2xl font-semibold text-silver tracking-tight mb-2">Ask about your fleet</h2>
            <p className="text-sm text-silver-muted mb-10 max-w-lg">
              AI analyzes live operational data to provide risk assessments, route intelligence, and actionable recommendations.
            </p>
            <div className="grid grid-cols-2 gap-4 w-full">
              {SUGGESTED_QUESTIONS.map((group) => (
                <div key={group.group} className="text-left">
                  <p className="text-[10px] font-semibold text-silver-muted/50 uppercase tracking-wider mb-2">{group.group}</p>
                  <div className="space-y-1.5">
                    {group.items.map((q) => {
                      const Icon = q.icon
                      return (
                        <button
                          key={q.id}
                          onClick={() => sendMessage(q.label)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-graphite border border-slate/20 hover:border-amber/40 hover:bg-amber/[0.04] transition-all text-left group"
                        >
                          <Icon size={15} className={clsx(q.color, 'shrink-0')} weight="fill" />
                          <span className="text-xs text-silver-muted group-hover:text-silver transition-colors">{q.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── Message List ── */
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg) => (
              <div key={msg.id}>
                {/* User Query */}
                <div className="flex justify-end mb-3">
                  <div className="bg-amber/15 text-silver px-4 py-2.5 rounded-2xl rounded-tr-md max-w-[70%]">
                    <p className="text-sm leading-relaxed">{msg.query}</p>
                  </div>
                </div>
                {/* AI Response */}
                {msg.loading ? (
                  <div className="bg-graphite rounded-card border border-slate/20 p-5 animate-fade-in">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-amber animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 rounded-full bg-amber animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 rounded-full bg-amber animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                      <span className="text-sm text-silver-muted font-medium">Analyzing fleet data...</span>
                    </div>
                    <p className="text-xs text-silver-muted/60">Retrieving real-time order status, risk scores, and agent recommendations</p>
                  </div>
                ) : msg.error ? (
                  <div className="bg-danger/10 border border-danger/30 rounded-card p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <WarningCircle size={14} className="text-danger" weight="fill" />
                      <span className="text-xs font-semibold text-danger">Error</span>
                    </div>
                    <p className="text-xs text-silver-muted">{msg.error}</p>
                  </div>
                ) : msg.response ? (
                  <div className="animate-fade-in">
                    <WorkspaceResponse response={msg.response} onAction={handleAction} />
                  </div>
                ) : null}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Bar */}
      <div className="shrink-0 px-page pb-4 pt-2 bg-gradient-to-t from-charcoal via-charcoal to-transparent">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-2 bg-graphite border border-slate/30 rounded-2xl px-4 py-3 shadow-panel focus-within:border-amber/50 focus-within:shadow-[0_0_0_3px_rgba(230,179,37,0.06)] transition-all">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) } }}
              placeholder="Ask about your fleet..."
              className="flex-1 bg-transparent border-none outline-none text-sm text-silver placeholder:text-silver-muted/50 py-0.5"
            />
            {loading ? (
              <button
                onClick={cancelRequest}
                className="flex items-center gap-1.5 text-xs font-medium text-danger bg-danger/20 px-3 py-1.5 rounded-lg hover:bg-danger/30 transition-colors"
              >
                <Stop size={12} weight="fill" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim()}
                className="flex items-center justify-center w-9 h-9 rounded-lg bg-amber text-charcoal hover:bg-amber/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                <PaperPlaneRight size={15} weight="fill" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-silver-muted/30 mt-1.5 text-center">
            Responses are grounded in live fleet data. Verify critical decisions before acting.
          </p>
        </div>
      </div>
    </div>
  )
}

export default AIWorkspace
