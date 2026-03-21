import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { apiClient } from '../api';

interface AppContextValue {
  tenantId: string;
  setTenantId: (tenantId: string) => void;
  selectedDriverId: string | null;
  setSelectedDriverId: (driverId: string | null) => void;
  selectedOrderId: string | null;
  setSelectedOrderId: (orderId: string | null) => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

const FALLBACK_TENANT =
  ((import.meta as any)?.env?.VITE_TENANT_ID as string | undefined) ||
  apiClient.getTenantId() ||
  'demo-tenant-001';

export function AppProvider({ children }: { children: ReactNode }) {
  const [tenantId, setTenantIdState] = useState(FALLBACK_TENANT);
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const setTenantId = (nextTenantId: string) => {
    setTenantIdState(nextTenantId);
    apiClient.setTenantId(nextTenantId);
  };

  const value = useMemo(
    () => ({
      tenantId,
      setTenantId,
      selectedDriverId,
      setSelectedDriverId,
      selectedOrderId,
      setSelectedOrderId,
    }),
    [tenantId, selectedDriverId, selectedOrderId]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
