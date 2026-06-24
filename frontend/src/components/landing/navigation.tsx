'use client'

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './primitives'

const NAV_LINKS = [
  { label: 'How it works', href: '#how-it-works' },
  { label: 'Mission Control', href: '#mission-control' },
  { label: 'Intelligence', href: '#intelligence-layer' },
  { label: 'Trust', href: '#trust' },
  { label: 'Performance', href: '#performance' },
]

export function Navigation() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const launchApp = () => {
    setMobileOpen(false)
    navigate('/app')
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <motion.header
        initial={{ y: -32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'fixed inset-x-0 top-0 z-50 transition-all duration-500',
          scrolled
            ? 'py-2.5'
            : 'py-4'
        )}
      >
        <div
          className={cn(
            'mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 transition-all duration-500 sm:px-8',
            scrolled && 'max-w-6xl'
          )}
        >
          <a
            href="#top"
            className={cn(
              'group flex items-center gap-2.5 rounded-full px-3 py-1.5 transition-all duration-500',
              scrolled && 'glass-card'
            )}
            aria-label="IntelliLog-AI home"
          >
            <BrandMark />
            <span className="hidden font-display text-[17px] font-medium tracking-tight text-[var(--navy)] sm:block">
              IntelliLog<span className="text-[var(--teal)]">-AI</span>
            </span>
          </a>

          <nav
            className={cn(
              'hidden items-center gap-1 rounded-full px-2 py-1.5 transition-all duration-500 md:flex',
              scrolled ? 'glass-card' : 'bg-[var(--mist)]/60 backdrop-blur-sm'
            )}
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[var(--slate)] transition-colors duration-200 hover:bg-white/70 hover:text-[var(--navy)]"
              >
                {link.label}
              </a>
            ))}
            <button
              type="button"
              onClick={launchApp}
              className="rounded-full px-3.5 py-1.5 text-[13px] font-medium text-[var(--navy)] transition-colors duration-200 hover:bg-white/70 hover:text-[var(--teal)]"
            >
              Launch App
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <div className={cn('transition-all duration-500', scrolled && 'glass-card rounded-full p-1')}>
              <Button size="sm" className="hidden sm:inline-flex" onClick={launchApp}>
                Launch Mission Control
              </Button>
              <Button size="sm" className="sm:hidden" onClick={launchApp}>Launch</Button>
            </div>

            <button
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle menu"
              className="glass-card flex h-10 w-10 items-center justify-center rounded-full md:hidden"
            >
              <div className="flex flex-col gap-1.5">
                <span className={cn('h-px w-4 bg-[var(--navy)] transition-all', mobileOpen && 'translate-y-[3.5px] rotate-45')} />
                <span className={cn('h-px w-4 bg-[var(--navy)] transition-all', mobileOpen && 'opacity-0')} />
                <span className={cn('h-px w-4 bg-[var(--navy)] transition-all', mobileOpen && '-translate-y-[3.5px] -rotate-45')} />
              </div>
            </button>
          </div>
        </div>
      </motion.header>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-x-4 top-20 z-40 md:hidden"
          >
            <div className="glass-card rounded-2xl p-3">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-4 py-3 text-[15px] font-medium text-[var(--navy)] hover:bg-[var(--mist)]"
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                onClick={launchApp}
                className="block w-full rounded-xl px-4 py-3 text-left text-[15px] font-medium text-[var(--navy)] hover:bg-[var(--mist)]"
              >
                Launch App
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="32" y2="32">
          <stop offset="0%" stopColor="oklch(0.22 0.04 255)" />
          <stop offset="60%" stopColor="oklch(0.40 0.07 220)" />
          <stop offset="100%" stopColor="oklch(0.50 0.07 195)" />
        </linearGradient>
      </defs>
      {/* outer ring — orbit */}
      <circle cx="16" cy="16" r="13" stroke="url(#brand-grad)" strokeWidth="1.2" opacity="0.45" />
      {/* inner core — operational diamond */}
      <path
        d="M16 6 L26 16 L16 26 L6 16 Z"
        fill="url(#brand-grad)"
      />
      {/* cross-axis — telemetry */}
      <path d="M16 10 L16 22 M10 16 L22 16" stroke="oklch(0.965 0.008 75)" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="16" cy="16" r="2.2" fill="oklch(0.74 0.12 80)" />
    </svg>
  )
}
