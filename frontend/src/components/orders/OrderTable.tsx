import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOrdersArray } from '@/store/fleetStore'
import { LiveOrder } from '@/types/api'
import { RiskBadge } from '../shared/RiskBadge'
import clsx from 'clsx'

const DEFAULT_PAGE_SIZE = 25

interface OrderTableProps {
  onOrderSelect?: (orderId: string) => void
  sortBy?: 'risk_score' | 'eta' | 'driver'
  pageSize?: number
  total?: number
}

export const OrderTable: React.FC<OrderTableProps> = ({ onOrderSelect, sortBy = 'risk_score', pageSize = DEFAULT_PAGE_SIZE, total }) => {
  const navigate = useNavigate()
  const orders = useOrdersArray()
  const [currentPage, setCurrentPage] = useState(1)

  const sortedOrders = useMemo(() => {
    const sorted = [...orders]
    if (sortBy === 'risk_score') sorted.sort((a, b) => b.risk_score - a.risk_score)
    else if (sortBy === 'eta') sorted.sort((a, b) => new Date(a.current_eta).getTime() - new Date(b.current_eta).getTime())
    else if (sortBy === 'driver') sorted.sort((a, b) => a.driver_id.localeCompare(b.driver_id))
    return sorted
  }, [orders, sortBy])

  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const pageOrders = sortedOrders.slice(pageStart, pageEnd)
  const displayTotal = total ?? sortedOrders.length

  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  if (sortedOrders.length === 0) {
    return (
      <div className="bg-abyss rounded border border-steel-grey/40 p-8 text-center h-full flex items-center justify-center">
        <p className="text-mist text-sm">No active orders</p>
      </div>
    )
  }

  return (
    <div className="bg-abyss rounded border border-steel-grey/40 overflow-hidden h-full flex flex-col">
      <div className="hidden lg:grid grid-cols-12 gap-4 px-4 py-3 text-[10px] font-semibold text-mist uppercase tracking-wider bg-obsidian/50 border-b border-steel-grey/30 shrink-0">
        <div className="col-span-2">Order</div>
        <div className="col-span-1">Driver</div>
        <div className="col-span-1">Stops</div>
        <div className="col-span-1">ETA</div>
        <div className="col-span-2">Risk</div>
        <div className="col-span-1">Speed</div>
        <div className="col-span-2">Updated</div>
        <div className="col-span-1">Actions</div>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide divide-y divide-steel-grey/20">
        {pageOrders.map((order) => (
          <OrderTableRow
            key={order.id}
            order={order}
            onSelect={() => onOrderSelect?.(order.id)}
            onViewDetails={() => navigate(`/orders/${order.id}`)}
          />
        ))}
      </div>

      <div className="shrink-0 bg-obsidian/50 border-t border-steel-grey/30 px-4 py-2 text-[10px] text-mist flex items-center justify-between">
        <span>
          {pageOrders.length} of {displayTotal} orders · Sorted by {sortBy}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => goToPage(safePage - 1)}
              disabled={safePage <= 1}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy text-mist hover:text-pearl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const startPage = Math.max(1, Math.min(safePage - 2, totalPages - 4))
              const page = startPage + i
              if (page > totalPages) return null
              return (
                <button
                  key={page}
                  onClick={() => goToPage(page)}
                  className={clsx(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    page === safePage ? 'bg-accent text-white' : 'bg-navy text-mist hover:text-pearl'
                  )}
                >
                  {page}
                </button>
              )
            })}
            <button
              onClick={() => goToPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-navy text-mist hover:text-pearl disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface OrderTableRowProps {
  order: LiveOrder
  onSelect: () => void
  onViewDetails: () => void
}

const OrderTableRow: React.FC<OrderTableRowProps> = React.memo(({ order, onSelect, onViewDetails }) => {
  const progress = order.stops
    ? `${order.stops.filter((s) => s.status === 'completed').length}/${order.stops.length}`
    : '-'
  const isHighRisk = order.risk_score > 0.7
  const speedDisplay = order.current_position ? `${order.current_position.speed_kmh.toFixed(0)} km/h` : '-'
  const etaDisplay = new Date(order.current_eta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const updatedDisplay = formatTimeAgo(order.updated_at)

  return (
    <>
      <div
        className={clsx(
          'hidden lg:grid grid-cols-12 gap-4 px-4 py-3 hover:bg-navy/50 transition-colors cursor-pointer text-sm',
          isHighRisk && 'bg-critical-DEFAULT/5'
        )}
        onClick={onSelect}
      >
        <div className="col-span-2 font-mono font-semibold text-pearl truncate text-[12px]">{order.id}</div>
        <div className="col-span-1 text-mist truncate text-[12px]">{order.driver_id}</div>
        <div className="col-span-1 text-mist font-mono text-[12px]">{progress}</div>
        <div className="col-span-1 text-cloud font-mono text-[12px]">{etaDisplay}</div>
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <RiskBadge score={order.risk_score} size="sm" showLabel={false} />
            <div className="flex-1 bg-navy rounded-full h-1.5 overflow-hidden">
              <div
                className={clsx('h-full transition-all', riskBarColor(order.risk_score))}
                style={{ width: `${Math.min(order.risk_score * 100, 100)}%` }}
              />
            </div>
          </div>
        </div>
        <div className="col-span-1 text-mist text-right text-[12px]">{speedDisplay}</div>
        <div className="col-span-2 text-mist/60 text-right text-[11px]">{updatedDisplay}</div>
        <div className="col-span-1 text-right">
          <button
            onClick={(e) => { e.stopPropagation(); onViewDetails() }}
            className="px-2 py-1 bg-navy hover:bg-accent/20 text-mist hover:text-accent rounded text-[10px] font-medium transition-colors border border-steel-grey/30"
          >
            View
          </button>
        </div>
      </div>

      <div
        className="lg:hidden flex items-center justify-between px-4 py-3 hover:bg-navy/50 transition-colors cursor-pointer"
        onClick={onSelect}
      >
        <div className="flex items-center gap-3 min-w-0">
          <RiskBadge score={order.risk_score} size="sm" showLabel={false} />
          <div className="min-w-0">
            <p className="text-[12px] font-mono font-semibold text-pearl truncate">{order.id}</p>
            <p className="text-[10px] text-mist truncate">{order.driver_id} · {etaDisplay}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={clsx('text-[10px] font-medium', order.risk_score >= 0.7 ? 'text-critical-DEFAULT' : order.risk_score >= 0.3 ? 'text-warning-DEFAULT' : 'text-success-DEFAULT')}>
            {(order.risk_score * 100).toFixed(0)}%
          </span>
          <span className="text-[10px] text-mist">{speedDisplay}</span>
        </div>
      </div>
    </>
  )
})

function riskBarColor(score: number): string {
  if (score < 0.3) return 'bg-success-DEFAULT'
  if (score < 0.7) return 'bg-warning-DEFAULT'
  return 'bg-critical-DEFAULT'
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
