import React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { driversAPI } from '@/api/drivers'

import { ArrowLeft, User, Phone, Mail, Activity, Package, CheckCircle, Clock, AlertTriangle } from 'lucide-react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'

export function DriverDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: driver, isLoading: isLoadingDriver, isError: isErrorDriver } = useQuery({
    queryKey: ['driver', id],
    queryFn: () => driversAPI.getDriver(id!),
    enabled: !!id,
  })

  const { data: stats, isLoading: isLoadingStats } = useQuery({
    queryKey: ['driverStats', id],
    queryFn: () => driversAPI.getDriverStats(id!),
    enabled: !!id,
  })

  if (isLoadingDriver) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    )
  }

  if (isErrorDriver || !driver) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <AlertTriangle className="mb-4 h-12 w-12 text-critical" />
        <h2 className="text-xl font-semibold">Driver Not Found</h2>
        <p className="mt-2 text-accent">The requested driver profile could not be found or you don't have access.</p>
        <button onClick={() => navigate(-1)} className="mt-6 px-4 py-2 border border-border rounded-md hover:bg-surface-elevated transition-colors">
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => navigate(-1)} className="h-8 w-8 rounded-full border border-border flex items-center justify-center hover:bg-surface-elevated transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-2xl font-bold tracking-tight">Driver Profile</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Profile Card */}
        <div className="p-6 md:col-span-1 bg-surface border border-border rounded-xl flex flex-col items-center text-center space-y-4 shadow-sm">
          <div className="h-24 w-24 rounded-full bg-primary/20 text-primary flex items-center justify-center mb-2">
            <User className="h-12 w-12" />
          </div>
          <div>
            <h2 className="text-xl font-bold">{driver.name}</h2>
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className={`h-2.5 w-2.5 rounded-full ${driver.isActive ? 'bg-success' : 'bg-surface-elevated'}`} />
              <span className="text-sm text-accent">{driver.isActive ? 'Active Now' : 'Offline'}</span>
            </div>
          </div>
          <div className="w-full pt-4 border-t border-border space-y-3 text-sm text-left">
            <div className="flex items-center gap-3 text-accent">
              <Phone className="h-4 w-4" />
              <span>{driver.phone || 'No phone provided'}</span>
            </div>
            <div className="flex items-center gap-3 text-accent">
              <Mail className="h-4 w-4" />
              <span>{driver.email || 'No email provided'}</span>
            </div>
            <div className="flex items-center gap-3 text-accent">
              <Activity className="h-4 w-4" />
              <span className="font-mono text-xs">ID: {driver.driverId.split('-')[0]}...</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {isLoadingStats ? (
            <div className="col-span-full flex justify-center py-12"><LoadingSpinner /></div>
          ) : stats ? (
            <>
              <div className="p-6 flex flex-col justify-center space-y-2 bg-surface rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-accent mb-1">
                  <Package className="h-4 w-4" />
                  <span className="text-sm font-medium">Active Orders</span>
                </div>
                <div className="text-3xl font-bold">{stats.activeOrderCount}</div>
              </div>
              
              <div className="p-6 flex flex-col justify-center space-y-2 bg-surface rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-accent mb-1">
                  <CheckCircle className="h-4 w-4" />
                  <span className="text-sm font-medium">Completed Today</span>
                </div>
                <div className="text-3xl font-bold">{stats.completedOrdersToday}</div>
              </div>
              
              <div className="p-6 flex flex-col justify-center space-y-2 bg-surface rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-accent mb-1">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm font-medium">Historical On-Time</span>
                </div>
                <div className="text-3xl font-bold text-success">
                  {(stats.onTimeRate * 100).toFixed(1)}%
                </div>
                <p className="text-xs text-accent">Across {stats.totalDeliveries.toLocaleString()} deliveries</p>
              </div>
              
              <div className="p-6 flex flex-col justify-center space-y-2 bg-surface rounded-xl border border-border shadow-sm">
                <div className="flex items-center gap-2 text-accent mb-1">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm font-medium">Avg Fleet Risk</span>
                </div>
                <div className={`text-3xl font-bold ${stats.avgRiskScore > 0.6 ? 'text-critical' : stats.avgRiskScore > 0.3 ? 'text-warning' : 'text-success'}`}>
                  {stats.avgRiskScore.toFixed(2)}
                </div>
                <p className="text-xs text-accent">AI computed baseline risk</p>
              </div>
            </>
          ) : (
             <div className="col-span-full p-8 text-center text-accent">No statistics available</div>
          )}
        </div>
      </div>
    </div>
  )
}
