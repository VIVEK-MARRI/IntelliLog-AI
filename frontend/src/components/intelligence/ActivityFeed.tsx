import React, { useEffect, useRef, useState, useMemo } from 'react'
import { useActivityStore, ActivityEvent, ActivityEventType, EventSeverity } from '@/store/activityStore'
import { wsManager, WS_EVENTS } from '@/api/websocket'
import { fleetStore } from '@/store/fleetStore'
import { WebSocketMessage } from '@/types/api'
import { format } from 'date-fns'
import { Activity, Pause, Play, AlertTriangle, Route, Clock, Brain, TrendingUp, Circle } from 'lucide-react'
import clsx from 'clsx'

type SeverityFilter = EventSeverity | 'all'

const FILTERS: { key: SeverityFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'success', label: 'Success' },
  { key: 'info', label: 'Info' },
]

const SEVERITY_BORDER: Record<EventSeverity, string> = {
  critical: 'border-l-critical',
  warning: 'border-l-warning',
  success: 'border-l-success',
  info: 'border-l-slate-500/50',
}

const formatOrderId = (id: string): string =>
  id.length > 7 ? id.slice(0, 7).toUpperCase() : id.toUpperCase()

const formatTimestamp = (ts: string): string => {
  try {
    return format(new Date(ts), 'HH:mm:ss')
  } catch {
    return '--:--:--'
  }
}

const eventToActivity = (
  type: ActivityEventType,
  data: Record<string, any>,
  msgTimestamp: string
): ActivityEvent => {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const base = { id, type, timestamp: msgTimestamp || new Date().toISOString() }
  const orderId = data.order_id as string | undefined

  switch (type) {
    case 'order_created': {
      const risk = (data.risk_score as number) ?? 0
      return {
        ...base,
        orderId,
        severity: risk > 0.7 ? 'warning' : 'success',
        title: 'New Order Created',
        description: [
          orderId ? formatOrderId(orderId) : null,
          data.driver_id ? `Driver: ${(data.driver_id as string).slice(0, 8)}` : null,
        ].filter(Boolean).join(' — '),
        metadata: { risk_score: risk },
      }
    }

    case 'prediction_updated': {
      const rs = (data.risk_score as number) ?? 0
      return {
        ...base,
        orderId,
        severity: rs > 0.7 ? 'critical' : rs > 0.3 ? 'warning' : 'success',
        title: 'Risk Score Updated',
        description: `${orderId ? formatOrderId(orderId) + ' — ' : ''}${(rs * 100).toFixed(0)}%`,
        metadata: { risk_score: rs },
      }
    }

    case 'agent_decision': {
      const decision = (data.decision as string) ?? 'no_action'
      const severity: EventSeverity =
        decision === 'reroute' ? 'critical' : decision === 'alert' ? 'warning' : 'info'
      return {
        ...base,
        orderId,
        severity,
        title: decision === 'reroute' ? 'Reroute Executed' : decision === 'alert' ? 'Alert Generated' : 'No Action Taken',
        description: [
          orderId ? formatOrderId(orderId) : null,
          data.reasoning ? (data.reasoning as string).slice(0, 60) : null,
        ].filter(Boolean).join(' — '),
        metadata: { decision, latency_ms: data.latency_ms },
      }
    }

    case 'route_updated': {
      const saved = (data.time_saved_minutes as number) ?? 0
      return {
        ...base,
        orderId,
        severity: 'success',
        title: 'Route Optimized',
        description: [
          orderId ? formatOrderId(orderId) : null,
          saved > 0 ? `${saved} min saved` : 'Route adjusted',
        ].filter(Boolean).join(' — '),
        metadata: { time_saved_minutes: saved },
      }
    }

    case 'eta_updated': {
      const reason = (data.reason as string) ?? ''
      const isDelayed = reason.toLowerCase().includes('delay') || reason.toLowerCase().includes('late')
      return {
        ...base,
        orderId,
        severity: isDelayed ? 'warning' : 'info',
        title: 'ETA Updated',
        description: [
          orderId ? formatOrderId(orderId) : null,
          reason || 'Schedule adjusted',
        ].filter(Boolean).join(' — '),
        metadata: { new_eta: data.new_eta },
      }
    }

    case 'alert': {
      const sev = (data.severity as string) ?? 'critical'
      return {
        ...base,
        orderId,
        severity: sev === 'warning' ? 'warning' : 'critical',
        title: 'Alert',
        description: (data.message as string) || (orderId ? `Order ${formatOrderId(orderId)}` : 'System alert'),
        metadata: data,
      }
    }

    default:
      return {
        ...base,
        severity: 'info',
        title: type,
        description: JSON.stringify(data),
        orderId,
      }
  }
}

