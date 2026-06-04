/**
 * LoadingSpinner Component
 */

import React from 'react'
import clsx from 'clsx'

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  message?: string
  fullscreen?: boolean
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  message,
  fullscreen = false,
}) => {
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-12 h-12',
    lg: 'w-16 h-16',
  }

  const container = fullscreen
    ? 'fixed inset-0 flex items-center justify-center bg-slate-900 bg-opacity-50 z-50'
    : 'flex items-center justify-center'

  return (
    <div className={container}>
      <div className="flex flex-col items-center gap-3">
        <div className={clsx('animate-spin', sizeClasses[size])}>
          <div className="w-full h-full border-4 border-slate-700 border-t-op-warning rounded-full" />
        </div>
        {message && (
          <p className="text-sm text-slate-400 animate-pulse">{message}</p>
        )}
      </div>
    </div>
  )
}
