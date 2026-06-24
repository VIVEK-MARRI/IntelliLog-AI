import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { fleetStore } from '@/store/fleetStore'
import { MapPin, GearSix, SignOut, CaretLeft, CaretRight, Crosshair, Gauge, Heartbeat, Brain, SquaresFour, Lightning } from '@phosphor-icons/react'
import clsx from 'clsx'
import { ConnectionQualityIndicator } from '@/components/live'

export const Sidebar: React.FC = () => {
  const auth = useAuthStore((state) => state.auth)
  const logout = useAuthStore((state) => state.logout)
  const location = useLocation()
  const [isExpanded, setIsExpanded] = useState(true)
  const tenant = auth?.tenant

  const navItems = [
    { path: '/app', label: 'Mission Control', icon: Crosshair },
    { path: '/operations', label: 'Operations', icon: SquaresFour },
    { path: '/orders', label: 'Orders', icon: MapPin },
    { path: '/ai', label: 'AI Workspace', icon: Brain },
    { path: '/system-health', label: 'System Health', icon: Heartbeat },
    { path: '/executive', label: 'Executive', icon: Gauge },
  ]

  const isActive = (path: string) => {
    if (path === '/app') return location.pathname === '/app' || location.pathname === '/mission-control'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={clsx(
        'flex flex-col bg-charcoal border-r border-slate/30 shadow-sidebar',
        'transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isExpanded ? 'w-56' : 'w-16',
      )}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center h-14 border-b border-sidebar-border',
        isExpanded ? 'px-4 justify-between' : 'px-3 justify-center'
      )}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-amber/20 flex items-center justify-center">
            <Lightning size={14} weight="fill" className="text-amber" />
          </div>
          {isExpanded && (
            <div>
              <span className="text-sm font-semibold text-silverMuted-hover tracking-tight">IntelliLog</span>
              <p className="text-[9px] text-silverMuted/50 font-medium tracking-[0.06em] uppercase">AI Dispatch</p>
            </div>
          )}
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={clsx(
            'text-silverMuted/40 hover:text-silverMuted-hover transition-colors rounded hover:bg-sidebar-hover',
            isExpanded ? 'p-1' : 'absolute -right-3 top-4 bg-sidebar-surface border border-sidebar-border rounded-full p-0.5 shadow-sm'
          )}
        >
          {isExpanded ? <CaretLeft size={14} /> : <CaretRight size={12} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2.5 py-4 space-y-0.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'sidebar-nav-item',
                isExpanded ? '' : 'justify-center px-0 py-2',
                active ? 'active' : 'text-silverMuted hover:text-silverMuted-hover'
              )}
              title={isExpanded ? '' : item.label}
            >
              <Icon size={18} weight={active ? 'fill' : 'regular'} />
              {isExpanded && (
                <span className="text-xs">{item.label}</span>
              )}
              {active && isExpanded && (
                <div className="ml-auto w-1 h-5 rounded-full bg-sidebar-active" />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-sidebar-border p-2.5 space-y-1">
        {isExpanded && (
          <div className="px-3 py-1.5">
            <ConnectionQualityIndicator />
          </div>
        )}
        {isExpanded && (
          <div className="px-3 py-1.5 mb-1">
            <span className="text-[10px] text-silverMuted/40 uppercase tracking-[0.06em] font-medium">Fleet Health</span>
            <FleetHealthMini />
          </div>
        )}
        <div className={clsx(
          'flex items-center gap-2.5 w-full rounded-lg transition-all sidebar-nav-item',
          isExpanded ? 'px-3 py-2 text-xs font-medium' : 'justify-center p-2'
        )}>
          <GearSix size={16} className="text-silverMuted/60" />
          {isExpanded && <span className="text-silverMuted/60">Settings</span>}
        </div>
        <button
          onClick={() => logout()}
          className={clsx(
            'flex items-center gap-2.5 w-full rounded-lg transition-all sidebar-nav-item',
            isExpanded ? 'px-3 py-2 text-xs font-medium' : 'justify-center p-2'
          )}
        >
          <SignOut size={16} className="text-silverMuted/60" />
          {isExpanded && <span className="text-silverMuted/60">Logout</span>}
        </button>
        {isExpanded && tenant && (
          <div className="px-3 py-2 mt-2 border-t border-sidebar-border/50">
            <p className="text-[10px] text-silverMuted/40 uppercase tracking-[0.06em] font-medium truncate">{tenant.name}</p>
            <p className="text-[9px] text-silverMuted/30 font-mono truncate">{tenant.tenant_id?.slice(0, 8)}</p>
          </div>
        )}
      </div>
    </aside>
  )
}

const FleetHealthMini: React.FC = () => {
  const orders = Array.from(fleetStore((s) => s.orders).values())
  const highRisk = orders.filter((o) => o.is_high_risk).length
  const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled').length
  const healthScore = active > 0 ? Math.round(((active - highRisk) / active) * 100) : null

  return (
    <div className="flex items-center gap-2 mt-1">
      <span className={clsx(
        'w-1.5 h-1.5 rounded-full',
        healthScore !== null
          ? healthScore >= 80 ? 'bg-success' : healthScore >= 50 ? 'bg-warning' : 'bg-critical'
          : 'bg-sidebar-text/20'
      )} />
      <span className="text-[10px] font-mono text-silverMuted/60">
        {healthScore !== null ? `${healthScore}%` : '--'}
      </span>
      <span className="text-[9px] text-silverMuted/30">{active} active</span>
    </div>
  )
}

export default Sidebar
