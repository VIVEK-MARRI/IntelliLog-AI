import { WebSocketMessage, WebSocketMessageType, AgentDecisionMessage, RouteUpdatedMessage, ETAUpdatedMessage, LiveOrder } from '@/types/api'
import { fleetStore } from '@/store/fleetStore'
import { useAuthStore } from '@/store/authStore'
import { useActivityStore } from '@/store/activityStore'
import { API_CONFIG } from '@/utils/constants'
import { syntheticPosition } from '@/api/orders'

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
  #lastHeartbeat = 0
  #lastPingSent = 0
  #heartbeatInterval = 25000
  #handlers: Map<string, Set<MessageHandler>> = new Map()
  #status: InternalStatus = 'disconnected'
  #visibilityHandler: (() => void) | null = null
  #positionQueue: Map<string, Record<string, any>> = new Map()
  #flushTimer: number | null = null
  #parseErrors = 0
  #unknownEvents = 0
  #invalidPayloads = 0

  private getCurrentToken(): string | null {
    try {
      const auth = useAuthStore.getState().auth
      return auth?.token ?? null
    } catch {
      return null
    }
  }

  connect(tenantId: string): void {
    if (this.#status === 'connecting' || this.#status === 'connected') return

    const token = this.getCurrentToken()
    if (!token) {
      this.#setStatus('offline')
      return
    }

    this.#tenantId = tenantId
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
        const raw = event.data
        console.log('[WS] RAW MESSAGE:', raw)
        try {
          const message: WebSocketMessage = JSON.parse(raw)
          if (message.type === 'pong') {
            this.#handlePong()
          } else {
            this.#routeMessage(message)
          }
        } catch {
          // Backend may send plain-text "pong" or heartbeat — treat as pong
          if (typeof raw === 'string' && raw.toLowerCase().includes('pong')) {
            this.#handlePong()
          } else {
            this.#parseErrors++
            this.#logError('parse_error', 'unknown', `Invalid JSON: ${typeof raw === 'string' ? raw.slice(0, 100) : typeof raw}`)
          }
        }
      }

      ws.onerror = () => {}

      ws.onclose = (event) => {
        if (ws !== this.#ws) return
        this.#cancelFlush()
        this.#flushPositionBatch()
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
    this.#cancelFlush()
    this.#flushPositionBatch()
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
    this.#reconnectAttempts = 0
    this.#handlers.clear()
  }

  on(event: string, handler: MessageHandler): () => void {
    if (!this.#handlers.has(event)) {
      this.#handlers.set(event, new Set())
    }
    const handlers = this.#handlers.get(event)!
    if (handlers.has(handler)) return () => {}
    handlers.add(handler)
    return () => { this.off(event, handler) }
  }

  off(event: string, handler: MessageHandler): void {
    const handlers = this.#handlers.get(event)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) {
      this.#handlers.delete(event)
    }
  }

  emit(event: string, data: WebSocketMessage): void {
    const handlers = this.#handlers.get(event)
    if (!handlers || handlers.size === 0) return
    const snapshot = [...handlers]
    for (const handler of snapshot) {
      try { handler(data) } catch {
        // Silently fail - handler errors should not break the WS loop
      }
    }
  }

  getStats(): {
    events: number
    handlers: number
    eventBreakdown: Record<string, number>
    parseErrors: number
    unknownEvents: number
    invalidPayloads: number
  } {
    const eventBreakdown: Record<string, number> = {}
    let total = 0
    this.#handlers.forEach((handlers, event) => {
      const count = handlers.size
      eventBreakdown[event] = count
      total += count
    })
    return {
      events: this.#handlers.size,
      handlers: total,
      eventBreakdown,
      parseErrors: this.#parseErrors,
      unknownEvents: this.#unknownEvents,
      invalidPayloads: this.#invalidPayloads,
    }
  }

  #logError(category: string, type: string, reason: string): void {
    console.warn(`[WS] ${category} type=${type} reason=${reason}`)
  }

  #validateFields(data: unknown, required: string[]): boolean {
    if (!data || typeof data !== 'object') return false
    for (const field of required) {
      if (!(field in (data as Record<string, unknown>)) || (data as Record<string, unknown>)[field] == null) return false
    }
    return true
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
      if (this.#tenantId && this.#status !== 'offline') {
        this.connect(this.#tenantId)
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
    if (!message.type) {
      this.#invalidPayloads++
      this.#logError('invalid_payload', 'unknown', 'Missing type')
      return
    }

    const type = message.type as string

    switch (type) {
      case 'order_position_updated': {
        const data = message.data as Record<string, any>
        if (!this.#validateFields(data, ['order_id', 'lat', 'lng'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, lat, lng)')
          break
        }
        this.#positionQueue.set(data.order_id, data)
        this.#schedulePositionFlush()
        break
      }

      case 'order_created': {
        const created = message.data as Record<string, any>
        if (!this.#validateFields(created, ['order_id', 'driver_id', 'planned_eta'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, driver_id, planned_eta)')
          break
        }

        const stops = (created.stops || []).map((stop: any, index: number) => ({
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
        useActivityStore.getState().addEvent({
          id: `act-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'order_created',
          severity: 'success',
          title: 'Order Created',
          description: `Order ${created.order_id?.slice(0, 8)} assigned to driver ${created.driver_id?.slice(0, 8)}`,
          orderId: created.order_id,
        })
        this.emit(WS_EVENTS.ORDER_CREATED, message)
        break
      }

      case 'prediction_updated': {
        const update = message.data as Record<string, any>
        if (!this.#validateFields(update, ['order_id', 'risk_score'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, risk_score)')
          break
        }
        fleetStore.getState().updateOrderRisk(update.order_id, update.risk_score, update.timestamp)
        useActivityStore.getState().addEvent({
          id: `pred-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'prediction_updated',
          severity: update.risk_score > 0.7 ? 'critical' : update.risk_score > 0.3 ? 'warning' : 'info',
          title: 'Risk Updated',
          description: `Order ${update.order_id?.slice(0, 8)} risk score: ${Math.round(update.risk_score * 100)}%`,
          orderId: update.order_id,
        })
        this.emit(WS_EVENTS.PREDICTION_UPDATED, message)
        break
      }

      case 'agent_decision': {
        const decision = message.data as AgentDecisionMessage
        if (!this.#validateFields(decision, ['order_id', 'decision'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, decision)')
          break
        }
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
        useActivityStore.getState().addEvent({
          id: `dec-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'agent_decision',
          severity: decision.decision === 'reroute' ? 'warning' : 'info',
          title: `Agent Decision: ${decision.decision}`,
          description: decision.reasoning?.slice(0, 120) ?? '',
          orderId: decision.order_id,
        })
        this.emit(WS_EVENTS.AGENT_DECISION, message)
        break
      }

      case 'route_updated': {
        const update = message.data as RouteUpdatedMessage
        if (!this.#validateFields(update, ['order_id', 'new_waypoints'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, new_waypoints)')
          break
        }
        fleetStore.getState().updateRouteWaypoints(update.order_id, update.new_waypoints)
        useActivityStore.getState().addEvent({
          id: `route-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'route_updated',
          severity: 'info',
          title: 'Route Updated',
          description: `Order ${update.order_id?.slice(0, 8)} route updated, saving ${Math.round(update.time_saved_minutes ?? 0)} min`,
          orderId: update.order_id,
        })
        this.emit(WS_EVENTS.ROUTE_UPDATED, message)
        break
      }

      case 'eta_updated': {
        const update = message.data as ETAUpdatedMessage
        if (!this.#validateFields(update, ['order_id', 'new_eta'])) {
          this.#invalidPayloads++
          this.#logError('invalid_payload', type, 'Missing required fields (order_id, new_eta)')
          break
        }
        fleetStore.getState().updateOrderETA(update.order_id, update.new_eta)
        useActivityStore.getState().addEvent({
          id: `eta-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'eta_updated',
          severity: update.reason?.includes('delay') ? 'warning' : 'info',
          title: 'ETA Updated',
          description: `Order ${update.order_id?.slice(0, 8)} ETA: ${update.reason ?? 'Adjusted'}`,
          orderId: update.order_id,
        })
        this.emit(WS_EVENTS.ETA_UPDATED, message)
        break
      }

      case 'initial_state': {
        const payload = message.data as Record<string, any> | undefined
        if (!payload) break
        const wsOrders = (payload.orders || []) as Array<{
          order_id: string; status: string; risk_score: number;
          latitude: number; longitude: number; driver_id?: string;
        }>
        if (wsOrders.length === 0) break

        const liveOrders: LiveOrder[] = wsOrders.map((o) => ({
          id: o.order_id,
          driver_id: o.driver_id ?? '',
          status: o.status === 'completed' ? 'completed' : 'active' as LiveOrder['status'],
          planned_eta: new Date().toISOString(),
          current_eta: new Date().toISOString(),
          origin_lat: o.latitude,
          origin_lng: o.longitude,
          destination_lat: 0,
          destination_lng: 0,
          stops: [],
          current_position: (() => {
            const lat = o.latitude
            const lng = o.longitude
            const valid = lat != null && lng != null
              && !isNaN(Number(lat)) && !isNaN(Number(lng))
              && (Number(lat) !== 0 || Number(lng) !== 0)
            if (valid) {
              return {
                lat: Number(lat),
                lng: Number(lng),
                speed_kmh: 0,
                heading: 0,
                event_type: 'gps_ping',
                timestamp: new Date().toISOString(),
              }
            }
            const syn = syntheticPosition(o.order_id)
            return {
              lat: syn.lat,
              lng: syn.lng,
              speed_kmh: 0,
              heading: 0,
              event_type: 'gps_ping',
              timestamp: new Date().toISOString(),
            }
          })(),
          distance_remaining_km: 0,
          time_remaining_minutes: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          risk_score: o.risk_score,
          is_high_risk: o.risk_score > 0.7,
          delay_minutes: 0,
          route_efficiency: 0,
        }))

        fleetStore.getState().setOrders(liveOrders)
        break
      }

      case 'alert': {
        this.emit(WS_EVENTS.ALERT, message)
        break
      }

      default: {
        this.#unknownEvents++
        this.#logError('unknown_event', type, 'Unrecognized event type')
      }
    }
  }

  #cancelFlush(): void {
    if (this.#flushTimer !== null) {
      cancelAnimationFrame(this.#flushTimer)
      this.#flushTimer = null
    }
  }

  #schedulePositionFlush(): void {
    if (this.#flushTimer !== null) return
    this.#flushTimer = requestAnimationFrame(() => {
      this.#flushTimer = null
      this.#flushPositionBatch()
    })
  }

  #flushPositionBatch(): void {
    if (this.#positionQueue.size === 0) return

    const updates: Array<{
      orderId: string
      lat: number
      lng: number
      speed_kmh: number
      heading: number
      risk_score: number
      timestamp: string
    }> = []

    this.#positionQueue.forEach((data, orderId) => {
      updates.push({
        orderId,
        lat: data.lat,
        lng: data.lng,
        speed_kmh: data.speed,
        heading: data.heading ?? 0,
        risk_score: data.risk_score ?? 0,
        timestamp: data.timestamp ?? new Date().toISOString(),
      })
    })

    this.#positionQueue.clear()
    fleetStore.getState().batchUpdatePositions(updates)
    this.emit(WS_EVENTS.POSITION_UPDATED, {
      type: 'position_updated_batch',
      data: { count: updates.length },
      timestamp: new Date().toISOString(),
    })
  }

  #addVisibilityHandler(): void {
    this.#removeVisibilityHandler()
    const handler = () => {
      if (document.hidden) {
        // Pause heartbeat only - keep WS alive for message continuity
        this.#stopHeartbeat()
      } else if (this.#tenantId) {
        // Flush any position updates accumulated while hidden
        this.#cancelFlush()
        this.#flushPositionBatch()
        // Resume heartbeat if WS is still alive
        const ws = this.#ws
        if (ws && ws.readyState === WebSocket.OPEN) {
          this.#startHeartbeat()
        } else if (ws && ws.readyState !== WebSocket.CONNECTING) {
          // WS closed while hidden - reconnect with fresh token
          const token = this.getCurrentToken()
          if (token) {
            this.#clearReconnectTimer()
            this.#reconnectAttempts = 0
            this.connect(this.#tenantId)
          }
        }
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
