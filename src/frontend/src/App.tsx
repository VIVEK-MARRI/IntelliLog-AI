import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Toaster } from './components/ui/toast';
import { useToast } from './hooks/use-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { type ReactNode } from 'react';
import { LandingPage } from './pages/Landing';
import { LoginPage } from './pages/Auth/Login';
import { SignupPage } from './pages/Auth/Signup';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import OrderManagement from './pages/OrderManagement';
import AnalyticsManagement from './pages/AnalyticsManagement';
import SettingsManagement from './pages/SettingsManagement';
import RouteOptimizer from './pages/RouteOptimizer';
import FleetControl from './pages/FleetControl';

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
  return (
    <Routes>
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
        <Route index element={<DashboardHome />} />
        <Route path="optimizer" element={<RouteOptimizer />} />
        <Route path="fleet" element={<FleetControl />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="analytics" element={<AnalyticsManagement />} />
        <Route path="settings" element={<SettingsManagement />} />
      </Route>

      {/* Catch all - redirect to landing */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

function App() {
  const { toasts, dismiss } = useToast();

  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <AppRoutes />
          <Toaster toasts={toasts} onClose={dismiss} />
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
