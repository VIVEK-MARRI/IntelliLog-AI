import { useEffect, useRef } from 'react'
import { useRealtimeStore } from '@/store/realtimeStore'
import { useToast } from '@/components/notifications'

/**
 * Subscribes to realtimeStore notifications and pushes them as toasts.
 * Renders nothing — purely a side-effect hook.
 */
export const useLiveNotificationToasts = () => {
  const { addToast } = useToast()
  const lastCount = useRef(0)
  const notifications = useRealtimeStore((s) => s.notifications)

  useEffect(() => {
    if (notifications.length > lastCount.current) {
      const newOnes = notifications.slice(0, notifications.length - lastCount.current)
      for (const n of newOnes) {
        if (n.severity === 'critical') {
          addToast({ type: 'error', title: n.title, message: n.message, duration: 6000 })
        } else if (n.severity === 'warning') {
          addToast({ type: 'warning', title: n.title, message: n.message, duration: 5000 })
        } else if (n.severity === 'success') {
          addToast({ type: 'success', title: n.title, message: n.message, duration: 4000 })
        } else {
          addToast({ type: 'info', title: n.title, message: n.message, duration: 4000 })
        }
      }
    }
    lastCount.current = notifications.length
  }, [notifications, addToast])
}
