import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  WifiHigh, WifiSlash, MapPin, Bell, Gauge, Compass, ChartBar,
  Truck, Warning, ArrowUp, CaretUp, CaretDown,
} from '@phosphor-icons/react'
import { useAuthStore } from '@/store/authStore'
import { fleetStore, useOrdersArray } from '@/store/fleetStore'
import { wsManager } from '@/api/websocket'
import { ordersAPI } from '@/api/orders'
import { predictionsAPI } from '@/api/predictions'
import { FleetMap } from '@/components/fleet/FleetMap'
import { VehicleDetailsPanel } from '@/components/fleet/VehicleDetailsPanel'
import { FleetHealthBar } from '@/components/fleet/FleetHealthBar'
import { OrderTable } from '@/components/orders/OrderTable'
import { DecisionLog } from '@/components/agent/DecisionLog'
import { OperationsInsights } from '@/components/insights/OperationsInsights'
import { FleetHealthCard } from '@/components/insights/FleetHealthCard'
import { Skeleton, CardSkeleton, TableSkeleton } from '@/components/shared/Skeleton'
import { OperationsCopilot } from '@/components/copilot'
import { DashboardIntelligence } from '@/components/intelligence'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { OperationalMetrics, Recommendation, FleetHealth } from '@/types/api'
import { validateLiveOrders, validateOperationalMetrics, validateFleetHealth } from '@/utils/validation'
import clsx from 'clsx'

type OperationsMode = 'operations' | 'executive'

const statusIcon: Record<string, React.ReactNode> = {
  connected: <WifiHigh size={14} weight="fill" className="text-success-DEFAULT" />,
  connecting: <WifiSlash size={14} className="text-warning-DEFAULT" />,
  reconnecting: <WifiSlash size={14} className="text-warning-DEFAULT" />,
  disconnected: <WifiSlash size={14} className="text-critical-DEFAULT" />,
}

const connectionLabel: Record<string, string> = {
  connected: 'Live',
  connecting: 'Connecting...',
  reconnecting: 'Reconnecting...',
  disconnected: 'Offline',
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as any } },
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string | number
  trend?: { direction: 'up' | 'down'; value: number }
  accent?: string
}

const KpiCard = React.memo<KpiCardProps>(({ icon, label, value, trend, accent }) => (
  <motion.div
    variants={itemVariants}
    className="rounded-xl p-4 bg-abyss border border-steel-grey/40 transition-all duration-200 hover:border-accent/30 hover:shadow-lg hover:shadow-accent/5"
  >
    <div className="flex items-center justify-between mb-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-accent/10">
        {icon}
      </div>
      {trend && (
        <div className={clsx(
          'flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded',
          trend.direction === 'up'
            ? 'text-success-DEFAULT bg-success-DEFAULT/10'
            : 'text-critical-DEFAULT bg-critical-DEFAULT/10'
        )}>
          {trend.direction === 'up' ? <CaretUp size={10} weight="fill" /> : <CaretDown size={10} weight="fill" />}
          {trend.value}%
        </div>
      )}
    </div>
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-mist uppercase tracking-wider">{label}</span>
      <div className="flex items-baseline gap-1.5">
        <span className={clsx(
          'text-2xl font-bold tracking-tight',
          accent || 'text-pearl'
        )}>
          {value}
        </span>
      </div>
    </div>
  </motion.div>
))

