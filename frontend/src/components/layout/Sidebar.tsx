import React, { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { MapPin, GearSix, SignOut, CaretLeft, CaretRight, SquaresFour } from '@phosphor-icons/react'
import clsx from 'clsx'

export const Sidebar: React.FC = () => {
  const auth = useAuthStore((state) => state.auth)
  const logout = useAuthStore((state) => state.logout)
  const location = useLocation()
  const [isExpanded, setIsExpanded] = useState(true)
  const tenant = auth?.tenant

  const navItems = [
    { path: '/', label: 'Command Center', icon: SquaresFour },
    { path: '/orders', label: 'Orders', icon: MapPin },
  ]

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <aside
      className={clsx(
        'flex flex-col border-r border-steel-grey/30 bg-abyss transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
        isExpanded ? 'w-60' : 'w-16',
      )}
    >
      <div className={clsx(
        'flex items-center border-b border-steel-grey/30',
        isExpanded ? 'px-4 py-4 justify-between' : 'px-3 py-4 justify-center'
      )}>
        {isExpanded && (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
              <div className="w-3.5 h-3.5 rounded-sm bg-accent" />
            </div>
            <span className="text-sm font-semibold text-pearl tracking-tight">IntelliLog</span>
          </div>
        )}
        {!isExpanded && (
          <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center mx-auto">
            <div className="w-3.5 h-3.5 rounded-sm bg-accent" />
          </div>
        )}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={clsx(
            'text-mist hover:text-pearl transition-colors rounded',
            isExpanded ? 'p-1' : 'p-1 absolute -right-3 top-5 bg-abyss border border-steel-grey/30 rounded-full'
          )}
        >
          {isExpanded ? <CaretLeft size={14} /> : <CaretRight size={12} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              to={item.path}
              className={clsx(
                'flex items-center rounded-panel transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] group',
                isExpanded ? 'gap-3 px-3 py-2' : 'justify-center p-2',
                isActive(item.path)
                  ? 'bg-accent/10 text-accent border border-accent/20'
                  : 'text-mist hover:bg-slate-blue hover:text-pearl border border-transparent'
              )}
              title={isExpanded ? '' : item.label}
            >
              <Icon size={18} weight={isActive(item.path) ? 'fill' : 'regular'} />
              {isExpanded && (
                <span className="text-xs font-medium">{item.label}</span>
              )}
              {isActive(item.path) && isExpanded && (
                <div className="ml-auto w-1 h-1 rounded-full bg-accent" />
              )}
            </Link>
          )
        })}
      </nav>

      <div className="border-t border-steel-grey/30 p-2 space-y-1">
        <div className={clsx(
          'flex items-center gap-3 w-full rounded-panel text-mist border border-transparent opacity-40',
          isExpanded ? 'px-3 py-2' : 'justify-center p-2'
        )}>
          <GearSix size={16} />
          {isExpanded && <span className="text-xs font-medium">Settings</span>}
        </div>
        <button
          onClick={() => logout()}
          className={clsx(
            'flex items-center gap-3 w-full rounded-panel transition-all duration-150 text-mist hover:bg-critical/10 hover:text-critical border border-transparent',
            isExpanded ? 'px-3 py-2' : 'justify-center p-2'
          )}
        >
          <SignOut size={16} />
          {isExpanded && <span className="text-xs font-medium">Logout</span>}
        </button>
        {isExpanded && tenant && (
          <div className="px-3 py-2 mt-2">
            <p className="text-[10px] text-mist uppercase tracking-wider font-medium truncate">{tenant.name}</p>
            <p className="text-[10px] text-steel-grey font-mono truncate">{tenant.tenant_id?.slice(0, 8)}</p>
          </div>
        )}
      </div>
    </aside>
  )
}
