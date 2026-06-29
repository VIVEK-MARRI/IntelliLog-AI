import React, { Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { lazyWithRetry } from '@/utils/lazyWithRetry'
import { ordersAPI } from '@/api/orders'
import { fleetStore } from '@/store/fleetStore'
import { useAuthStore } from '@/store/authStore'

const LandingPage = lazyWithRetry(() => import('@/pages/Landing').then(m => ({ default: m.Landing })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] Landing chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const MissionControl = lazyWithRetry(() => import('@/pages/MissionControl').then(m => ({ default: m.MissionControl })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] MissionControl chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const Operations = lazyWithRetry(() => import('@/pages/Operations').then(m => ({ default: m.Operations })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] Operations chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const OrdersPage = lazyWithRetry(() => import('@/pages/Orders').then(m => ({ default: m.Orders })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] Orders page chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const ExecutivePage = lazyWithRetry(() => import('@/pages/Executive').then(m => ({ default: m.Executive })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] Executive page chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const SystemHealthPage = lazyWithRetry(() => import('@/pages/SystemHealthCenter').then(m => ({ default: m.SystemHealthCenter })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] SystemHealth chunk load failed (attempt ${attempt}):`, error.message)
  },
})
const AIWorkspacePage = lazyWithRetry(() => import('@/pages/AIWorkspace').then(m => ({ default: m.AIWorkspace })), {
  retries: 3,
  delay: 1000,
  onError: (error, attempt) => {
    console.warn(`[LazyLoad] AIWorkspace chunk load failed (attempt ${attempt}):`, error.message)
  },
})

const PageLoader: React.FC<{ message?: string }> = ({ message = 'Loading...' }) => (
  <div className="flex items-center justify-center h-screen bg-background">
    <LoadingSpinner message={message} />
  </div>
)

const AppShellLayout: React.FC = () => (
  <AppShell>
    <Outlet />
  </AppShell>
)

const App: React.FC = () => {
  useEffect(() => {
    const token = useAuthStore.getState().auth?.token
    if (!token) return
    ordersAPI.getOrders({ page: 1, page_size: 200 }).then((result) => {
      if (result?.items?.length) {
        fleetStore.getState().setOrders(result.items)
      }
    }).catch(() => {})
  }, [])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Landing page — no AppShell */ }
        <Route path="/" element={
          <ErrorBoundary><LandingPage /></ErrorBoundary>
        } />
        {/* App routes — with AppShell */ }
        <Route element={<AppShellLayout />}>
          <Route path="/app" element={
            <ErrorBoundary><MissionControl /></ErrorBoundary>
          } />
          <Route path="/mission-control" element={
            <ErrorBoundary><MissionControl /></ErrorBoundary>
          } />
          <Route path="/operations" element={
            <ErrorBoundary><Operations /></ErrorBoundary>
          } />
          <Route path="/orders" element={
            <ErrorBoundary><OrdersPage /></ErrorBoundary>
          } />
          <Route path="/executive" element={
            <ErrorBoundary><ExecutivePage /></ErrorBoundary>
          } />
          <Route path="/system-health" element={
            <ErrorBoundary><SystemHealthPage /></ErrorBoundary>
          } />
          <Route path="/ai" element={
            <ErrorBoundary><AIWorkspacePage /></ErrorBoundary>
          } />
          <Route path="/copilot" element={
            <ErrorBoundary><AIWorkspacePage /></ErrorBoundary>
          } />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
