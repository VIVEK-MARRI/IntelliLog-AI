import { useEffect, useRef } from 'react'
import { fleetStore } from '@/store/fleetStore'
import { useRealtimeStore } from '@/store/realtimeStore'

let counter = 0
const uid = () => `rt-${++counter}-${Date.now()}`

/**
 * Bridges fleetStore mutations into the realtimeStore (ticker + notifications).
 * Mount once at the AppShell level for always-on event tracking.
 */
export const useRealtimeEventBridge = () => {
  const decisionCount = useRef(0)
  const orderMap = useRef<Map<string, number>>(new Map())
  const stopsMap = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const push = useRealtimeStore.getState

    const unsub = fleetStore.subscribe((state) => {
      // --- New agent decisions ---
      if (state.agentDecisions.length > decisionCount.current) {
        const newDecisions = decisionCount.current === 0
          ? []
          : state.agentDecisions.slice(0, state.agentDecisions.length - decisionCount.current)
        decisionCount.current = state.agentDecisions.length

        for (const d of newDecisions) {
          const isIntervention = d.decision_type === 'reroute' || d.decision_type === 'alert'

          push().pushTickerEvent({
            id: uid(),
            timestamp: d.created_at || new Date().toISOString(),
            type: isIntervention ? 'intervention' : 'decision',
            severity: d.decision_type === 'alert' ? 'warning' : d.decision_type === 'reroute' ? 'critical' : 'info',
            title: `${d.decision_type.replace('_', ' ')} — ${d.order_id.slice(0, 8)}`,
            detail: d.reasoning.slice(0, 100),
          })

          if (isIntervention) {
            push().pushNotification({
              id: uid(),
              type: 'intervention',
              title: 'AI Intervention Triggered',
              message: `Agent ${d.decision_type === 'reroute' ? 'rerouted' : 'alerted'} order ${d.order_id.slice(0, 8)}`,
              severity: d.decision_type === 'alert' ? 'warning' : 'critical',
              timestamp: d.created_at || new Date().toISOString(),
              orderId: d.order_id,
              read: false,
            })
          }
        }
      }

      // --- Risk score changes ---
      for (const [id, order] of state.orders) {
        const prevScore = orderMap.current.get(id)
        if (prevScore !== undefined && Math.abs(order.risk_score - prevScore) > 0.05) {
          push().pushTickerEvent({
            id: uid(),
            timestamp: new Date().toISOString(),
            type: 'risk_change',
            severity: order.risk_score > 0.7 ? 'critical' : order.risk_score > 0.3 ? 'warning' : 'info',
            title: `Risk ${order.risk_score > prevScore ? 'increased' : 'decreased'} — ${id.slice(0, 8)}`,
            detail: `${(prevScore * 100).toFixed(0)}% → ${(order.risk_score * 100).toFixed(0)}%`,
          })
        }
      }
      orderMap.current = new Map()
      for (const [id, order] of state.orders) {
        orderMap.current.set(id, order.risk_score)
      }

      // --- Route optimizations ---
      for (const [id, order] of state.orders) {
        const prevLen = stopsMap.current.get(id)
        const curLen = order.stops?.length ?? 0
        if (prevLen !== undefined && curLen !== prevLen) {
          push().pushTickerEvent({
            id: uid(),
            timestamp: new Date().toISOString(),
            type: 'route_opt',
            severity: 'success',
            title: `Route updated — ${id.slice(0, 8)}`,
            detail: `${curLen} stops`,
          })
          push().pushNotification({
            id: uid(),
            type: 'route_optimized',
            title: 'Route Optimization Complete',
            message: `Order ${id.slice(0, 8)} route updated to ${curLen} stops`,
            severity: 'success',
            timestamp: new Date().toISOString(),
            orderId: id,
            read: false,
          })
        }
      }
      stopsMap.current = new Map()
      for (const [id, order] of state.orders) {
        stopsMap.current.set(id, order.stops?.length ?? 0)
      }
    })

    return () => unsub()
  }, [])
}
