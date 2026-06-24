import React, { useEffect, useState, useCallback, useMemo } from 'react'
import clsx from 'clsx'
import {
  Circle, Gauge, ChartLine, Heartbeat, WarningCircle, CheckCircle,
  XCircle, Pulse, Database, Cpu, WifiHigh,
  ArrowUp, ArrowDown, CaretDown, CaretRight,
} from '@phosphor-icons/react'
import { systemAPI } from '@/api/system'
import type { SystemHealthResponse, ServiceHealth } from '@/types/api'

const StatusDot: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    ok: 'bg-success shadow-[0_0_6px_rgba(16,185,129,0.3)]',
    degraded: 'bg-amber shadow-[0_0_6px_rgba(245,158,11,0.3)]',
    down: 'bg-danger shadow-[0_0_6px_rgba(239,68,68,0.3)]',
    unknown: 'bg-silver-muted/30',
  }
  return <span className={clsx('w-2 h-2 rounded-full inline-block shrink-0', colors[status] || 'bg-silver-muted/30')} />
}

const AlertIcon: React.FC<{ severity: string }> = ({ severity }) => {
  if (severity === 'critical') return <WarningCircle className="w-4 h-4 text-danger shrink-0" weight="fill" />
  if (severity === 'warning') return <WarningCircle className="w-4 h-4 text-amber shrink-0" weight="fill" />
  return <Circle className="w-4 h-4 text-silver-muted/50 shrink-0" weight="fill" />
}

const MiniBar: React.FC<{ value: number; max: number; color?: string }> = ({
  value, max, color = 'bg-amber',
}) => (
  <div className="w-full h-1.5 bg-charcoal rounded-full overflow-hidden">
    <div
      className={clsx('h-full rounded-full transition-all duration-500', color)}
      style={{ width: `${Math.min((value / max) * 100, 100)}%` }}
    />
  </div>
)

const MetricTile: React.FC<{
  label: string; value: string | number; format?: string
  icon?: React.ReactNode; trend?: 'up' | 'down' | 'stable'
  color?: string; subtitle?: string
}> = ({ label, value, format, icon, trend, color = 'text-silver', subtitle }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-1.5 text-[10px] text-silver-muted/60 font-medium uppercase tracking-wider">
      {icon && <span className="text-silver-muted/40">{icon}</span>}
      {label}
    </div>
    <div className="flex items-baseline gap-2">
      <span className={clsx('text-xl font-semibold font-mono tracking-tight', color)}>
        {typeof value === 'number' ? (
          format === 'ms' ? `${value.toFixed(1)}ms` :
          format === '%' ? `${value.toFixed(1)}%` :
          format === 's' ? `${value.toFixed(2)}/s` :
          format === 'm' ? `${value.toFixed(1)}/m` :
          value
        ) : value}
      </span>
      {trend === 'up' && <ArrowUp className="w-3 h-3 text-danger" weight="bold" />}
      {trend === 'down' && <ArrowDown className="w-3 h-3 text-success" weight="bold" />}
    </div>
    {subtitle && <span className="text-[10px] text-silver-muted/50">{subtitle}</span>}
  </div>
)

