import React from 'react'
import clsx from 'clsx'

interface SkeletonProps {
  className?: string
  variant?: 'text' | 'circular' | 'rectangular'
  width?: string | number
  height?: string | number
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'text',
  width,
  height,
}) => {
  const baseClass = 'skeleton animate-shimmer'

  const variantClass = {
    text: 'h-4 w-full rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-lg',
  }

  return (
    <div
      className={clsx(baseClass, variantClass[variant], className)}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
}

export const CardSkeleton: React.FC = () => (
  <div className="rounded-xl p-4 bg-abyss border border-steel-grey/40 space-y-3">
    <div className="flex items-center justify-between">
      <Skeleton variant="circular" width={36} height={36} />
      <Skeleton variant="text" width={48} height={16} />
    </div>
    <Skeleton variant="text" width={64} height={12} />
    <Skeleton variant="text" width={96} height={24} />
  </div>
)

export const TableSkeleton: React.FC<{ rows?: number }> = ({ rows = 5 }) => (
  <div className="space-y-3">
    <div className="flex gap-4 p-3">
      <Skeleton variant="text" className="flex-1" height={12} />
      <Skeleton variant="text" className="flex-1" height={12} />
      <Skeleton variant="text" className="flex-1" height={12} />
      <Skeleton variant="text" className="w-20" height={12} />
    </div>
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4 p-3 border-t border-steel-grey/20">
        <Skeleton variant="text" className="flex-1" height={14} />
        <Skeleton variant="text" className="flex-1" height={14} />
        <Skeleton variant="text" className="flex-1" height={14} />
        <Skeleton variant="text" className="w-20" height={14} />
      </div>
    ))}
  </div>
)

export const DashboardSkeleton: React.FC = () => (
  <div className="h-screen flex flex-col bg-obsidian p-6 gap-4">
    <div className="grid grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
    <Skeleton variant="rectangular" className="flex-1" />
    <Skeleton variant="rectangular" height={200} />
  </div>
)
