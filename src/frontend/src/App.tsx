import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AuthProvider, useAuth } from './lib/auth';
import { AppProvider } from './context/AppContext';
import { Toaster } from './components/ui/toast';
import { useToast } from './hooks/use-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { Suspense, lazy, type ReactNode } from 'react';
import { LoginPage } from './pages/Auth/Login';
import { SignupPage } from './pages/Auth/Signup';
import DashboardLayout from './layouts/DashboardLayout';

const LandingPage = lazy(() => import('./landing'));
const DispatchDashboard = lazy(() => import('./pages/dashboard'));
const OrderManagement = lazy(() => import('./pages/OrderManagement'));
const AnalyticsManagement = lazy(() => import('./pages/AnalyticsManagement'));
const SettingsManagement = lazy(() => import('./pages/SettingsManagement'));
const RouteOptimizer = lazy(() => import('./pages/RouteOptimizer'));
const FleetControl = lazy(() => import('./pages/FleetControl'));

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-white text-center">
          <div className="inline-block animate-spin p-4">⚡</div>
          <p className="mt-4">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/auth/login" />;
  }
  
  return children;
};

function AppRoutes() {
  const location = useLocation();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-screen bg-slate-900 text-white">
          Loading...
        </div>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <Routes location={location}>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth/login" element={<LoginPage />} />
          <Route path="/auth/signup" element={<SignupPage />} />
          <Route path="/login" element={<Navigate to="/auth/login" />} />

          {/* Protected Routes */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DispatchDashboard />} />
            <Route path="optimizer" element={<RouteOptimizer />} />
            <Route path="fleet" element={<FleetControl />} />
            <Route path="orders" element={<OrderManagement />} />
            <Route path="analytics" element={<AnalyticsManagement />} />
            <Route path="settings" element={<SettingsManagement />} />
          </Route>

          <Route
            path="/fleet"
            element={
              <ProtectedRoute>
                <FleetControl />
              </ProtectedRoute>
            }
          />

          {/* Catch all - redirect to landing */}
          <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </Suspense>
  );
}

function App() {
  const { toasts, dismiss } = useToast();

  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppProvider>
            <AppRoutes />
            <Toaster toasts={toasts} onClose={dismiss} />
          </AppProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
