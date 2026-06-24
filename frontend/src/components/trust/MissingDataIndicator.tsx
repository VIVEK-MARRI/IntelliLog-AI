import clsx from 'clsx'
import { WarningCircle, EyeClosed } from '@phosphor-icons/react'

interface MissingDataIndicatorProps {
  fields: string[]
  message?: string
  variant?: 'inline' | 'banner'
  className?: string
}

export const MissingDataIndicator: React.FC<MissingDataIndicatorProps> = ({
  fields, message, variant = 'inline', className,
}) => {
  if (fields.length === 0) return null

  const label = message || `${fields.length} field${fields.length !== 1 ? 's' : ''} missing`

  if (variant === 'banner') {
    return (
      <div className={clsx(
        'flex items-start gap-2 px-3 py-2 rounded-lg bg-warning-bg border border-warning-border',
        className,
      )}>
        <WarningCircle size={14} className="text-warning shrink-0 mt-0.5" weight="fill" />
        <div>
          <p className="text-[11px] text-warning font-medium">{label}</p>
          <div className="flex flex-wrap gap-1 mt-1">
            {fields.map((f) => (
              <span key={f} className="text-[9px] text-mist/80 bg-navy/50 px-1.5 py-0.5 rounded font-mono">{f}</span>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <span className={clsx('inline-flex items-center gap-1 text-[10px] text-warning', className)} title={fields.join(', ')}>
      <EyeClosed size={11} weight="fill" />
      <span>{label}</span>
    </span>
  )
}
