import { WebSocketMessage, WebSocketMessageType, AgentDecisionMessage, RouteUpdatedMessage, ETAUpdatedMessage, LiveOrder } from '@/types/api'
import { fleetStore } from '@/store/fleetStore'
import { API_CONFIG } from '@/utils/constants'

export const WS_EVENTS = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ORDER_CREATED: 'order_created',
  POSITION_UPDATED: 'position_updated',
  PREDICTION_UPDATED: 'prediction_updated',
  AGENT_DECISION: 'agent_decision',
  ROUTE_UPDATED: 'route_updated',
  ETA_UPDATED: 'eta_updated',
  ALERT: 'alert',
} as const

type InternalStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'offline'
type MessageHandler = (message: WebSocketMessage) => void

class WebSocketManager {
  #ws: WebSocket | null = null
  #reconnectTimer: ReturnType<typeof setTimeout> | null = null
  #reconnectAttempts = 0
  #maxReconnectAttempts = 20
  #heartbeatTimer: ReturnType<typeof setInterval> | null = null
  #rttTimer: ReturnType<typeof setTimeout> | null = null
  #tenantId: string | null = null
  #token: string | null = null
  #lastHeartbeat = 0
  #lastPingSent = 0
  #heartbeatInterval = 25000
  #handlers: Map<string, Set<MessageHandler>> = new Map()
  #status: InternalStatus = 'disconnected'
  #visibilityHandler: (() => void) | null = null

  connect(tenantId: string, token: string): void {
    if (this.#status === 'connecting' || this.#status === 'connected') return

    this.#tenantId = tenantId
    this.#token = token
    this.#reconnectAttempts = 0
    this.#clearReconnectTimer()
    this.#setStatus('connecting')

    // Pass JWT via Sec-WebSocket-Protocol header (NOT query params)
    // This prevents token leakage in server logs, browser history, and referrer headers
    const wsUrl = API_CONFIG.WS_URL

    try {
      const ws = new WebSocket(wsUrl, [token])
      this.#ws = ws

      ws.onopen = () => {
        if (ws !== this.#ws) return
        this.#reconnectAttempts = 0
        this.#setStatus('connected')
        this.#startHeartbeat()
        this.emit('connected', { type: 'connected' as WebSocketMessageType, data: {}, timestamp: new Date().toISOString() })
      }

      ws.onmessage = (event) => {
        if (ws !== this.#ws) return
        try {
          const message: WebSocketMessage = JSON.parse(event.data)
          if (message.type === 'pong') {
            this.#handlePong()
          } else {
            this.#routeMessage(message)
          }
        } catch {
          console.warn('[WS] Parse error')
        }
      }

      ws.onerror = () => {}

      ws.onclose = (event) => {
        if (ws !== this.#ws) return
        this.#stopHeartbeat()
        this.#ws = null
        // If 1008 (policy violation), don't reconnect - auth failed
        if (event.code === 1008) {
          this.#setStatus('offline')
          return
        }
        this.#scheduleReconnect()
      }
    } catch {
      this.#ws = null
      this.#scheduleReconnect()
    }
  }

  disconnect(): void {
    this.#stopHeartbeat()
    this.#clearReconnectTimer()
    this.#removeVisibilityHandler()
    if (this.#ws) {
      this.#ws.onopen = null
      this.#ws.onmessage = null
      this.#ws.onerror = null
      this.#ws.onclose = null
      this.#ws.close()
      this.#ws = null
    }
    this.#setStatus('disconnected')
    this.#tenantId = null
    this.#token = null
    this.#reconnectAttempts = 0
    this.#handlers.clear()
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set())
    }
    this.#handlers.get(event)!.add(handler)
    return () => { this.off(event, handler) }
  }

  off(event: string, handler: MessageHandler): void {
    this.#handlers.get(event)?.delete(handler)
  }

  emit(event: string, data: WebSocketMessage): void {
    this.#handlers.get(event)?.forEach(handler => {
      try { handler(data) } catch {
        // Silently fail - handler errors should not break the WS loop
      }
    })
  }

