import { useState, useRef, useCallback, useEffect } from 'react'
import { API_CONFIG } from '@/utils/constants'
import type { CopilotStage, CopilotStreamState, CopilotResponse } from '@/types/copilot'

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

  const reset = useCallback(() => {
    setState({
      stage: 'idle',
      stageContent: '',
      streamedContent: '',
      response: null,
      error: null,
      isConnected: false,
    })
  }, [])

  const disconnect = useCallback(() => {
    abortRef.current = true
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.close()
      wsRef.current = null
    }
    setState((prev) => ({ ...prev, isConnected: false, stage: 'idle' }))
  }, [])

  const connect = useCallback((tenantId: string, query: string) => {
    abortRef.current = false

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
            setState((prev) => ({
              ...prev,
              stage: 'streaming',
              stageContent: 'Receiving response...',
              streamedContent: prev.streamedContent + (msg.content || ''),
            }))
            break
          }

          case 'copilot_response': {
            const response = msg.content as CopilotResponse
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
        setState((prev) => ({
          ...prev,
          streamedContent: prev.streamedContent + event.data,
        }))
      }
    }

    ws.onerror = () => {
      if (abortRef.current) return
      setState((prev) => ({
        ...prev,
        stage: 'error',
        error: 'WebSocket connection failed',
        isConnected: false,
      }))
    }

    ws.onclose = () => {
      if (abortRef.current) return
      setState((prev) => ({
        ...prev,
        stage: prev.stage === 'complete' ? 'complete' : 'error',
        isConnected: false,
      }))
    }
  }, [])

  useEffect(() => {
    return () => {
      abortRef.current = true
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
    }
  }, [])

  return { state, connect, disconnect, reset }
}