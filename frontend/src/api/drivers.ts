import { apiClient } from './client'

export interface Driver {
  driverId: string
  tenantId: string
  name: string
  phone: string | null
  email: string | null
  isActive: boolean
  currentLatitude: number
  currentLongitude: number
  activeOrderCount: number
}

export interface DriverStats {
  driverId: string
  tenantId: string
  activeOrderCount: number
  completedOrdersToday: number
  totalDeliveries: number
  onTimeRate: number
  avgRiskScore: number
}

export const driversAPI = {
  getDriver: (driverId: string) => apiClient.get<Driver>(`/drivers/${driverId}`),
  getDriverStats: (driverId: string) => apiClient.get<DriverStats>(`/drivers/${driverId}/stats`),
}
