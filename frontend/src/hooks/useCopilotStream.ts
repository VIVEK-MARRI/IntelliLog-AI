import { useState, useRef, useCallback, useEffect } from 'react'
import { API_CONFIG } from '@/utils/constants'
import type { CopilotStage, CopilotStreamState, CopilotResponse } from '@/types/copilot'

const MAX_RECONNECT_ATTEMPTS = 20

function getBackoffDelay(attempt: number): number {
  const jitter = Math.random() * 1000
  return Math.min(1000 * Math.pow(2, attempt - 1) + jitter, 30000)
}

export function useCopilotStream() {
  const [state, setState] = useState<CopilotStreamState>({
    stage: 'idle',
    stageContent: '',
    streamedContent: '',
    response: null,
    error: null,
    isConnected: false,
  })

  const wsRef = useRef<WebSocket | null>(null)
  const abortRef = useRef<boolean>(false)
  const reconnectAttemptsRef = useRef<number>(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tenantIdRef = useRef<string | null>(null)
  const queryRef = useRef<string | null>(null)
  const tokenBufferRef = useRef<string[]>([])
  let parseErrors = 0
  let invalidMessages = 0

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
  }, [])

  const closeSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onopen = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onclose = null
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current = true
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    tenantIdRef.current = null
    queryRef.current = null
    tokenBufferRef.current = []
    closeSocket()
    setState({
      stage: 'cancelled',
      stageContent: 'Cancelled',
      streamedContent: '',
      response: null,
      error: null,
      isConnected: false,
    })
  }, [clearReconnectTimer, closeSocket])

  const reset = useCallback(() => {
    abortRef.current = true
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    tenantIdRef.current = null
    queryRef.current = null
    tokenBufferRef.current = []
    setState({
      stage: 'idle',
      stageContent: '',
      streamedContent: '',
      response: null,
      error: null,
      isConnected: false,
    })
  }, [clearReconnectTimer])

  const disconnect = useCallback(() => {
    abortRef.current = true
    clearReconnectTimer()
    reconnectAttemptsRef.current = 0
    tenantIdRef.current = null
    queryRef.current = null
    tokenBufferRef.current = []
    closeSocket()
    setState((prev) => ({ ...prev, isConnected: false, stage: 'idle' }))
  }, [clearReconnectTimer, closeSocket])

  const connect = useCallback((tenantId: string, query: string) => {
    abortRef.current = true
    clearReconnectTimer()
    closeSocket()
    tokenBufferRef.current = []
    parseErrors = 0
    invalidMessages = 0

    abortRef.current = false
    reconnectAttemptsRef.current = 0
    tenantIdRef.current = tenantId
    queryRef.current = query

    setState({
      stage: 'connecting',
      stageContent: 'Connecting...',
      streamedContent: '',
      response: null,
      error: null,
      isConnected: false,
    })

    const wsUrl = `${API_CONFIG.COPILOT_WS_URL}/${tenantId}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws

    ws.onopen = () => {
      if (abortRef.current) { ws.close(); return }
      reconnectAttemptsRef.current = 0
      setState((prev) => ({ ...prev, isConnected: true }))
      ws.send(JSON.stringify({ query }))
    }

    ws.onmessage = (event) => {
      if (abortRef.current) return
      try {
        const msg = JSON.parse(event.data)

        switch (msg.type) {
          case 'status': {
            const stage = msg.stage as CopilotStage
            setState((prev) => ({
              ...prev,
              stage: stage || 'thinking',
              stageContent: msg.content || '',
            }))
            break
          }

          case 'token': {
            tokenBufferRef.current.push(msg.content || '')
            setState((prev) => ({
              ...prev,
              stage: 'streaming',
              stageContent: 'Receiving response...',
              streamedContent: tokenBufferRef.current.join(''),
            }))
            break
          }

          case 'copilot_response': {
            const response = msg.content as CopilotResponse
            tokenBufferRef.current = []
            setState((prev) => ({
              ...prev,
              stage: 'complete',
              stageContent: 'Complete',
              response,
              streamedContent: response?.summary || prev.streamedContent,
            }))
            break
          }

          case 'error': {
            tokenBufferRef.current = []
            setState((prev) => ({
              ...prev,
              stage: 'error',
              stageContent: '',
              error: msg.content || 'An error occurred',
              isConnected: false,
            }))
            break
          }
        }
      } catch {
        parseErrors++
        invalidMessages++
        tokenBufferRef.current = []
        setState((prev) => ({
          ...prev,
          stage: 'error',
          stageContent: '',
          error: `Invalid response from server (${parseErrors} parse error${parseErrors !== 1 ? 's' : ''})`,
          isConnected: false,
        }))
      }
    }

    ws.onerror = () => {
      if (abortRef.current) return
    }

    ws.onclose = () => {
      if (abortRef.current) return

      setState((prev) => {
        if (prev.stage === 'complete') {
          return { ...prev, isConnected: false }
        }

        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          tokenBufferRef.current = []
          return {
            ...prev,
            stage: 'error',
            error: 'Connection lost. Max reconnection attempts exceeded.',
            isConnected: false,
          }
        }

        reconnectAttemptsRef.current++
        const delay = getBackoffDelay(reconnectAttemptsRef.current)
        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null
          if (!abortRef.current && tenantIdRef.current && queryRef.current) {
            tokenBufferRef.current = []
            connect(tenantIdRef.current, queryRef.current)
          }
        }, delay)

        return {
          ...prev,
          stage: 'reconnecting',
          stageContent: `Reconnecting (attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})...`,
          isConnected: false,
        }
      })
    }
  }, [clearReconnectTimer, closeSocket])

  useEffect(() => {
    return () => {
      abortRef.current = true
      clearReconnectTimer()
      closeSocket()
    }
  }, [clearReconnectTimer, closeSocket])

  return { state, connect, disconnect, reset, cancel }
}