const ServiceCard: React.FC<{ svc: ServiceHealth }> = ({ svc }) => {
  const statusLabel = svc.status === 'ok' ? 'Operational' : svc.status === 'degraded' ? 'Degraded' : svc.status === 'down' ? 'Down' : 'Unknown'
  const statusColor = svc.status === 'ok' ? 'text-success bg-success/20' : svc.status === 'degraded' ? 'text-amber bg-amber/20' : svc.status === 'down' ? 'text-danger bg-danger/20' : 'text-silver-muted bg-charcoal'
  return (
    <div className="bg-graphite rounded-card border border-slate/20 p-4 flex items-start gap-3">
      <StatusDot status={svc.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-silver capitalize">{svc.name.replace('_', ' ')}</span>
          <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded', statusColor)}>{statusLabel}</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-silver-muted/60">
          <span className="font-mono">{svc.latency_ms.toFixed(1)}ms</span>
          <span className="font-mono">{svc.availability.toFixed(1)}% avail</span>
        </div>
      </div>
    </div>
  )
}

export const SystemHealthCenter: React.FC = () => {
  const [data, setData] = useState<SystemHealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [analyticsExpanded, setAnalyticsExpanded] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      const result = await systemAPI.getHealth()
      setData(result)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch system health')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 10000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const alerts = useMemo(() => data?.alerts ?? [], [data])
  const criticalAlerts = useMemo(() => alerts.filter(a => a.severity === 'critical'), [alerts])
  const warningAlerts = useMemo(() => alerts.filter(a => a.severity === 'warning'), [alerts])

  if (loading && !data) {
    return (
      <div className="h-full flex flex-col gap-4 p-page overflow-y-auto bg-charcoal">
        <div className="flex items-center gap-3 mb-2">
          <Gauge className="w-5 h-5 text-amber" weight="fill" />
          <h1 className="text-xl font-semibold text-silver tracking-tight">System Health</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-graphite rounded-card border border-slate/20 p-5 animate-pulse">
              <div className="h-4 w-24 bg-charcoal rounded mb-4" />
              <div className="space-y-2">
                <div className="h-3 bg-charcoal rounded w-full" />
                <div className="h-3 bg-charcoal rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="h-full flex items-center justify-center p-page bg-charcoal">
        <div className="bg-graphite border border-danger/30 rounded-card p-8 max-w-md text-center">
          <XCircle className="w-10 h-10 text-danger mx-auto mb-4" weight="fill" />
          <h3 className="text-base font-semibold text-silver mb-1.5">System Health Unavailable</h3>
          <p className="text-sm text-silver-muted">{error}</p>
          <button onClick={fetchHealth} className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 bg-amber text-charcoal rounded-lg text-sm font-semibold hover:bg-amber/90 transition-all active:scale-95">
            Retry
          </button>
        </div>
      </div>
    )
  }

  const infra = data?.infrastructure.services ?? []
  const req = data?.request_analytics
  const pred = data?.prediction_analytics
  const ws = data?.websocket_analytics
  const redis = data?.redis_analytics
  const db = data?.database_analytics

  return (
    <div className="h-full flex flex-col gap-5 p-page overflow-y-auto bg-charcoal">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Gauge className="w-5 h-5 text-amber" weight="fill" />
          <h1 className="text-xl font-semibold text-silver tracking-tight">System Health</h1>
          {data && (
            <span className="text-xs text-silver-muted/60 font-mono">
              updated {new Date(data.generated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
        <span className="text-xs text-silver-muted/50 font-mono">
          Uptime {formatUptime(data ? data.uptime_seconds : 0)}
        </span>
      </div>

      {/* 1. ALERTS — front and center */}
      <div className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate/20">
          <WarningCircle className={clsx(
            'w-4 h-4', criticalAlerts.length > 0 ? 'text-danger' : warningAlerts.length > 0 ? 'text-amber' : 'text-success'
          )} weight="fill" />
          <h2 className="text-lg font-display text-silver">Alerts</h2>
          <span className={clsx(
            'ml-auto text-xs font-semibold px-2 py-0.5 rounded',
            criticalAlerts.length > 0 ? 'bg-danger/20 text-danger' :
            warningAlerts.length > 0 ? 'bg-amber/20 text-amber' :
            'bg-success/20 text-success'
          )}>
            {criticalAlerts.length > 0 ? `${criticalAlerts.length} critical` :
             warningAlerts.length > 0 ? `${warningAlerts.length} warning` : 'All clear'}
          </span>
        </div>
        <div className="p-4">
          {alerts.length === 0 ? (
            <div className="flex items-center gap-2.5 py-2">
              <CheckCircle className="w-5 h-5 text-success" weight="fill" />
              <span className="text-sm text-silver-muted font-medium">All systems operational — no active alerts</span>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert, i) => (
                <div key={i} className={clsx(
                  'flex items-start gap-3 px-4 py-3.5 rounded-lg border text-sm',
                  alert.severity === 'critical' ? 'bg-danger/10 border-danger/30' :
                  alert.severity === 'warning' ? 'bg-amber/10 border-amber/30' :
                  'bg-charcoal border-slate/20'
                )}>
                  <AlertIcon severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <div className={clsx(
                      'text-sm font-medium',
                      alert.severity === 'critical' ? 'text-danger' :
                      alert.severity === 'warning' ? 'text-amber' : 'text-silver'
                    )}>{alert.message}</div>
                    <div className="text-xs text-silver-muted/60 mt-0.5 font-mono">
                      {new Date(alert.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  <span className={clsx(
                    'text-[10px] font-medium px-2 py-0.5 rounded',
                    alert.severity === 'critical' ? 'bg-danger/20 text-danger' :
                    alert.severity === 'warning' ? 'bg-amber/20 text-amber' :
                    'bg-silver-muted/10 text-silver-muted'
                  )}>{alert.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. INFRASTRUCTURE SERVICES */}
      <div className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate/20">
          <Heartbeat className="w-4 h-4 text-amber" weight="fill" />
          <h2 className="text-lg font-display text-silver">Infrastructure</h2>
          <span className="ml-auto text-xs font-mono text-silver-muted/50">{infra.length} services</span>
        </div>
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {infra.map(svc => (
              <ServiceCard key={svc.name} svc={svc} />
            ))}
          </div>
        </div>
      </div>

      {/* 3. ANALYTICS — collapsed by default */}
      <div className="bg-graphite rounded-card border border-slate/20 overflow-hidden">
        <button
          onClick={() => setAnalyticsExpanded(!analyticsExpanded)}
          className="flex items-center gap-2 px-5 py-4 border-b border-slate/20 w-full text-left hover:bg-charcoal/50 transition-colors"
        >
          <ChartLine className="w-4 h-4 text-silver-muted" weight="fill" />
          <h2 className="text-lg font-display text-silver">Analytics</h2>
          <span className="text-silver-muted ml-auto">
            {analyticsExpanded ? <CaretDown size={14} /> : <CaretRight size={14} />}
          </span>
        </button>
        {analyticsExpanded && (
          <div className="p-4 animate-fade-in">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Request Analytics */}
              <div className="bg-charcoal rounded-card border border-slate/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Pulse className="w-3.5 h-3.5 text-silver-muted" />
                  <span className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider">Request Analytics</span>
                </div>
                {req && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Requests" value={req.requests_per_minute} format="m" />
                      <MetricTile label="Error Rate" value={req.error_rate} format="%" color={req.error_rate > 5 ? 'text-danger' : 'text-success'} />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MetricTile label="P50" value={req.latency_p50_ms} format="ms" />
                      <MetricTile label="P95" value={req.latency_p95_ms} format="ms" />
                      <MetricTile label="P99" value={req.latency_p99_ms} format="ms" />
                    </div>
                    <MiniBar value={req.error_rate} max={10} color={req.error_rate > 5 ? 'bg-danger' : 'bg-success'} />
                    <div className="text-[10px] text-silver-muted/40">{req.total_requests.toLocaleString()} total · {req.total_errors} errors</div>
                  </div>
                )}
              </div>

              {/* Prediction Analytics */}
              <div className="bg-charcoal rounded-card border border-slate/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ChartLine className="w-3.5 h-3.5 text-silver-muted" />
                  <span className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider">Prediction Analytics</span>
                </div>
                {pred && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Throughput" value={pred.predictions_per_second} format="s" />
                      <div>
                        <span className="text-[10px] text-silver-muted uppercase tracking-wider font-medium block mb-1">Model</span>
                        <span className={clsx(
                          'text-xs font-medium px-2 py-0.5 rounded',
                          pred.model_status === 'healthy' ? 'bg-success/20 text-success' :
                          pred.model_status === 'degraded' ? 'bg-amber/20 text-amber' : 'bg-danger/20 text-danger'
                        )}>{pred.model_status}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <MetricTile label="P50" value={pred.latency_p50_ms} format="ms" />
                      <MetricTile label="P95" value={pred.latency_p95_ms} format="ms" />
                      <MetricTile label="P99" value={pred.latency_p99_ms} format="ms" />
                    </div>
                    <div>
                      <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-1">
                        <div className="bg-success h-full" style={{ width: `${(pred.confidence_distribution.high ?? 0) * 100}%` }} />
                        <div className="bg-amber h-full" style={{ width: `${(pred.confidence_distribution.medium ?? 0) * 100}%` }} />
                        <div className="bg-danger h-full" style={{ width: `${(pred.confidence_distribution.low ?? 0) * 100}%` }} />
                      </div>
                      <div className="flex gap-3 text-[10px] text-silver-muted">
                        <span>High {(pred.confidence_distribution.high * 100).toFixed(0)}%</span>
                        <span>Med {(pred.confidence_distribution.medium * 100).toFixed(0)}%</span>
                        <span>Low {(pred.confidence_distribution.low * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-silver-muted/40">{pred.total_predictions.toLocaleString()} total predictions</div>
                  </div>
                )}
              </div>

              {/* WebSocket Analytics */}
              <div className="bg-charcoal rounded-card border border-slate/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <WifiHigh className="w-3.5 h-3.5 text-silver-muted" />
                  <span className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider">WebSocket</span>
                </div>
                {ws && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Active" value={ws.active_connections} subtitle="connections" />
                      <MetricTile label="Msg Rate" value={ws.messages_per_second} format="s" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Failures" value={ws.connection_failures_total} color={ws.connection_failures_total > 0 ? 'text-amber' : 'text-silver'} />
                      <MetricTile label="Reconnect" value={ws.reconnect_rate * 100} format="%" color={ws.reconnect_rate > 0.1 ? 'text-amber' : 'text-silver'} />
                    </div>
                    <MiniBar value={ws.active_connections} max={Math.max(ws.active_connections, 10)} color="bg-amber" />
                    <div className="text-[10px] text-silver-muted/40">{ws.total_connections.toLocaleString()} total · {ws.total_messages.toLocaleString()} messages</div>
                  </div>
                )}
              </div>

              {/* Redis Analytics */}
              <div className="bg-charcoal rounded-card border border-slate/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Database className="w-3.5 h-3.5 text-silver-muted" />
                  <span className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider">Redis</span>
                </div>
                {redis && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Operations" value={redis.operations_per_second} format="s" />
                      <MetricTile label="Stream Lag" value={redis.stream_lag} color={redis.stream_lag > 0 ? 'text-amber' : 'text-silver'} />
                    </div>
                    <div>
                      <div className="flex gap-1 h-2 rounded-full overflow-hidden mb-1.5">
                        <div className="bg-success h-full" style={{ width: `${redis.hit_rate * 100}%` }} />
                        <div className="bg-danger h-full" style={{ width: `${redis.miss_rate * 100}%` }} />
                      </div>
                      <div className="flex gap-3 text-[10px] text-silver-muted">
                        <span>Hit {(redis.hit_rate * 100).toFixed(1)}%</span>
                        <span>Miss {(redis.miss_rate * 100).toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-silver-muted/40">{redis.total_operations.toLocaleString()} total ops</div>
                  </div>
                )}
              </div>

              {/* Database Analytics */}
              <div className="bg-charcoal rounded-card border border-slate/20 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-3.5 h-3.5 text-silver-muted" />
                  <span className="text-[10px] font-semibold text-silver-muted uppercase tracking-wider">Database</span>
                </div>
                {db && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile label="Queries" value={db.queries_per_second} format="s" />
                      <MetricTile label="Slow Queries" value={db.slow_queries} color={db.slow_queries > 0 ? 'text-amber' : 'text-silver'} />
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-xl font-semibold font-mono text-silver">{db.connection_pool.active}</span>
                        <span className="text-xs text-silver-muted">/ {db.connection_pool.max}</span>
                        <span className={clsx(
                          'ml-auto text-[10px] font-medium px-2 py-0.5 rounded',
                          db.pool_utilization > 0.8 ? 'bg-danger/20 text-danger' :
                          db.pool_utilization > 0.6 ? 'bg-amber/20 text-amber' :
                          'bg-success/20 text-success'
                        )}>
                          {(db.pool_utilization * 100).toFixed(0)}% used
                        </span>
                      </div>
                      <MiniBar value={db.pool_utilization} max={1} color={db.pool_utilization > 0.8 ? 'bg-danger' : 'bg-amber'} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const parts: string[] = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  parts.push(`${s}s`)
  return parts.join(' ')
}

export default SystemHealthCenter
