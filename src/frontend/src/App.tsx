import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { Toaster } from './components/ui/toast';
import { useToast } from './hooks/use-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { type ReactNode } from 'react';
import LoginPage from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import DashboardHome from './pages/DashboardHome';
import OrderManagement from './pages/OrderManagement';
import AnalyticsManagement from './pages/AnalyticsManagement';
import SettingsManagement from './pages/SettingsManagement';

import RouteOptimizer from './pages/RouteOptimizer';
import FleetControl from './pages/FleetControl';

const ProtectedRoute = ({ children }: { children: ReactNode }) => {
  // const { isAuthenticated } = useAuth();
  // if (!isAuthenticated) return <Navigate to="/login" />;
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route path="/dashboard" element={
        <ProtectedRoute>
          <DashboardLayout />
        </ProtectedRoute>
      }>
        <Route index element={<DashboardHome />} />
        <Route path="optimizer" element={<RouteOptimizer />} />
        <Route path="fleet" element={<FleetControl />} />
        <Route path="orders" element={<OrderManagement />} />
        <Route path="analytics" element={<AnalyticsManagement />} />
        <Route path="settings" element={<SettingsManagement />} />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" />} />
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
