import React from 'react'
import clsx from 'clsx'

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  compact?: boolean
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  compact = false,
}) => (
  <div
    className={clsx(
      'flex flex-col items-center justify-center',
      compact ? 'py-8' : 'py-16'
    )}
  >
    {icon && (
      <div className="w-12 h-12 rounded-full bg-navy flex items-center justify-center mb-4 text-mist">
        {icon}
      </div>
    )}
    <h3 className="text-sm font-semibold text-pearl text-center">{title}</h3>
    {description && (
      <p className="text-xs text-mist mt-1 text-center max-w-xs">{description}</p>
    )}
    {action && (
      <button
        onClick={action.onClick}
        className={clsx(
          'mt-4 inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg',
          'bg-accent text-white hover:bg-accent-hover',
          'transition-all duration-150 active:scale-[0.98]'
        )}
      >
        {action.label}
      </button>
    )}
  </div>
)
