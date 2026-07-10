import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import App from './App'
import { ToastProvider, ToastContainer } from '@/components/notifications'
import { useAuthStore } from '@/store/authStore'
import 'leaflet/dist/leaflet.css'
import './index.css'

// Bootstrap authentication state before the app renders.
// restoreSession() is synchronous for the dev-bypass path and async
// for the localStorage-restore path. Either way, isHydrating=true until it resolves.
// ProtectedRoute reads auth which starts as null, so without this call the app would
// redirect every user to /login on first paint.
useAuthStore.getState().restoreSession()


const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      cacheTime: 1000 * 60 * 10,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

const AppCrashFallback: React.FC = () => (
  <div className="flex items-center justify-center min-h-[100dvh] bg-obsidian px-4">
    <div className="bg-abyss rounded-xl border border-critical-DEFAULT/30 p-8 max-w-md w-full text-center">
      <div className="space-y-4">
        <div className="w-16 h-16 rounded-full bg-critical-DEFAULT/10 flex items-center justify-center mx-auto">
          <svg className="w-8 h-8 text-critical-DEFAULT" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-semibold text-pearl">Application Error</h1>
          <p className="text-sm text-mist/60">Failed to initialize the application. This may be due to a corrupted build or network issue.</p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-sm font-medium transition-colors active:scale-[0.98]"
        >
          Reload Application
        </button>
      </div>
    </div>
  </div>
)

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}

ReactDOM.createRoot(root).render(
  <ErrorBoundary fallback={<AppCrashFallback />}>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <App />
          <ToastContainer />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </ErrorBoundary>
)