  #setStatus(status: InternalStatus): void {
    this.#status = status
    const mapped: 'connecting' | 'connected' | 'reconnecting' | 'disconnected' =
      status === 'degraded' ? 'connected'
      : status === 'offline' ? 'disconnected'
      : status
    fleetStore.getState().setConnectionStatus(mapped)
  }

  #scheduleReconnect(): void {
    if (this.#reconnectAttempts >= this.#maxReconnectAttempts) {
      this.#setStatus('offline')
      return
    }
    this.#reconnectAttempts++
    this.#setStatus('reconnecting')
    const jitter = Math.random() * 1000
    const delay = Math.min(1000 * Math.pow(2, this.#reconnectAttempts - 1) + jitter, 30000)
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = null
      if (this.#tenantId && this.#token && this.#status !== 'offline') {
        this.connect(this.#tenantId, this.#token)
      }
    }, delay)
  }

  #clearReconnectTimer(): void {
    if (this.#reconnectTimer) {
      clearTimeout(this.#reconnectTimer)
      this.#reconnectTimer = null
    }
  }

  #startHeartbeat(): void {
    this.#lastHeartbeat = Date.now()
    this.#lastPingSent = 0
    this.#heartbeatTimer = setInterval(() => {
      if (!this.#ws || this.#ws.readyState !== WebSocket.OPEN) return
      if (Date.now() - this.#lastHeartbeat > this.#heartbeatInterval * 2) {
        this.#setStatus('degraded')
      }
      this.#lastPingSent = Date.now()
      this.#send({ type: 'ping' as WebSocketMessageType, data: {}, timestamp: new Date().toISOString() })
    }, this.#heartbeatInterval)
    this.#addVisibilityHandler()
  }

  #stopHeartbeat(): void {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer)
      this.#heartbeatTimer = null
    }
    if (this.#rttTimer) {
      clearTimeout(this.#rttTimer)
      this.#rttTimer = null
    }
    this.#lastPingSent = 0
  }

  #handlePong(): void {
    if (this.#lastPingSent > 0) {
      const rtt = Date.now() - this.#lastPingSent
      this.#lastPingSent = 0
      this.#lastHeartbeat = Date.now()
      if (rtt < 500) {
        this.#heartbeatInterval = Math.max(10000, this.#heartbeatInterval - 1000)
      } else if (rtt > 2000) {
        this.#heartbeatInterval = Math.min(60000, this.#heartbeatInterval + 5000)
      }
    }
    if (this.#status === 'degraded') {
      this.#setStatus('connected')
    }
  }

  #send(message: WebSocketMessage): void {
    if (this.#ws?.readyState === WebSocket.OPEN) {
      try { this.#ws.send(JSON.stringify(message)) } catch {
        // Send errors handled by onclose
      }
    }
  }

  #routeMessage(message: WebSocketMessage): void {
    switch (message.type as string) {
      case 'order_position_updated': {
        const data = message.data as Record<string, any>
        fleetStore.getState().updateOrderPosition(data.order_id, {
          lat: data.lat,
          lng: data.lng,
          speed_kmh: data.speed,
          heading: data.heading ?? 0,
          risk_score: data.risk_score ?? 0,
          timestamp: data.timestamp ?? new Date().toISOString(),
        })
        this.emit(WS_EVENTS.POSITION_UPDATED, message)
        break
      }

      case 'order_created': {
        const created = message.data as {
          order_id: string
          driver_id: string
          planned_eta: string
          risk_score?: number
          latitude?: number
          longitude?: number
          speed_kmh?: number
          stops?: Array<{
            id?: string
            address?: string
            lat?: number
            lng?: number
            sequence?: number
            status?: 'pending' | 'completed'
            arrival_time?: string | null
          }>
          created_at?: string
          updated_at?: string
        }

        const stops = (created.stops || []).map((stop, index) => ({
          id: stop.id || `stop-${index}`,
          address: stop.address || `Stop ${index + 1}`,
          lat: stop.lat ?? created.latitude ?? 0,
          lng: stop.lng ?? created.longitude ?? 0,
          sequence: stop.sequence ?? index + 1,
          status: stop.status ?? 'pending',
          arrival_time: stop.arrival_time ?? null,
        }))

        const positionLat = created.latitude ?? stops[0]?.lat ?? 0
        const positionLng = created.longitude ?? stops[0]?.lng ?? 0

        fleetStore.getState().setOrders([{
          id: created.order_id,
          driver_id: created.driver_id,
          status: 'active',
          planned_eta: created.planned_eta,
          current_eta: created.planned_eta,
          origin_lat: positionLat,
          origin_lng: positionLng,
          destination_lat: stops.at(-1)?.lat ?? positionLat,
          destination_lng: stops.at(-1)?.lng ?? positionLng,
          stops,
          current_position: {
            lat: positionLat,
            lng: positionLng,
            speed_kmh: created.speed_kmh ?? 0,
            heading: 0,
            event_type: 'order_created',
            timestamp: created.created_at ?? new Date().toISOString(),
          },
          distance_remaining_km: 0,
          time_remaining_minutes: 0,
          created_at: created.created_at ?? new Date().toISOString(),
          updated_at: created.updated_at ?? created.created_at ?? new Date().toISOString(),
          risk_score: created.risk_score ?? 0,
          is_high_risk: (created.risk_score ?? 0) > 0.7,
          delay_minutes: 0,
          route_efficiency: 100,
        } as LiveOrder])
        this.emit(WS_EVENTS.ORDER_CREATED, message)
        break
      }

      case 'prediction_updated': {
        const update = message.data as { order_id: string; risk_score: number; timestamp: string }
        fleetStore.getState().updateOrderRisk(update.order_id, update.risk_score, update.timestamp)
        this.emit(WS_EVENTS.PREDICTION_UPDATED, message)
        break
      }

      case 'agent_decision': {
        const decision = message.data as AgentDecisionMessage
        fleetStore.getState().addAgentDecision({
          id: `${decision.order_id}-${Date.now()}`,
          order_id: decision.order_id,
          decision_type: decision.decision,
          reasoning: decision.reasoning,
          risk_score: decision.risk_score,
          tools_invoked: [],
          outcome: 'success',
          created_at: new Date().toISOString(),
          latency_ms: decision.latency_ms,
        })
        this.emit(WS_EVENTS.AGENT_DECISION, message)
        break
      }

      case 'route_updated': {
        const update = message.data as RouteUpdatedMessage
        fleetStore.getState().updateRouteWaypoints(update.order_id, update.new_waypoints)
        this.emit(WS_EVENTS.ROUTE_UPDATED, message)
        break
      }

      case 'eta_updated': {
        const update = message.data as ETAUpdatedMessage
        fleetStore.getState().updateOrderETA(update.order_id, update.new_eta)
        this.emit(WS_EVENTS.ETA_UPDATED, message)
        break
      }

      case 'alert': {
        this.emit(WS_EVENTS.ALERT, message)
        break
      }

      default: {
        this.emit(message.type, message)
      }
    }
  }

  #addVisibilityHandler(): void {
    this.#removeVisibilityHandler()
    const handler = () => {
      if (document.hidden) {
        this.#stopHeartbeat()
        if (this.#ws) {
          this.#ws.onopen = null
          this.#ws.onmessage = null
          this.#ws.onerror = null
          this.#ws.onclose = null
          this.#ws.close()
          this.#ws = null
        }
      } else if (this.#tenantId && this.#token) {
        this.#clearReconnectTimer()
        this.#reconnectAttempts = 0
        this.connect(this.#tenantId, this.#token)
      }
    }
    this.#visibilityHandler = handler
    document.addEventListener('visibilitychange', handler)
  }

  #removeVisibilityHandler(): void {
    if (this.#visibilityHandler) {
      document.removeEventListener('visibilitychange', this.#visibilityHandler)
      this.#visibilityHandler = null
    }
  }
}

export const wsManager = new WebSocketManager()