function useActivitySubscriptions() {
  const addEvent = useActivityStore((s) => s.addEvent)
  const subscribedRef = useRef(false)

  useEffect(() => {
    if (subscribedRef.current) return
    subscribedRef.current = true

    const handlers: { event: string; type: ActivityEventType }[] = [
      { event: WS_EVENTS.ORDER_CREATED, type: 'order_created' },
      { event: WS_EVENTS.PREDICTION_UPDATED, type: 'prediction_updated' },
      { event: WS_EVENTS.AGENT_DECISION, type: 'agent_decision' },
      { event: WS_EVENTS.ROUTE_UPDATED, type: 'route_updated' },
      { event: WS_EVENTS.ETA_UPDATED, type: 'eta_updated' },
      { event: WS_EVENTS.ALERT, type: 'alert' },
    ]

    const unsubs = handlers.map(({ event, type }) =>
      wsManager.on(event, (msg: WebSocketMessage) => {
        addEvent(eventToActivity(type, (msg.data ?? {}) as Record<string, any>, msg.timestamp))
      })
    )

    return () => {
      subscribedRef.current = false
      unsubs.forEach((u) => u())
    }
  }, [addEvent])
}

const eventIcon = (type: ActivityEventType, severity: EventSeverity): React.ReactNode => {
  switch (type) {
    case 'order_created':
      return <Activity className="w-3.5 h-3.5 text-success" />
    case 'prediction_updated':
      return <TrendingUp className={clsx('w-3.5 h-3.5', severity === 'critical' ? 'text-critical' : 'text-warning')} />
    case 'agent_decision':
      return <Brain className="w-3.5 h-3.5 text-accent" />
    case 'route_updated':
      return <Route className="w-3.5 h-3.5 text-success" />
    case 'eta_updated':
      return <Clock className={clsx('w-3.5 h-3.5', severity === 'warning' ? 'text-warning' : 'text-slate-400')} />
    case 'alert':
      return <AlertTriangle className="w-3.5 h-3.5 text-critical" />
  }
}

interface ActivityItemProps {
  event: ActivityEvent
}

const ActivityItem: React.FC<ActivityItemProps> = React.memo(({ event }) => (
  <div
    className={clsx(
      'flex items-start gap-3 px-4 py-3 border-l-2 transition-colors hover:bg-surface-elevated/50',
      SEVERITY_BORDER[event.severity]
    )}
    style={{ contentVisibility: 'auto' }}
  >
    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-surface-elevated border border-border flex items-center justify-center">
      {eventIcon(event.type, event.severity)}
    </div>

    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-primary truncate">{event.title}</span>
        <span className="text-[10px] font-mono text-text-muted flex-shrink-0">{formatTimestamp(event.timestamp)}</span>
      </div>

      <p className="text-xs text-text-secondary mt-0.5 truncate">{event.description}</p>

      {event.metadata && event.type === 'prediction_updated' && event.metadata.risk_score != null && (
        <div className="mt-1.5 h-1 bg-border rounded-full overflow-hidden max-w-[120px]">
          <div
            className={clsx(
              'h-full rounded-full',
              (event.metadata.risk_score as number) > 0.7
                ? 'bg-critical/60'
                : (event.metadata.risk_score as number) > 0.3
                ? 'bg-warning/60'
                : 'bg-success/60'
            )}
            style={{ width: `${Math.min((event.metadata.risk_score as number) * 100, 100)}%` }}
          />
        </div>
      )}
    </div>
  </div>
))

