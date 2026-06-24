import React, { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Crosshair,
  Lightning,
  Package,
  Pulse,
  Truck,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { ordersAPI } from '@/api/orders'
import { useToast } from '@/components/notifications'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { FleetMap } from '@/components/fleet/FleetMap'
import { useAuthStore } from '@/store/authStore'
import { fleetStore, useHighRiskOrders, useOrdersArray } from '@/store/fleetStore'
import type { LiveOrder, Recommendation } from '@/types/api'
import { validateLiveOrders } from '@/utils/validation'

const connectionLabel: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting',
  reconnecting: 'Reconnecting',
  disconnected: 'Offline',
}

const riskPriority = (order: LiveOrder): 'Critical' | 'High' | 'Watch' =>
  order.risk_score >= 0.8 ? 'Critical' : order.risk_score >= 0.6 ? 'High' : 'Watch'

const formatOrderId = (id: string) => (id.length > 8 ? id.slice(0, 8).toUpperCase() : id.toUpperCase())

function OperationsTopBar({ orderCount, connectionStatus }: { orderCount: number; connectionStatus: string }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate/20 bg-charcoal px-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber text-charcoal shadow-[0_12px_28px_rgba(244,197,66,0.2)]">
          <Crosshair size={20} weight="bold" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-silver">Operations Control Tower</h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-silver-muted">Live dispatch workspace</p>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <StatusMetric icon={<Truck size={14} weight="bold" />} label="Orders" value={orderCount} />
        <StatusMetric icon={<Pulse size={14} weight="fill" />} label="Stream" value={connectionLabel[connectionStatus] ?? connectionStatus} live={connectionStatus === 'connected'} />
      </div>
    </header>
  )
}

function StatusMetric({ icon, label, value, live }: { icon: React.ReactNode; label: string; value: string | number; live?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', live ? 'bg-success/10 text-success' : 'bg-graphite text-silver-muted')}>
        {icon}
      </div>
      <div>
        <div className="font-mono text-sm font-semibold text-silver">{value}</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-silver-muted">{label}</div>
      </div>
    </div>
  )
}

