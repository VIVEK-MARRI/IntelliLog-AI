import React, { useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { AppShell } from '@/components/layout/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

const Dashboard = lazy(() => import('@/pages/Dashboard').then(m => ({ default: m.Dashboard })))
const OrderDetail = lazy(() => import('@/pages/OrderDetail').then(m => ({ default: m.OrderDetail })))
const Login = lazy(() => import('@/pages/Login').then(m => ({ default: m.Login })))
const Landing = lazy(() => import('@/pages/Landing').then(m => ({ default: m.Landing })))

const PageLoader: React.FC = () => (
  <div className="flex items-center justify-center h-screen bg-obsidian">
    <LoadingSpinner message="Loading..." />
  </div>
)

const AppShellLayout: React.FC = () => (
  <AppShell>
    <Outlet />
  </AppShell>
)

const ROUTER_FUTURE = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
} as const

const App: React.FC = () => {
  const auth = useAuthStore((state) => state.auth)
  const restoreSession = useAuthStore((state) => state.restoreSession)

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  return (
    <BrowserRouter future={ROUTER_FUTURE}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {auth === null && (
            <>
              <Route path="/" element={
                <ErrorBoundary><Landing /></ErrorBoundary>
              } />
              <Route path="/login" element={
                <ErrorBoundary><Login /></ErrorBoundary>
              } />
            </>
          )}
          {auth !== null && (
            <Route element={<AppShellLayout />}>
              <Route path="/" element={
                <ErrorBoundary><Dashboard /></ErrorBoundary>
              } />
              <Route path="/orders/:orderId" element={
                <ErrorBoundary><OrderDetail /></ErrorBoundary>
              } />
            </Route>
          )}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
