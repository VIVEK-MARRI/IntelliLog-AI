import React, { useEffect } from 'react'
import { Sidebar } from './Sidebar'
import { EventStreamTicker, useLiveNotificationToasts } from '@/components/live'
import { useRealtimeEventBridge } from '@/hooks/useRealtimeEventBridge'
import { useAuthStore } from '@/store/authStore'
import { wsManager } from '@/api/websocket'
import { DemoMode } from '@/components/demo/DemoMode'

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useLiveNotificationToasts()
  useRealtimeEventBridge()

  const auth = useAuthStore((state) => state.auth)

  // Keep WebSocket alive across all pages
  useEffect(() => {
    if (!auth) return
    wsManager.connect(auth.tenant.tenant_id)
    return () => { wsManager.disconnect() }
  }, [auth])

  return (
    <div className="h-[100dvh] flex bg-graphite overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 overflow-hidden p-page shadow-panel">
          {children}
        </div>
        <EventStreamTicker />
        <DemoMode />
      </main>
    </div>
  )
}