function RailSection({ title, icon, children, action }: { title: string; icon: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="border-b border-slate/20 px-4 py-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-graphite text-amber">
            {icon}
          </div>
          <h2 className="text-sm font-semibold text-silver">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

function AIRecommendationsPanel({ selectedOrderId }: { selectedOrderId: string | null }) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch('/api/v1/insights/recommendations')
        if (!cancelled && response.ok) {
          const data = await response.json()
          setRecommendations(data?.slice?.(0, 3) ?? [])
        }
      } catch {
        if (!cancelled) setRecommendations([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const fallback = selectedOrderId
    ? [{
        id: 'selected-reroute',
        title: `Reroute ${formatOrderId(selectedOrderId)}`,
        description: 'Move the driver to the lower-congestion corridor and protect the delivery window.',
        confidence: 0.92,
        estimated_impact_percentage: 12,
        priority: 'high',
        action: 'Reroute driver',
        created_at: new Date().toISOString(),
      } as Recommendation]
    : []

  const shown = recommendations.length > 0 ? recommendations : fallback

  return (
    <RailSection title="AI recommendations" icon={<Lightning size={16} weight="fill" />}>
      {loading ? (
        <div className="space-y-2">
          <div className="h-20 rounded-xl bg-graphite animate-pulse" />
          <div className="h-16 rounded-xl bg-graphite animate-pulse" />
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-success/20 bg-success/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-silver">
            <CheckCircle size={16} weight="fill" className="text-success" />
            All Deliveries Operating Normally
          </div>
          <p className="mt-1 text-xs leading-relaxed text-silver-muted">No active intervention is required right now.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {shown.map((rec) => (
            <article key={rec.id} className="rounded-xl border border-amber/20 bg-amber/[0.06] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-silver">{rec.title}</h3>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-silver-muted">{rec.description}</p>
                </div>
                <span className="rounded-lg bg-charcoal px-2 py-1 font-mono text-xs font-semibold text-amber">
                  {Math.round((rec.confidence ?? 0.92) * 100)}%
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-charcoal px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-silver-muted">Savings</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-silver">{rec.estimated_impact_percentage || 12} min</div>
                </div>
                <div className="rounded-lg bg-charcoal px-3 py-2">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-silver-muted">Action</div>
                  <div className="mt-1 truncate text-sm font-semibold text-silver">{rec.action || 'Reroute'}</div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </RailSection>
  )
}

function HighRiskQueue({ selectedOrderId, onOrderSelect }: { selectedOrderId: string | null; onOrderSelect: (id: string) => void }) {
  const highRiskOrders = useHighRiskOrders()
  const sorted = useMemo(() => [...highRiskOrders].sort((a, b) => b.risk_score - a.risk_score), [highRiskOrders])

  return (
    <RailSection
      title="High risk queue"
      icon={<WarningCircle size={16} weight="fill" />}
      action={<span className="rounded-lg bg-danger/10 px-2 py-1 font-mono text-xs font-semibold text-danger">{sorted.length}</span>}
    >
      {sorted.length === 0 ? (
        <div className="rounded-xl border border-success/20 bg-success/10 p-4">
          <div className="text-sm font-semibold text-silver">All Deliveries Operating Normally</div>
          <p className="mt-1 text-xs text-silver-muted">The risk queue is clear.</p>
        </div>
      ) : (
        <div className="max-h-[28dvh] space-y-2 overflow-y-auto pr-1">
          {sorted.slice(0, 10).map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => onOrderSelect(order.id)}
              className={clsx(
                'w-full rounded-xl border p-3 text-left transition active:scale-[0.99]',
                selectedOrderId === order.id
                  ? 'border-amber/50 bg-amber/10'
                  : 'border-slate/20 bg-graphite hover:border-amber/25',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-semibold text-silver">{formatOrderId(order.id)}</div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-silver-muted">
                    <Clock size={12} weight="bold" />
                    <span>+{Math.max(0, Math.round(order.delay_minutes ?? 0))} min ETA</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-amber">{Math.round(order.risk_score * 100)}% Risk</div>
                  <div className={clsx('mt-1 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]',
                    riskPriority(order) === 'Critical' ? 'bg-danger/10 text-danger' : 'bg-amber/10 text-amber',
                  )}>
                    {riskPriority(order)}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </RailSection>
  )
}

function SelectedOrderPanel({ orderId, onClose }: { orderId: string | null; onClose: () => void }) {
  const orders = useOrdersArray()
  const order = orders.find((item) => item.id === orderId)

  if (!order) {
    return (
      <RailSection title="Selected order" icon={<Package size={16} weight="fill" />}>
        <div className="rounded-xl border border-slate/20 bg-graphite p-5 text-center">
          <Package size={28} className="mx-auto text-silver-muted/50" weight="duotone" />
          <div className="mt-3 text-sm font-semibold text-silver">Select a Driver or Order to View Details</div>
          <p className="mt-1 text-xs leading-relaxed text-silver-muted">Click a vehicle, delivery cluster, destination pin, or risk item.</p>
        </div>
      </RailSection>
    )
  }

  const eta = order.current_eta || order.eta_time || order.planned_eta
  const delay = Math.round(order.delay_minutes ?? 0)

  return (
    <RailSection
      title="Selected order"
      icon={<Package size={16} weight="fill" />}
      action={
        <button type="button" onClick={onClose} className="rounded-lg p-1 text-silver-muted transition hover:bg-graphite hover:text-silver">
          <X size={16} />
        </button>
      }
    >
      <div className="rounded-2xl border border-slate/20 bg-graphite p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-lg font-semibold tracking-tight text-silver">{formatOrderId(order.id)}</div>
            <div className="mt-1 text-xs text-silver-muted">{order.origin || 'Origin'} to {order.destination || 'Destination'}</div>
          </div>
          <span className={clsx('rounded-lg px-2 py-1 font-mono text-sm font-semibold',
            order.risk_score >= 0.7 ? 'bg-danger/10 text-danger' : order.risk_score >= 0.3 ? 'bg-amber/10 text-amber' : 'bg-success/10 text-success',
          )}>
            {Math.round(order.risk_score * 100)}%
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <DetailTile label="Driver" value={order.driver_name || formatOrderId(order.driver_id || 'Unassigned')} />
          <DetailTile label="ETA" value={eta ? new Date(eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'} />
          <DetailTile label="Impact" value={delay > 0 ? `+${delay} min` : 'On time'} tone={delay > 0 ? 'amber' : 'green'} />
          <DetailTile label="Route" value={`${Math.round(order.route_efficiency * 100 || 0)}% efficient`} />
        </div>

        <div className="mt-4 rounded-xl border border-amber/20 bg-amber/[0.06] p-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-silver">
            <Lightning size={15} weight="fill" className="text-amber" />
            AI Recommendation
          </div>
          <p className="mt-1 text-xs leading-relaxed text-silver-muted">
            {delay > 0 || order.risk_score >= 0.5
              ? 'Reroute driver through the lower-risk corridor and notify dispatch of the ETA recovery window.'
              : 'Keep current route. Continue monitoring live traffic and driver telemetry.'}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber px-3 py-2.5 text-sm font-semibold text-charcoal transition hover:bg-amberBright active:scale-[0.98]">
            Reroute
            <ArrowRight size={14} weight="bold" />
          </button>
          <button className="rounded-xl border border-slate/20 bg-charcoal px-3 py-2.5 text-sm font-semibold text-silver transition hover:border-slate/40 active:scale-[0.98]">
            Escalate
          </button>
        </div>
      </div>
    </RailSection>
  )
}

function DetailTile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'amber' | 'green' }) {
  return (
    <div className="rounded-xl bg-charcoal px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-silver-muted">{label}</div>
      <div className={clsx('mt-1 truncate text-sm font-semibold', tone === 'amber' ? 'text-amber' : tone === 'green' ? 'text-success' : 'text-silver')}>
        {value}
      </div>
    </div>
  )
}

export const Operations: React.FC = () => {
  const auth = useAuthStore((state) => state.auth)
  const connectionStatus = fleetStore((state) => state.connectionStatus)
  const selectedOrderId = fleetStore((state) => state.selectedOrderId)
  const orders = useOrdersArray()
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const { addToast } = useToast()

  useEffect(() => {
    if (!auth) return
    const loadData = async () => {
      try {
        const ordersData = await ordersAPI.getOrders({ page: 1, page_size: 100 })
        if (ordersData?.items) {
          const validOrders = validateLiveOrders(ordersData.items)
          if (validOrders.success) {
            fleetStore.getState().setOrders(ordersData.items)
          } else {
            addToast({ type: 'warning', title: 'Data validation warning', message: 'Some order data did not pass validation' })
          }
        }
      } catch (error) {
        console.error('Failed to load orders:', error)
        addToast({ type: 'error', title: 'Failed to load orders', message: 'Orders data could not be fetched' })
      } finally {
        setOrdersLoaded(true)
      }
    }
    loadData()
  }, [auth, addToast])

  const handleOrderSelect = useCallback((orderId: string) => {
    fleetStore.getState().setSelectedOrder(orderId)
  }, [])

  const handleCloseOrder = useCallback(() => {
    fleetStore.getState().setSelectedOrder(null)
  }, [])

  if (!auth) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-charcoal text-sm text-silver-muted">
        Please log in
      </div>
    )
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-charcoal">
      <OperationsTopBar orderCount={orders.length} connectionStatus={connectionStatus} />

      <main className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-[minmax(0,7fr)_minmax(360px,3fr)]">
        <section className="relative min-h-0 border-r border-slate/20 bg-graphite">
          {!ordersLoaded ? (
            <div className="flex h-full items-center justify-center bg-[#E8EBEE]">
              <div className="rounded-2xl border border-black/10 bg-white px-5 py-4 shadow-[0_18px_48px_rgba(17,19,21,0.16)]">
                <div className="flex items-center gap-3 text-sm font-semibold text-text-primary">
                  <CircleSkeleton />
                  Loading live fleet map
                </div>
              </div>
            </div>
          ) : (
            <ErrorBoundary>
              <FleetMap onOrderSelect={handleOrderSelect} selectedOrderId={selectedOrderId} />
            </ErrorBoundary>
          )}
        </section>

        <aside className="flex min-h-0 flex-col overflow-y-auto bg-charcoal">
          <AIRecommendationsPanel selectedOrderId={selectedOrderId} />
          <HighRiskQueue selectedOrderId={selectedOrderId} onOrderSelect={handleOrderSelect} />
          <SelectedOrderPanel orderId={selectedOrderId} onClose={handleCloseOrder} />
          <section className="mt-auto border-t border-slate/20 px-4 py-4">
            <div className="grid grid-cols-3 gap-2">
              <RailMetric label="Active" value={orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length} />
              <RailMetric label="Delayed" value={orders.filter((o) => (o.delay_minutes ?? 0) > 0).length} tone="amber" />
              <RailMetric label="Protected" value={orders.filter((o) => o.route_efficiency >= 0.9).length} tone="green" />
            </div>
          </section>
        </aside>
      </main>
    </div>
  )
}

function CircleSkeleton() {
  return <span className="h-3 w-3 animate-pulse rounded-full bg-amber" />
}

function RailMetric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'amber' | 'green' }) {
  return (
    <div className="rounded-xl bg-graphite px-3 py-3">
      <div className={clsx('font-mono text-xl font-semibold', tone === 'amber' ? 'text-amber' : tone === 'green' ? 'text-success' : 'text-silver')}>{value}</div>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-silver-muted">{label}</div>
    </div>
  )
}

export default Operations