export const Dashboard: React.FC = () => {
  const auth = useAuthStore((state) => state.auth)
  const connectionStatus = fleetStore((state) => state.connectionStatus)
  const selectedOrderId = fleetStore((state) => state.selectedOrderId)
  const orders = useOrdersArray()

  const [mode, setMode] = useState<OperationsMode>('operations')
  const [showIntelligence, setShowIntelligence] = useState(false)
  const [metrics, setMetrics] = useState<OperationalMetrics | null>(null)
  const [health, setHealth] = useState<FleetHealth | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [ordersLoaded, setOrdersLoaded] = useState(false)
  const [metricsLoaded, setMetricsLoaded] = useState(false)
  const [healthLoaded, setHealthLoaded] = useState(false)
  const [recsLoaded, setRecsLoaded] = useState(false)

  useEffect(() => {
    if (!auth) return
    const loadData = async () => {
      try {
        const [ordersData, metricsData, healthData, recsData] = await Promise.all([
          ordersAPI.getOrders({ page: 1, page_size: 100 }),
          predictionsAPI.getOperationalMetrics(),
          predictionsAPI.getFleetHealth(),
          predictionsAPI.getRecommendations(),
        ])
        if (ordersData?.items) {
          const validOrders = validateLiveOrders(ordersData.items)
          if (validOrders.success) {
            fleetStore.getState().setOrders(ordersData.items)
          }
        }
        setOrdersLoaded(true)
        const validMetrics = validateOperationalMetrics(metricsData)
        if (validMetrics.success) setMetrics(metricsData)
        setMetricsLoaded(true)
        const validHealth = validateFleetHealth(healthData)
        if (validHealth.success) setHealth(healthData)
        setHealthLoaded(true)
        setRecommendations(recsData)
        setRecsLoaded(true)
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
        setOrdersLoaded(true)
        setMetricsLoaded(true)
        setHealthLoaded(true)
        setRecsLoaded(true)
      }
    }
    loadData()
    wsManager.connect(auth.tenant.tenant_id, auth.token)
    return () => { wsManager.disconnect() }
  }, [auth])

  const highRiskCount = useMemo(() => orders.filter((o) => o.is_high_risk).length, [orders])
  const activeCount = useMemo(() => orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length, [orders])
  const deliveredToday = useMemo(() => orders.filter((o) => o.status === 'completed').length, [orders])
  const avgDelay = useMemo(() => {
    if (orders.length === 0) return 0
    return orders.reduce((s, o) => s + (o.delay_minutes || 0), 0) / orders.length
  }, [orders])

  const handleOrderSelect = useCallback((orderId: string) => {
    fleetStore.getState().setSelectedOrder(orderId)
  }, [])

  if (!auth) {
    return <div className="flex items-center justify-center h-screen bg-obsidian text-mist text-sm">Please log in</div>
  }

  const canShowSidePanel = healthLoaded && metricsLoaded

  const statusDotClass = clsx(
    'w-1.5 h-1.5 rounded-full',
    connectionStatus === 'connected' && 'bg-success-DEFAULT',
    connectionStatus === 'reconnecting' && 'bg-warning-DEFAULT',
    connectionStatus === 'connecting' && 'bg-warning-DEFAULT',
    connectionStatus === 'disconnected' && 'bg-critical-DEFAULT',
  )

  return (
    <div className="h-screen flex flex-col bg-obsidian">
      <header className="border-b border-steel-grey/30 px-4 lg:px-6 py-3 flex items-center justify-between shrink-0 bg-abyss">
        <div className="flex items-center gap-4 lg:gap-5 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-accent/10 shrink-0">
              <Compass size={18} weight="fill" className="text-accent-DEFAULT" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold tracking-tight text-pearl truncate">
                IntelliLog-AI
              </h1>
              <p className="text-[10px] font-medium tracking-wider uppercase text-mist">
                {mode === 'executive' ? 'Executive Command' : 'Operations Center'}
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-md bg-obsidian border border-steel-grey/40"
          >
            {statusIcon[connectionStatus]}
            <span className="text-[11px] font-medium text-cloud">{connectionLabel[connectionStatus]}</span>
            <span className={clsx(statusDotClass, connectionStatus === 'connected' && 'animate-pulse')} />
          </motion.div>
        </div>

        <div className="flex items-center gap-2 lg:gap-4">
          <button
            onClick={() => setShowIntelligence(!showIntelligence)}
            className={clsx(
              'flex items-center gap-1.5 px-2.5 lg:px-3 py-1.5 rounded-md text-[11px] font-medium transition-all duration-150 active:scale-[0.98]',
              showIntelligence
                ? 'text-accent bg-accent/10 border border-accent/20'
                : 'text-mist hover:text-pearl bg-obsidian border border-steel-grey/40'
            )}
            aria-label="Toggle intelligence view"
          >
            <ChartBar size={13} weight={showIntelligence ? 'fill' : 'regular'} />
            <span className="hidden sm:inline">{showIntelligence ? 'Intelligence' : 'Intelligence'}</span>
          </button>

          <div className="flex rounded-md p-0.5 bg-obsidian border border-steel-grey/40">
            <button
              onClick={() => setMode('operations')}
              className={clsx(
                'px-2.5 lg:px-3 py-1.5 rounded text-[11px] font-medium transition-all duration-150 active:scale-[0.98]',
                mode === 'operations' ? 'bg-accent/10 text-accent' : 'text-mist hover:text-pearl'
              )}
            >
              <span className="hidden sm:inline">Operations</span>
              <span className="sm:hidden"><Gauge size={13} weight={mode === 'operations' ? 'fill' : 'regular'} /></span>
            </button>
            <button
              onClick={() => setMode('executive')}
              className={clsx(
                'px-2.5 lg:px-3 py-1.5 rounded text-[11px] font-medium transition-all duration-150 active:scale-[0.98]',
                mode === 'executive' ? 'bg-accent/10 text-accent' : 'text-mist hover:text-pearl'
              )}
            >
              <span className="hidden sm:inline">Executive</span>
              <span className="sm:hidden"><ChartBar size={13} weight={mode === 'executive' ? 'fill' : 'regular'} /></span>
            </button>
          </div>

          <div className="h-5 w-px bg-steel-grey/40 hidden sm:block" />

          <div className="hidden sm:flex items-center gap-2 px-2.5 py-1 rounded-md text-[11px] font-medium bg-teal-DEFAULT/10 border border-teal-DEFAULT/20 text-teal-DEFAULT">
            <div className="w-1.5 h-1.5 rounded-full bg-success-DEFAULT" />
            {auth.tenant.name}
          </div>
        </div>
      </header>

      <div className="px-4 lg:px-6 py-2 bg-abyss border-b border-steel-grey/20">
        <FleetHealthBar />
      </div>

      <main className="flex-1 overflow-hidden">
        {showIntelligence ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="h-full overflow-y-auto p-4 lg:p-6"
          >
            <DashboardIntelligence />
          </motion.div>
        ) : (
          <div className="h-full flex flex-col lg:grid lg:grid-cols-12 lg:gap-5 p-3 lg:p-5 overflow-y-auto lg:overflow-hidden">
            <div className="lg:col-span-8 flex flex-col gap-3 lg:gap-4">
              <motion.div
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-6 gap-3"
              >
                {!ordersLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<Truck size={16} weight="fill" className="text-accent-DEFAULT" />}
                    label="Active Orders"
                    value={activeCount}
                    trend={{ direction: 'up', value: 8 }}
                  />
                )}
                {!ordersLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<MapPin size={16} weight="fill" className="text-teal-DEFAULT" />}
                    label="Delivered Today"
                    value={deliveredToday}
                    trend={{ direction: 'up', value: 12 }}
                  />
                )}
                {!ordersLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<Warning size={16} weight="fill" className="text-warning-DEFAULT" />}
                    label="Delay Risk"
                    value={`${avgDelay.toFixed(0)}m`}
                    trend={{ direction: 'down', value: 5 }}
                  />
                )}
                {!ordersLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<Bell size={16} weight="fill" className="text-critical-DEFAULT" />}
                    label="High Risk"
                    value={highRiskCount}
                    trend={highRiskCount > 3 ? { direction: 'up', value: 15 } : { direction: 'down', value: 8 }}
                    accent={highRiskCount > 3 ? 'text-critical-DEFAULT' : undefined}
                  />
                )}
                {!healthLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<Gauge size={16} weight="fill" className="text-success-DEFAULT" />}
                    label="Fleet Health"
                    value={health ? `${health.score.toFixed(0)}%` : '—'}
                    trend={health && health.trend > 0 ? { direction: 'up', value: Math.abs(health.trend) } : { direction: 'down', value: Math.abs(health?.trend || 0) }}
                  />
                )}
                {!metricsLoaded ? <CardSkeleton /> : (
                  <KpiCard
                    icon={<ChartBar size={16} weight="fill" className="text-info-DEFAULT" />}
                    label="On-Time Rate"
                    value={metrics ? `${metrics.on_time_percentage.toFixed(0)}%` : '—'}
                    trend={metrics && metrics.on_time_percentage > 85 ? { direction: 'up', value: 4 } : { direction: 'down', value: 3 }}
                  />
                )}
              </motion.div>

              <motion.div
                variants={itemVariants}
                className="flex-1 min-h-[300px] lg:min-h-0 rounded-xl overflow-hidden border border-steel-grey/40 relative"
              >
                {!ordersLoaded ? (
                  <div className="w-full h-full bg-abyss flex items-center justify-center">
                    <Skeleton variant="rectangular" className="w-full h-full" />
                  </div>
                ) : (
                  <ErrorBoundary>
                    <FleetMap
                      onOrderSelect={handleOrderSelect}
                      selectedOrderId={selectedOrderId}
                    />
                  </ErrorBoundary>
                )}
                {selectedOrderId && (
                  <div className="absolute top-3 right-3 z-[1000] w-72">
                    <VehicleDetailsPanel
                      orderId={selectedOrderId}
                      onClose={() => fleetStore.getState().setSelectedOrder(null)}
                    />
                  </div>
                )}
              </motion.div>

              <motion.div variants={itemVariants} className="h-64 lg:h-72 shrink-0 rounded-xl overflow-hidden border border-steel-grey/40">
                {!ordersLoaded ? <TableSkeleton rows={4} /> : <ErrorBoundary><OrderTable onOrderSelect={handleOrderSelect} /></ErrorBoundary>}
              </motion.div>
            </div>

            <div className="lg:col-span-4 mt-3 lg:mt-0 overflow-y-auto space-y-3 lg:space-y-4 lg:pr-1">
              {mode === 'operations' && (
                <>
                  {!canShowSidePanel ? (
                    <>
                      <motion.div variants={itemVariants}>
                        <div className="bg-abyss rounded border border-steel-grey/40 p-6 space-y-4">
                          <Skeleton variant="text" width={80} height={14} />
                          <Skeleton variant="text" width={120} height={32} />
                          <div className="space-y-3 pt-4">
                            {[1,2,3,4].map(i => <Skeleton key={i} variant="text" height={20} />)}
                          </div>
                        </div>
                      </motion.div>
                      <motion.div variants={itemVariants}>
                        <div className="bg-abyss rounded border border-steel-grey/40 p-6 space-y-4">
                          <Skeleton variant="text" width={100} height={14} />
                          {[1,2,3,4].map(i => <Skeleton key={i} variant="text" height={20} />)}
                        </div>
                      </motion.div>
                    </>
                  ) : (
                    <>
                      {health && (
                        <motion.div variants={itemVariants}>
                          <ErrorBoundary>
                            <FleetHealthCard health={health} />
                          </ErrorBoundary>
                        </motion.div>
                      )}
                      <motion.div variants={itemVariants}>
                        <ErrorBoundary>
                          <OperationsInsights
                            metrics={metrics!}
                            recommendations={recommendations}
                          />
                        </ErrorBoundary>
                      </motion.div>
                    </>
                  )}
                  <motion.div variants={itemVariants} className="rounded-xl overflow-hidden border border-steel-grey/40 bg-abyss">
                    <ErrorBoundary>
                      <DecisionLog highlightOrderId={selectedOrderId || undefined} />
                    </ErrorBoundary>
                  </motion.div>
                </>
              )}

              {mode === 'executive' && (
                <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-3 lg:space-y-4">
                  {!metricsLoaded ? (
                    <motion.div variants={itemVariants} className="rounded-xl p-5 bg-abyss border border-steel-grey/40 space-y-4">
                      <Skeleton variant="text" width={140} height={14} />
                      {[1,2,3,4,5].map(i => <Skeleton key={i} variant="text" height={20} />)}
                    </motion.div>
                  ) : (
                  <motion.div variants={itemVariants} className="rounded-xl p-5 bg-abyss border border-steel-grey/40 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gauge size={14} weight="fill" className="text-accent-DEFAULT" />
                          <h3 className="text-xs font-semibold uppercase tracking-widest text-pearl">
                            Today's Performance
                          </h3>
                        </div>
                        <span className="text-[10px] text-mist font-mono">{new Date().toLocaleDateString()}</span>
                      </div>

                      <div className="space-y-3 divide-y divide-steel-grey/20">
                        <ExecMetric label="Orders Processed" value={metrics!.orders_processed} trend={{ direction: 'up', percentage: 12, period: 'yesterday' }} />
                        <ExecMetric label="On-Time Delivery" value={`${metrics!.on_time_percentage.toFixed(0)}%`} trend={{ direction: 'down', percentage: 3, period: 'yesterday' }} />
                        <ExecMetric label="Avg Delay" value={`${metrics!.average_delay_minutes.toFixed(0)}m`} trend={{ direction: 'down', percentage: 8, period: 'yesterday' }} />
                        <ExecMetric label="Active Deliveries" value={metrics!.active_deliveries} trend={{ direction: 'up', percentage: 6, period: 'yesterday' }} />
                        <ExecMetric label="Agent Interventions" value={metrics!.agent_interventions} trend={{ direction: 'down', percentage: 15, period: 'yesterday' }} />
                      </div>
                    </motion.div>
                  )}

                  {!recsLoaded ? (
                    <motion.div variants={itemVariants} className="rounded-xl p-5 bg-abyss border border-steel-grey/40">
                      <Skeleton variant="text" width={140} height={14} />
                      {[1,2,3].map(i => <Skeleton key={i} variant="text" height={20} />)}
                    </motion.div>
                  ) : recommendations.length > 0 && (
                    <motion.div variants={itemVariants} className="rounded-xl p-5 bg-abyss border border-steel-grey/40">
                      <div className="flex items-center gap-2 mb-4">
                        <Bell size={14} weight="fill" className="text-warning-DEFAULT" />
                        <h3 className="text-xs font-semibold uppercase tracking-widest text-pearl">
                          Top Recommendations
                        </h3>
                      </div>
                      <div className="space-y-2">
                        {recommendations.slice(0, 5).map((rec) => (
                          <div
                            key={rec.id}
                            className="rounded-lg p-3 bg-obsidian border border-steel-grey/30 transition-all duration-200 hover:border-accent/30"
                          >
                            <p className="text-xs font-semibold text-pearl">{rec.title}</p>
                            <p className="text-[11px] mt-0.5 line-clamp-1 text-mist">{rec.action}</p>
                            <div className="flex gap-3 mt-2">
                              <span className="text-[10px] font-semibold text-teal-DEFAULT">+{rec.estimated_impact_percentage}% impact</span>
                              <span className="text-steel-grey">·</span>
                              <span className="text-[10px] text-mist">{(rec.confidence * 100).toFixed(0)}% confidence</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </div>
        )}
      </main>

      <OperationsCopilot />
    </div>
  )
}

const ExecMetric: React.FC<{
  label: string
  value: string | number
  trend?: { direction: 'up' | 'down'; percentage: number; period: string }
}> = ({ label, value, trend }) => (
  <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
    <span className="text-xs font-medium text-mist">{label}</span>
    <div className="flex items-center gap-2.5">
      <span className="text-sm font-semibold tracking-tight text-pearl">{value}</span>
      {trend && (
        <span
          className={clsx(
            'text-[10px] font-bold px-1.5 py-0.5 rounded',
            trend.direction === 'up' ? 'bg-success-DEFAULT/10 text-success-DEFAULT' : 'bg-critical-DEFAULT/10 text-critical-DEFAULT',
          )}
        >
          <ArrowUp size={10} className="inline mr-0.5" weight="bold" />
          {trend.percentage}%
        </span>
      )}
    </div>
  </div>
)

export default Dashboard