export const ActivityFeed: React.FC = () => {
  useActivitySubscriptions()

  const events = useActivityStore((s) => s.events)
  const clearEvents = useActivityStore((s) => s.clearEvents)
  const connectionStatus = fleetStore((s) => s.connectionStatus)

  const [filter, setFilter] = useState<SeverityFilter>('all')
  const [paused, setPaused] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(events.length)

  const filteredEvents = useMemo(
    () => (filter === 'all' ? events : events.filter((e) => e.severity === filter)),
    [events, filter]
  )

  const counts = useMemo(() => {
    const c = { all: events.length, critical: 0, warning: 0, success: 0, info: 0 }
    for (const e of events) c[e.severity]++
    return c
  }, [events])

  useEffect(() => {
    if (paused || !listRef.current) return
    if (events.length > prevCountRef.current) {
      listRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevCountRef.current = events.length
  }, [events.length, paused])

  const connected = connectionStatus === 'connected'
  const isConnecting = connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
  const isOffline = connectionStatus === 'disconnected'

  const showEmptyState = connected && events.length === 0
  const showNoResults = connected && events.length > 0 && filteredEvents.length === 0

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col h-full shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-accent" />
          <h3 className="text-sm font-semibold text-text-primary">Activity Feed</h3>
          <span
            className={clsx(
              'text-[10px] font-mono px-1.5 py-0.5 rounded',
              connected ? 'bg-success/10 text-success' : 'bg-critical/10 text-critical'
            )}
          >
            {connected ? events.length : isConnecting ? '...' : 'Off'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <button
              onClick={clearEvents}
              className="text-[10px] text-text-muted hover:text-text-primary transition-colors px-1.5 py-0.5 rounded hover:bg-surface-elevated"
            >
              Clear
            </button>
          )}
          <button
            onClick={() => setPaused(!paused)}
            className={clsx(
              'w-7 h-7 rounded flex items-center justify-center transition-colors',
              paused ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated'
            )}
            title={paused ? 'Resume auto-scroll' : 'Pause auto-scroll'}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 px-4 py-2.5 border-b border-border/50 overflow-x-auto scrollbar-hide">
        {FILTERS.map((f) => {
          const count = counts[f.key]
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={clsx(
                'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-all whitespace-nowrap',
                filter === f.key
                  ? f.key === 'all'
                    ? 'bg-accent/15 text-accent border border-accent/20'
                    : f.key === 'critical'
                    ? 'bg-critical/10 text-critical border border-critical/20'
                    : f.key === 'warning'
                    ? 'bg-warning/10 text-warning border border-warning/20'
                    : f.key === 'success'
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-surface-elevated text-text-secondary border border-border'
                  : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated border border-transparent'
              )}
            >
              {f.label}
              {count > 0 && filter !== f.key && (
                <span className="text-[10px] text-text-muted">({count})</span>
              )}
            </button>
          )
        })}
      </div>

      <div
        ref={listRef}
        className="flex-1 overflow-y-auto scrollbar-hide"
      >
        {isOffline || isConnecting ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="flex items-center gap-2.5 mb-3">
              <span className={clsx(
                'w-2 h-2 rounded-full',
                isConnecting ? 'bg-warning animate-pulse' : 'bg-critical'
              )} />
              <span className={clsx(
                'text-xs font-medium',
                isConnecting ? 'text-warning' : 'text-critical'
              )}>
                {isConnecting ? 'Connecting...' : 'Disconnected'}
              </span>
            </div>
            <p className="text-sm text-text-muted">Events will appear once the connection is established</p>
          </div>
        ) : showEmptyState ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Activity className="w-10 h-10 text-border mb-3" />
            <p className="text-sm text-text-secondary font-medium">No events yet</p>
            <p className="text-xs text-text-muted mt-1">Real-time activity will appear here</p>
          </div>
        ) : showNoResults ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <Circle className="w-8 h-8 text-border mb-2" />
            <p className="text-sm text-text-secondary font-medium">No {filter} events</p>
          </div>
        ) : filteredEvents.length === 0 ? null : (
          <div className="divide-y divide-border/50">
            {filteredEvents.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
