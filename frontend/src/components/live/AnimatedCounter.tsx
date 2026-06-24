import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface AnimatedCounterProps {
  value: number
  format?: (v: number) => string
  duration?: number
  className?: string
  color?: string
}

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  value, format, duration = 400, className, color,
}) => {
  const [display, setDisplay] = useState(value)
  const frameRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const fromRef = useRef<number>(value)

  useEffect(() => {
    const from = fromRef.current
    const diff = value - from
    if (diff === 0) return

    startRef.current = performance.now()
    fromRef.current = value

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      const eased = progress < 0.5 ? 2 * progress * progress : -1 + (4 - 2 * progress) * progress
      setDisplay(from + diff * eased)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [value, duration])

  const formatted = format ? format(display) : display.toLocaleString()

  return (
    <span className={clsx('tabular-nums', className)} style={color ? { color } : undefined}>
      {formatted}
    </span>
  )
}
