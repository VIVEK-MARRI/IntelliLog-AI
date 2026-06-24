import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { PaperPlaneTilt, Sparkle, ArrowsOut, ArrowsIn, FlowArrow, StopCircle } from '@phosphor-icons/react'
import { CopilotChat } from './CopilotChat'
import { SuggestedQuestions } from './SuggestedQuestions'
import { EvidenceCard } from './EvidenceCard'
import { RecommendationPanel } from './RecommendationPanel'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../notifications'
import { useCopilotStream } from '../../hooks/useCopilotStream'
import { copilotAPI } from '../../api/copilot'
import { useOrdersArray } from '../../store/fleetStore'
import { validateEvidence } from '../../utils/evidenceValidator'
import type { CopilotMessage, CopilotResponse, ValidatedEvidence } from '../../types/copilot'

export const OperationsCopilot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [messages, setMessages] = useState<CopilotMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [currentResponse, setCurrentResponse] = useState<CopilotResponse | null>(null)
  const [useStreaming, setUseStreaming] = useState(true)

  const auth = useAuthStore((state) => state.auth)
  const { addToast } = useToast()
  const { state: streamState, connect: streamConnect, disconnect: streamDisconnect, cancel: streamCancel } = useCopilotStream()
  const orders = useOrdersArray()
  const abortRef = useRef<AbortController | null>(null)

  const ordersMap = useMemo(() => {
    const map = new Map<string, typeof orders[0]>()
    orders.forEach((o) => map.set(o.id, o))
    return map
  }, [orders])

  const validatedEvidence = useMemo((): ValidatedEvidence[] | undefined => {
    if (!currentResponse?.evidence) return undefined
    return validateEvidence(currentResponse.evidence, ordersMap)
  }, [currentResponse?.evidence, ordersMap])

  useEffect(() => {
    if (streamState.stage === 'complete' && streamState.response) {
      const res = streamState.response
      const ve = res.evidence ? validateEvidence(res.evidence, ordersMap) : undefined
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-stream`,
          type: 'assistant',
          content: res.summary,
          timestamp: new Date(),
          response: res,
          validatedEvidence: ve,
        },
      ])
      setCurrentResponse(res)
      setIsLoading(false)
    }
    if (streamState.stage === 'cancelled') {
      setIsLoading(false)
    }
    if (streamState.stage === 'error' && streamState.error) {
      setIsLoading(false)
      addToast({
        type: 'error',
        title: 'Stream Error',
        message: streamState.error,
        duration: 5000,
      })
    }
    if (streamState.stage === 'streaming' && !isLoading) {
      setIsLoading(true)
    }
  }, [streamState.stage, streamState.response, streamState.error, addToast, isLoading, ordersMap])

  const handleQuery = useCallback(async (query: string) => {
    if (!query.trim() || !auth?.tenant.tenant_id) return
    try {
      setIsLoading(true)
      setCurrentResponse(null)

      const userMessage: CopilotMessage = {
        id: `msg-${Date.now()}`,
        type: 'user',
        content: query,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, userMessage])
      setInput('')

      if (useStreaming) {
        streamConnect(auth.tenant.tenant_id, query)
      } else {
        abortRef.current = new AbortController()
        const response = await copilotAPI.query(query, {}, abortRef.current.signal)
        const data = response as CopilotResponse
        const ve = data.evidence ? validateEvidence(data.evidence, ordersMap) : undefined
        const assistantMessage: CopilotMessage = {
          id: `msg-${Date.now()}-resp`,
          type: 'assistant',
          content: data.summary,
          timestamp: new Date(),
          response: data,
          validatedEvidence: ve,
        }
        setMessages((prev) => [...prev, assistantMessage])
        setCurrentResponse(data)
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      addToast({
        type: 'error',
        title: 'Error processing query',
        message: error instanceof Error ? error.message : 'Failed to process your question',
        duration: 5000,
      })
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          type: 'assistant',
          content: 'An error occurred. Please try again.',
          timestamp: new Date(),
        },
      ])
    } finally {
      if (!useStreaming) setIsLoading(false)
    }
  }, [addToast, streamConnect, useStreaming, auth, ordersMap])

  const handleCancel = useCallback(() => {
    if (useStreaming) {
      streamCancel()
    } else {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
    setIsLoading(false)
    addToast({
      type: 'info',
      title: 'Cancelled',
      message: 'Response cancelled',
      duration: 3000,
    })
  }, [useStreaming, streamCancel, addToast])

  const handleClose = useCallback(() => {
    setIsOpen(false)
    setMessages([])
    setCurrentResponse(null)
    streamDisconnect()
  }, [streamDisconnect])

  const streamingActive = useStreaming && (
    streamState.stage === 'connecting' ||
    streamState.stage === 'reconnecting' ||
    streamState.stage === 'thinking' ||
    streamState.stage === 'gathering_context' ||
    streamState.stage === 'streaming'
  )

  const isBusy = isLoading || !!streamingActive

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 bg-gradient-to-r from-accent to-teal-DEFAULT hover:from-accent/90 hover:to-teal-DEFAULT/90 text-white rounded-full p-4 shadow-lg hover:shadow-xl hover:shadow-accent/25 active:scale-[0.97] transition-all duration-300 group"
        aria-label="Open Operations Copilot"
      >
        <Sparkle size={24} className="group-hover:scale-110 transition-transform duration-200" weight="duotone" />
      </button>
    )
  }

  const panelWidth = isExpanded ? 'w-[640px]' : 'w-96'
  const panelHeight = isExpanded ? 'h-[820px]' : 'h-[520px]'

  return (
    <div
      className={`fixed z-40 bottom-6 right-6 ${panelWidth} ${panelHeight} max-w-[calc(100vw-48px)] max-h-[calc(100vh-48px)] flex flex-col bg-obsidian border border-steel-grey/40 rounded-xl shadow-2xl shadow-black/50 transition-all duration-300`}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-steel-grey/30 bg-abyss rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-accent/15 flex items-center justify-center">
            <Sparkle size={14} weight="fill" className="text-accent" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-pearl">AI Command Center</h3>
            <p className="text-[10px] text-mist">LLM-Powered Intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setUseStreaming(!useStreaming)}
            className={`p-1.5 rounded-lg transition-colors ${
              useStreaming ? 'text-accent bg-accent/10' : 'text-mist hover:text-pearl'
            }`}
            aria-label="Toggle streaming"
            title={useStreaming ? 'WebSocket streaming on' : 'REST mode'}
          >
            <FlowArrow size={14} weight={useStreaming ? 'fill' : 'regular'} />
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 hover:bg-navy rounded-lg transition-colors text-mist hover:text-pearl"
            aria-label={isExpanded ? 'Minimize' : 'Expand'}
          >
            {isExpanded ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 hover:bg-navy rounded-lg transition-colors text-mist hover:text-pearl text-sm font-medium"
            aria-label="Close copilot"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
          {messages.length === 0 && !streamingActive ? (
            <div className="h-full flex flex-col justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sparkle size={14} weight="fill" className="text-accent" />
                  <p className="text-sm text-pearl font-medium">
                    AI Command Center
                  </p>
                </div>
                <p className="text-[12px] text-mist leading-relaxed">
                  Operations intelligence powered by LLM. Ask about fleet status, risk analysis, route performance, and more. Every response includes evidence, confidence scoring, and actionable recommendations.
                </p>
                <div className="flex gap-3 text-[10px] text-mist/60">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-DEFAULT" />
                    {useStreaming ? 'WebSocket active' : 'REST mode'}
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                    LLM-powered
                  </span>
                </div>
              </div>
              <SuggestedQuestions onSelectQuestion={handleQuery} />
            </div>
          ) : (
            <>
              <CopilotChat
                messages={messages}
                isLoading={isLoading && !streamingActive}
                loadingStage="Processing..."
                streamStage={streamingActive ? streamState.stage : undefined}
                streamStageContent={streamState.stageContent}
                streamedContent={streamState.streamedContent}
              />
              {currentResponse && !streamingActive && !isLoading && (
                <div className="space-y-3">
                  <EvidenceCard
                    evidence={currentResponse.evidence || []}
                    validatedEvidence={validatedEvidence}
                    relatedOrderIds={currentResponse.related_order_ids || currentResponse.affected_orders}
                    relatedDriverIds={currentResponse.related_driver_ids || currentResponse.affected_drivers}
                    isExpanded={isExpanded}
                  />
                  <RecommendationPanel
                    recommendations={currentResponse.recommendations || []}
                    confidence={currentResponse.confidence}
                    isExpanded={isExpanded}
                  />
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-steel-grey/30 bg-abyss/80 rounded-b-xl">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !isBusy) handleQuery(input) }}
              placeholder="Ask about delays, risks, performance..."
              className="flex-1 bg-obsidian border border-steel-grey/40 rounded-lg px-3 py-2.5 text-sm text-pearl placeholder-mist/60 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              disabled={isBusy}
              aria-label="Ask a question"
            />
            {isBusy ? (
              <button
                onClick={handleCancel}
                className="bg-critical-DEFAULT hover:bg-critical-DEFAULT/90 text-white rounded-lg px-3 py-2.5 transition-colors flex items-center justify-center gap-1.5 text-xs font-medium active:scale-[0.97]"
                aria-label="Stop generating"
              >
                <StopCircle size={14} weight="bold" />
                Stop
              </button>
            ) : (
              <button
                onClick={() => handleQuery(input)}
                disabled={!input.trim()}
                className="bg-accent hover:bg-accent/90 disabled:bg-steel-grey disabled:cursor-not-allowed text-white rounded-lg px-3 py-2.5 transition-colors flex items-center justify-center active:scale-[0.97]"
                aria-label="Send message"
              >
                <PaperPlaneTilt size={16} weight="bold" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
