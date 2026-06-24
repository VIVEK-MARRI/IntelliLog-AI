'use client'

import { motion, useScroll, useTransform, useReducedMotion, type MotionValue } from 'framer-motion'
import {
  useRef, type ReactNode, type ElementType, type ComponentPropsWithoutRef,
} from 'react'
import { cn } from '@/lib/utils'

/* ----------------------------------
   Reveal — fade + rise on scroll into view
   ---------------------------------- */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  as = 'div',
  once = true,
  amount = 0.3,
}: {
  children: ReactNode
  className?: string
  delay?: number
  y?: number
  as?: ElementType
  once?: boolean
  amount?: number
}) {
  const reduce = useReducedMotion()
  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div
  return (
    <MotionTag
      className={className}
      initial={reduce ? false : { opacity: 0, y, filter: 'blur(6px)' }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, amount }}
      transition={{
        duration: 0.9,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </MotionTag>
  )
}

/* ----------------------------------
   Stagger — children reveal in sequence
   ---------------------------------- */
export function Stagger({
  children,
  className,
  gap = 0.08,
  amount = 0.3,
}: {
  children: ReactNode
  className?: string
  gap?: number
  amount?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: gap } },
      }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({
  children,
  className,
  y = 18,
}: {
  children: ReactNode
  className?: string
  y?: number
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className={className}
      variants={
        reduce
          ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
          : {
              hidden: { opacity: 0, y, filter: 'blur(4px)' },
              visible: {
                opacity: 1,
                y: 0,
                filter: 'blur(0px)',
                transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
              },
            }
      }
    >
      {children}
    </motion.div>
  )
}

/* ----------------------------------
   Parallax — translate Y based on scroll progress of target ref
   ---------------------------------- */
export function Parallax({
  children,
  className,
  speed = 0.3,
  targetRef,
}: {
  children: ReactNode
  className?: string
  speed?: number
  targetRef?: React.RefObject<HTMLElement | null>
}) {
  const localRef = useRef<HTMLDivElement>(null)
  const ref = targetRef ?? localRef
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: ref as React.RefObject<HTMLElement>,
    offset: ['start end', 'end start'],
  })
  const y = useTransform(scrollYProgress, [0, 1], [`${speed * 100}%`, `${-speed * 100}%`])
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div ref={localRef} className={className} style={{ y }}>
      {children}
    </motion.div>
  )
}

/* ----------------------------------
   ScrollScene — a sticky pinned section that maps its child
   content to the user's scroll progress through it.
   ---------------------------------- */
export function ScrollScene({
  children,
  className,
  heightClass = 'h-[300vh]',
  innerClass = 'h-screen',
}: {
  children: (progress: MotionValue<number>) => ReactNode
  className?: string
  heightClass?: string
  innerClass?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })
  return (
    <section ref={ref} className={cn('relative', heightClass, className)}>
      <div className={cn('sticky top-0 overflow-hidden', innerClass)}>
        {children(scrollYProgress)}
      </div>
    </section>
  )
}

/* ----------------------------------
   SectionLabel — eyebrow + index marker
   ---------------------------------- */
export function SectionLabel({
  index,
  children,
  className,
  tone = 'light',
}: {
  index: string
  children: ReactNode
  className?: string
  tone?: 'light' | 'dark'
}) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span
        className={cn(
          'font-mono text-[11px] tracking-[0.18em] uppercase',
          tone === 'light' ? 'text-[var(--slate)]' : 'text-white/55'
        )}
      >
        {index}
      </span>
      <span
        className={cn(
          'h-px w-8',
          tone === 'light'
            ? 'bg-[var(--slate)]/35'
            : 'bg-white/30'
        )}
      />
      <span
        className={cn(
          'font-mono text-[11px] tracking-[0.18em] uppercase',
          tone === 'light' ? 'text-[var(--slate)]' : 'text-white/55'
        )}
      >
        {children}
      </span>
    </div>
  )
}

/* ----------------------------------
   Button — refined enterprise button
   ---------------------------------- */
type ButtonProps = ComponentPropsWithoutRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'dark'
  size?: 'sm' | 'md' | 'lg'
  iconRight?: ReactNode
  iconLeft?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  iconRight,
  iconLeft,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    'group relative inline-flex items-center justify-center gap-2 rounded-full font-sans font-medium tracking-tight transition-all duration-300 focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap cursor-pointer'
  const sizes = {
    sm: 'h-9 px-4 text-[13px]',
    md: 'h-11 px-5 text-[14px]',
    lg: 'h-13 px-7 text-[15px] py-3.5',
  }
  const variants = {
    primary:
      'bg-[var(--navy)] text-[var(--porcelain)] hover:bg-[var(--navy-deep)] shadow-[0_1px_0_oklch(1_0_0/0.18)_inset,0_18px_40px_-20px_oklch(0.15_0.03_258/0.6)] hover:shadow-[0_1px_0_oklch(1_0_0/0.18)_inset,0_24px_50px_-18px_oklch(0.15_0.03_258/0.7)] hover:-translate-y-0.5',
    secondary:
      'bg-[var(--porcelain)] text-[var(--navy)] border border-[var(--border)] hover:border-[var(--slate)]/40 hover:bg-white shadow-[0_1px_0_oklch(1_0_0/0.9)_inset,0_8px_24px_-14px_oklch(0.22_0.04_255/0.18)] hover:-translate-y-0.5',
    ghost:
      'text-[var(--navy)] hover:bg-[var(--mist)]',
    dark:
      'bg-white/[0.08] text-white border border-white/15 backdrop-blur-md hover:bg-white/15 hover:-translate-y-0.5 shadow-[0_1px_0_oklch(1_0_0/0.1)_inset,0_18px_40px_-22px_oklch(0_0_0/0.6)]',
  }
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} {...props}>
      {iconLeft}
      <span>{children}</span>
      {iconRight && (
        <span className="transition-transform duration-300 group-hover:translate-x-0.5">
          {iconRight}
        </span>
      )}
    </button>
  )
}

/* ----------------------------------
   MagneticWrapper — subtle pointer parallax
   ---------------------------------- */
export function MagneticWrapper({
  children,
  className,
  strength = 8,
}: {
  children: ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  if (reduce) return <div className={className}>{children}</div>
  return (
    <motion.div
      ref={ref}
      className={cn('relative', className)}
      onMouseMove={(e) => {
        const el = ref.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const x = ((e.clientX - rect.left) / rect.width - 0.5) * strength
        const y = ((e.clientY - rect.top) / rect.height - 0.5) * strength
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }}
      onMouseLeave={() => {
        const el = ref.current
        if (el) el.style.transform = 'translate3d(0,0,0)'
      }}
      transition={{ type: 'spring', stiffness: 220, damping: 18 }}
    >
      {children}
    </motion.div>
  )
}

/* ----------------------------------
   ScrollProgress — top progress bar
   ---------------------------------- */
export function ScrollProgress({ className }: { className?: string }) {
  const { scrollYProgress } = useScroll()
  const scaleX = useTransform(scrollYProgress, [0, 1], [0, 1])
  return (
    <motion.div
      className={cn(
        'fixed left-0 right-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-[var(--navy)] via-[var(--teal)] to-[var(--amber)]',
        className
      )}
      style={{ scaleX }}
    />
  )
}
