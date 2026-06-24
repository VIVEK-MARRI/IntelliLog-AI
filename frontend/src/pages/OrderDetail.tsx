import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { fleetStore } from '@/store/fleetStore'
import { ordersAPI } from '@/api/orders'
import { predictionsAPI } from '@/api/predictions'
import { LiveOrder, RiskFactor, AgentDecision } from '@/types/api'
import { RiskExplainer } from '@/components/predictions/RiskExplainer'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { format, formatDistanceToNow } from 'date-fns'
import clsx from 'clsx'
import { ArrowLeft } from '@phosphor-icons/react'

export const OrderDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>()
  const navigate = useNavigate()
  const orders = fleetStore((state) => state.orders)

  const [order, setOrder] = useState<LiveOrder | null>(null)
  const [riskFactors, setRiskFactors] = useState<RiskFactor[]>([])
  const [decisions, setDecisions] = useState<AgentDecision[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadOrder = async () => {
      if (!orderId) return
      try {
        setIsLoading(true)
        let orderData = orders.get(orderId)
        if (!orderData) {
          orderData = await ordersAPI.getOrder(orderId)
        }
        setOrder(orderData)
        const prediction = await predictionsAPI.getPrediction(orderId)
        setRiskFactors(prediction.topRiskFactors)
      } catch (error) {
        console.error('Failed to load order:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadOrder()
  }, [orderId, orders])

  useEffect(() => {
    const allDecisions = fleetStore((state) => state.agentDecisions)
    const orderDecisions = allDecisions.filter((d) => d.order_id === orderId)
    setDecisions(orderDecisions)
  }, [orderId])

  if (isLoading) {
    return <LoadingSpinner fullscreen message="Loading order details..." />
  }

  if (!order) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-mist">Order not found</p>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-accent text-white rounded hover:bg-accent/90 transition-colors text-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-obsidian">
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={() => navigate('/')}
              className="text-accent hover:text-accent/80 text-sm mb-2 flex items-center gap-1"
            >
              <ArrowLeft size={14} />
              Back to Dashboard
            </button>
            <h1 className="text-3xl font-bold text-pearl">
              Order {order.id}
            </h1>
            <p className="text-mist/60 mt-1">
              {format(new Date(order.created_at), 'PPP p')}
            </p>
          </div>

          <div className="text-right">
            <div className={clsx(
              'inline-block px-3 py-1 rounded-full text-sm font-semibold',
              order.status === 'completed' && 'bg-success-DEFAULT/20 text-success-DEFAULT',
              order.status === 'in_transit' && 'bg-accent/20 text-accent',
              order.status === 'pending' && 'bg-steel-grey text-cloud'
            )}>
              {order.status.toUpperCase()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-abyss rounded border border-steel-grey/30 p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InfoBlock label="Customer" value={order.customer_name} />
              <InfoBlock label="Driver" value={order.driver_id} />
              <InfoBlock label="From" value={order.origin_address} />
              <InfoBlock label="To" value={order.destination_address} />
              <InfoBlock label="Distance" value={`${order.estimated_distance_km?.toFixed(1) || 'N/A'} km`} />
              <InfoBlock label="Expected Duration" value={order.estimated_duration_minutes !== undefined ? `${order.estimated_duration_minutes} min` : 'N/A'} />
            </div>

            <div className="bg-abyss rounded border border-steel-grey/30 p-6">
              <h3 className="text-sm font-semibold text-cloud uppercase tracking-wider mb-4">
                Progress
              </h3>

              <div className="space-y-3">
                {order.stops?.map((stop, idx) => (
                  <StopItem
                    key={`${stop.sequence}`}
                    stop={stop}
                    isCompleted={idx < (order.current_stop || 0)}
                    isCurrent={idx === (order.current_stop || 0)}
                  />
                ))}
              </div>

              <div className="mt-4 text-xs text-mist/60">
                Progress: {order.current_stop || 0} / {order.stops?.length || 0} stops
              </div>
            </div>

            {decisions.length > 0 && (
              <div className="bg-abyss rounded border border-steel-grey/30 p-6">
                <h3 className="text-sm font-semibold text-cloud uppercase tracking-wider mb-4">
                  AI Agent Decisions
                </h3>

                <div className="space-y-3">
                  {decisions.map((decision) => (
                    <div key={decision.id} className="border-l-2 border-accent pl-3 py-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-mono text-mist/60">
                          {format(new Date(decision.created_at), 'HH:mm:ss')}
                        </span>
                        <span className={clsx(
                          'text-xs font-semibold px-2 py-0.5 rounded',
                          decision.decision_type === 'alert' && 'bg-warning-DEFAULT/20 text-warning-DEFAULT',
                          decision.decision_type === 'reroute' && 'bg-accent/20 text-accent'
                        )}>
                          {decision.decision_type.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-xs text-cloud">{decision.reasoning}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <RiskExplainer
              riskScore={order.risk_score}
              confidence={0.92}
              topFactors={riskFactors}
              predictedDelay={order.delay_minutes}
            />

            <div className="bg-abyss rounded border border-steel-grey/30 p-6 space-y-4">
              <h3 className="text-sm font-semibold text-cloud uppercase tracking-wider">
                Performance
              </h3>

              <MetricRow
                label="Current Speed"
                value={`${(order.current_position?.speed_kmh ?? 0).toFixed(1)} km/h`}
              />
              <MetricRow
                label="Time Elapsed"
                value={formatDistanceToNow(new Date(order.created_at))}
              />
              <MetricRow
                label="ETA"
                value={order.current_eta ? format(new Date(order.current_eta), 'HH:mm') : 'N/A'}
              />
              <MetricRow
                label="Delay"
                value={`${order.delay_minutes?.toFixed(0) || 0} min`}
                isWarning={order.delay_minutes ? order.delay_minutes > 5 : false}
              />
              <MetricRow
                label="Last Update"
                value={formatDistanceToNow(new Date(order.updated_at), { addSuffix: true })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface InfoBlockProps {
  label: string
  value: string | number | undefined
}

const InfoBlock: React.FC<InfoBlockProps> = ({ label, value }) => (
  <div>
    <p className="text-xs text-mist/60 mb-1">{label}</p>
    <p className="text-sm font-semibold text-pearl truncate">{value || 'N/A'}</p>
  </div>
)

interface StopItemProps {
  stop: {
    sequence: number
    address: string
    arrival_time?: string | null
  }
  isCompleted: boolean
  isCurrent: boolean
}

const StopItem: React.FC<StopItemProps> = ({ stop, isCompleted, isCurrent }) => (
  <div className="flex items-start gap-3">
    <div
      className={clsx(
        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold',
        isCurrent && 'bg-accent text-white animate-pulse',
        isCompleted && 'bg-success-DEFAULT text-pearl',
        !isCompleted && !isCurrent && 'bg-navy text-mist'
      )}
    >
      {isCompleted && '\u2713'}
      {isCurrent && '\u2192'}
      {!isCompleted && !isCurrent && stop.sequence}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-cloud">{stop.address}</p>
      {stop.arrival_time && (
        <p className="text-xs text-mist/60">
          Arrived: {format(new Date(stop.arrival_time), 'HH:mm')}
        </p>
      )}
    </div>
  </div>
)

interface MetricRowProps {
  label: string
  value: string | number
  isWarning?: boolean
}

const MetricRow: React.FC<MetricRowProps> = ({ label, value, isWarning }) => (
  <div className="flex items-center justify-between">
    <span className="text-xs text-mist">{label}</span>
    <span className={clsx(
      'text-sm font-semibold',
      isWarning ? 'text-warning-DEFAULT' : 'text-pearl'
    )}>
      {value}
    </span>
  </div>
)
