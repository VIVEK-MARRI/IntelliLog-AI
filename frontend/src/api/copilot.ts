/**
 * Copilot API client — supports both REST and WebSocket streaming
 */
import { apiClient } from './client'
import { API_CONFIG } from '@/utils/constants'

export const copilotAPI = {
  /**
   * Query the operations copilot endpoint (REST)
   */
  async query(query: string, context: any = {}) {
    return apiClient.post('/copilot/query', { query, context })
  },

  /**
   * Get LLM-powered recommendations
   */
  async getRecommendations() {
    return apiClient.post('/copilot/recommendations', {})
  },

  /**
   * Analyze anomalies via LLM
   */
  async analyzeAnomalies() {
    return apiClient.post('/copilot/anomalies', {})
  },

  /**
   * Query copilot via WebSocket with streaming response
   */
  streamQuery(tenantId: string, query: string): {
    stream: AsyncGenerator<any, void, unknown>
    close: () => void
  } {
    let ws: WebSocket | null = null
    let closed = false

    const stream = (async function* () {
      const wsUrl = `${API_CONFIG.COPILOT_WS_URL}/${tenantId}`
      ws = new WebSocket(wsUrl)

      await new Promise<void>((resolve, reject) => {
        if (!ws) return reject(new Error('WebSocket not created'))
        ws.onopen = () => {
          ws!.send(JSON.stringify({ query }))
          resolve()
        }
        ws.onerror = () => reject(new Error('WebSocket connection failed'))
        ws.onclose = () => { if (!closed) closed = true }
      })

      while (!closed) {
        if (!ws) break
        const message = await new Promise<any>((resolve) => {
          ws!.onmessage = (event) => {
            try { resolve(JSON.parse(event.data)) }
            catch { resolve({ type: 'raw', content: event.data }) }
          }
          ws!.onclose = () => resolve({ type: 'close' })
          ws!.onerror = () => resolve({ type: 'error', content: 'WebSocket error' })
        })

        if (message.type === 'close' || message.type === 'error') {
          closed = true
          if (message.type === 'error') yield message
          break
        }

        yield message
      }
    })()

    return {
      stream,
      close: () => {
        closed = true
        if (ws) {
          ws.onclose = null
          ws.close()
          ws = null
        }
      },
    }
  },
}
