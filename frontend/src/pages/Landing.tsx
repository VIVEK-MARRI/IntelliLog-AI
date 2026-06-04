'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useMotionValue, useTransform, useSpring } from 'framer-motion'
import {
  MapPin,
  Lightning,
  ChartBar,
  ShieldCheck,
  ArrowsLeftRight,
  MagnifyingGlass,
  Globe,
  Cpu,
  Graph,
  ArrowRight,
  Play,
  PaperPlaneTilt,
  CaretRight,
  Star,
  CheckCircle,
  ArrowUpRight,
  Terminal,
  Database,
  Cloud,
  DeviceMobile,
} from '@phosphor-icons/react'
const GlobalGlobe = React.lazy(() => import('@/components/shared/GlobalGlobe'))

const useReducedMotion = () => {
  const mq = useRef<MediaQueryList | null>(null)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    mq.current = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.current.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.current.addEventListener('change', handler)
    return () => mq.current?.removeEventListener('change', handler)
  }, [])
  return reduced
}

const navLinks = [
  { label: 'Features', href: '#features' },
  { label: 'Architecture', href: '#architecture' },
]

const features = [
  {
    icon: MapPin,
    title: 'Real-Time Fleet Tracking',
    desc: 'Live GPS telemetry with sub-second latency across thousands of concurrent shipments worldwide.',
    span: 'lg:col-span-2 lg:row-span-2',
  },
  {
    icon: Lightning,
    title: 'AI Route Optimization',
    desc: 'OR-Tools powered engine that dynamically reroutes based on traffic, weather, and delivery windows.',
    span: 'lg:col-span-2 lg:row-span-1',
  },
  {
    icon: ChartBar,
    title: 'Predictive Analytics',
    desc: 'Forecast demand, detect anomalies, and surface actionable insights before issues arise.',
    span: 'lg:col-span-1 lg:row-span-1',
  },
  {
    icon: ShieldCheck,
    title: 'Driver Safety Monitoring',
    desc: 'Computer vision and telemetry fusion for real-time driver risk scoring.',
    span: 'lg:col-span-1 lg:row-span-1',
  },
  {
    icon: ArrowsLeftRight,
    title: 'Automated Dispatch',
    desc: 'Constraint-aware dispatch engine balancing cost, time, and driver HOS regulations.',
    span: 'lg:col-span-2 lg:row-span-1',
  },
  {
    icon: MagnifyingGlass,
    title: 'Operational Insights',
    desc: 'Unified dashboards with drill-down analytics across your entire logistics stack.',
    span: 'lg:col-span-2 lg:row-span-1',
  },
]

const companies = [
  { name: 'Polaris', icon: 'P' },
  { name: 'Atlas', icon: 'A' },
  { name: 'Meridian', icon: 'M' },
  { name: 'Summit', icon: 'S' },
  { name: 'Titan', icon: 'T' },
]

function AnimatedCounter({ target, suffix, label }: { target: number; suffix: string; label: string }) {
  const reduced = useReducedMotion()
  const count = useMotionValue(0)
  const rounded = useTransform(count, (v) => Math.round(v))
  useSpring(count, { stiffness: 40, damping: 15 })
  const [display, setDisplay] = useState(reduced ? target : 0)

  useEffect(() => {
    if (reduced) {
      setDisplay(target)
      return
    }
    const unsubscribe = rounded.on('change', (v) => setDisplay(v))
    count.set(target)
    return unsubscribe
  }, [target, reduced, count, rounded])

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="flex flex-col"
    >
      <div className="flex items-baseline gap-0.5">
        <motion.span
          initial={false}
          className="text-5xl font-bold tracking-tight text-white lg:text-6xl"
          style={{ fontFamily: 'Geist, sans-serif' }}
        >
          {display}
          <span className="text-[#3B82F6]">{suffix}</span>
        </motion.span>
      </div>
      <span className="mt-1 text-sm text-[#5A6B8A] lg:text-base">{label}</span>
    </motion.div>
  )
}

function TypewriterDots() {
  const reduced = useReducedMotion()
  const [dots, setDots] = useState('')
  useEffect(() => {
    if (reduced) { setDots('...'); return }
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'))
    }, 500)
    return () => clearInterval(interval)
  }, [reduced])
  return <span className="text-[#3B82F6]">{dots}</span>
}

function ArchitectureNode({
  icon: Icon,
  label,
  description,
  index,
}: {
  icon: React.ElementType
  label: string
  description: string
  index: number
}) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? {} : { opacity: 0, scale: 0.85 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      className="relative flex flex-col items-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-[#2A3A5C] bg-[#0F1729] shadow-lg shadow-[#3B82F6]/5 lg:h-20 lg:w-20">
        <Icon className="h-7 w-7 text-[#3B82F6] lg:h-8 lg:w-8" weight="duotone" />
      </div>
      <span className="mt-3 text-sm font-semibold text-white lg:text-base">{label}</span>
      <span className="mt-0.5 text-xs text-[#5A6B8A]">{description}</span>
    </motion.div>
  )
}

function ConnectionLine({ index }: { index: number }) {
  const reduced = useReducedMotion()
  return (
    <motion.div
      initial={reduced ? {} : { scaleX: 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.3 + index * 0.15, duration: 0.5, ease: 'easeOut' }}
      className="hidden h-px origin-left bg-gradient-to-r from-[#2A3A5C] via-[#3B82F6]/40 to-[#2A3A5C] lg:block"
    />
  )
}

const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.1 * i, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] as const },
  }),
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
}

/* function useIsInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setInView(true); obs.disconnect() }
      },
      { threshold: 0.2, ...options },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [options])
  return [ref, inView] as const
} */

function Landing() {
  const reduced = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <div className="min-h-screen bg-[#0A0F1A] text-[#CBD5E1]" style={{ fontFamily: 'Geist, sans-serif' }}>
      <nav
        className={`fixed left-0 right-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'border-b border-[#2A3A5C]/40 bg-[#0A0F1A]/80 shadow-lg shadow-black/20 backdrop-blur-xl'
            : 'bg-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:h-20">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B82F6] lg:h-9 lg:w-9">
              <Globe className="h-5 w-5 text-white lg:h-5 lg:w-5" weight="bold" />
            </div>
            <span className="text-lg font-bold tracking-tight text-white lg:text-xl">
              Intelli<span className="text-[#3B82F6]">Log</span>
            </span>
          </div>
          <div className="hidden items-center gap-8 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-[#5A6B8A] transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="hidden rounded-lg border border-[#2A3A5C] px-4 py-2 text-sm font-medium text-[#CBD5E1] transition-colors hover:border-[#3B82F6] hover:text-white lg:block">
              Sign In
            </button>
            <button onClick={() => navigate('/login')} className="rounded-lg bg-[#3B82F6] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2563EB] hover:shadow-lg hover:shadow-[#3B82F6]/25 lg:px-5">
              Get Started
            </button>
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="flex flex-col gap-1 lg:hidden"
            >
              <span className={`block h-0.5 w-5 bg-[#CBD5E1] transition-all ${mobileOpen ? 'translate-y-1.5 rotate-45' : ''}`} />
              <span className={`block h-0.5 w-5 bg-[#CBD5E1] transition-all ${mobileOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-5 bg-[#CBD5E1] transition-all ${mobileOpen ? '-translate-y-1.5 -rotate-45' : ''}`} />
            </button>
          </div>
        </div>
        <motion.div
          initial={false}
          animate={mobileOpen ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
          className="overflow-hidden border-t border-[#2A3A5C]/40 backdrop-blur-xl lg:hidden"
        >
          <div className="flex flex-col gap-2 px-4 py-4">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm text-[#5A6B8A] transition-colors hover:bg-[#0F1729] hover:text-white"
              >
                {link.label}
              </a>
            ))}
            <button onClick={() => { setMobileOpen(false); navigate('/login') }} className="mt-2 rounded-lg border border-[#2A3A5C] px-3 py-2 text-sm text-[#CBD5E1] transition-colors hover:border-[#3B82F6]">
              Sign In
            </button>
          </div>
        </motion.div>
      </nav>

      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 pt-20">
        <div className="absolute inset-0 z-0">
          <React.Suspense fallback={<div className="w-full h-full bg-gradient-to-b from-accent/5 to-obsidian" />}>
            <GlobalGlobe />
          </React.Suspense>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0A0F1A]/10 via-transparent to-[#0A0F1A]/90 z-[1]" />
        <div className="relative z-10 mx-auto max-w-5xl text-center">
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2A3A5C]/60 bg-[#0F1729]/60 px-4 py-1.5 text-xs font-medium text-[#0EA5E9] backdrop-blur-sm"
          >
            <Star className="h-3 w-3" weight="fill" />
            Now available — IntelliLog-AI 3.0
          </motion.div>
          <motion.h1
            initial={reduced ? {} : { opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl md:text-6xl lg:text-7xl"
          >
            AI-Powered Logistics
            <br />
            <span className="bg-gradient-to-r from-[#3B82F6] via-[#0EA5E9] to-[#3B82F6] bg-clip-text text-transparent">
              Intelligence Platform
            </span>
          </motion.h1>
          <motion.p
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-[#5A6B8A] sm:text-lg lg:text-xl"
          >
            Real-Time Fleet Operations, Predictive Routing, and Autonomous Decision Intelligence
          </motion.p>
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
            className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <button onClick={() => navigate('/login')} className="group inline-flex h-12 items-center gap-2 rounded-xl bg-[#3B82F6] px-6 text-sm font-semibold text-white transition-all hover:bg-[#2563EB] hover:shadow-lg hover:shadow-[#3B82F6]/30 lg:h-14 lg:px-8 lg:text-base">
              Launch Platform
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" weight="bold" />
            </button>
            <button onClick={() => scrollTo('architecture')} className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#2A3A5C] px-6 text-sm font-semibold text-[#CBD5E1] transition-all hover:border-[#3B82F6]/50 hover:bg-[#0F1729]/80 lg:h-14 lg:px-8 lg:text-base">
              <Play className="h-4 w-4" weight="fill" />
              View Architecture
            </button>
          </motion.div>
          <motion.div
            initial={reduced ? {} : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="mt-12 flex items-center justify-center gap-6 text-xs text-[#5A6B8A] sm:text-sm"
          >
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-[#0EA5E9]" weight="fill" />
              SOC 2 Compliant
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-[#0EA5E9]" weight="fill" />
              99.9% Uptime
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-[#0EA5E9]" weight="fill" />
              Real-Time Data
            </span>
          </motion.div>
        </div>
        <motion.div
          initial={reduced ? {} : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-8 z-10"
        >
          <motion.div
            animate={reduced ? {} : { y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <CaretRight className="h-5 w-5 rotate-90 text-[#5A6B8A]" />
          </motion.div>
        </motion.div>
      </section>

      <section className="relative border-t border-[#2A3A5C]/30 px-4 py-16 sm:px-6 lg:py-20">
        <div className="mx-auto max-w-7xl">
          <motion.p
            initial={reduced ? {} : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-10 text-center text-sm font-medium uppercase tracking-widest text-[#5A6B8A]"
          >
            Trusted by leading logistics teams
          </motion.p>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 lg:gap-x-20"
          >
            {companies.map((c) => (
              <motion.div
                key={c.name}
                variants={staggerItem}
                custom={companies.indexOf(c)}
                className="flex items-center gap-3 opacity-60 grayscale transition-all hover:opacity-100 hover:grayscale-0"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#2A3A5C] bg-[#0F1729] text-sm font-bold text-white">
                  {c.icon}
                </div>
                <span className="text-lg font-semibold tracking-tight text-white">{c.name}</span>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <section id="features" className="px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2A3A5C]/60 bg-[#0F1729]/60 px-4 py-1.5 text-xs font-medium text-[#0EA5E9]"
          >
            <Lightning className="h-3 w-3" weight="fill" />
            Platform Capabilities
          </motion.div>
          <motion.h2
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Everything you need to
            <br />
            <span className="text-[#3B82F6]">run logistics at scale</span>
          </motion.h2>
          <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={reduced ? {} : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * i, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
                className={`group relative overflow-hidden rounded-2xl border border-[#2A3A5C] bg-[#0F1729] p-6 transition-all hover:border-[#3B82F6]/40 hover:shadow-lg hover:shadow-[#3B82F6]/5 ${f.span}`}
              >
                <div className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-[#3B82F6]/5 blur-2xl transition-all group-hover:bg-[#3B82F6]/10" />
                <div className="relative z-10">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-[#2A3A5C] bg-[#0A0F1A]">
                    <f.icon className="h-5 w-5 text-[#3B82F6]" weight="duotone" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold text-white">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-[#5A6B8A]">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-[#2A3A5C]/30 px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <motion.div
              initial={reduced ? {} : { opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2A3A5C]/60 bg-[#0F1729]/60 px-4 py-1.5 text-xs font-medium text-[#0EA5E9]">
                <Lightning className="h-3 w-3" weight="fill" />
                OR-Tools Powered Engine
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Route Optimization
                <br />
                <span className="text-[#3B82F6]">at machine speed</span>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-[#5A6B8A] lg:text-lg">
                Our constraint-satisfaction engine processes millions of route permutations in milliseconds.
                Powered by Google OR-Tools with proprietary neural heuristics for real-world logistics constraints
                — HOS regulations, weather windows, traffic patterns, and delivery priority tiers.
              </p>
              <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
                <AnimatedCounter target={40} suffix="%" label="Faster Routes" />
                <AnimatedCounter target={25} suffix="%" label="Fuel Savings" />
                <AnimatedCounter target={999} suffix="‰" label="Uptime" />
              </div>
              <motion.div
                initial={reduced ? {} : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 }}
                className="mt-8 flex items-center gap-2 text-sm text-[#3B82F6]"
              >
                <ArrowUpRight className="h-4 w-4" weight="bold" />
                <span className="font-medium">View optimization benchmarks</span>
              </motion.div>
            </motion.div>
            <motion.div
              initial={reduced ? {} : { opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative"
            >
              <div className="rounded-2xl border border-[#2A3A5C] bg-[#0F1729] p-6 lg:p-8">
                <div className="mb-6 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#5A6B8A]">Before — Standard Routing</span>
                  <span className="rounded-md bg-[#F59E0B]/10 px-2 py-0.5 text-xs font-medium text-[#F59E0B]">+42% Cost</span>
                </div>
                <div className="mb-6 space-y-3">
                  {[
                    { label: 'Distance', before: '847 mi', after: '512 mi' },
                    { label: 'Duration', before: '14h 22m', after: '8h 15m' },
                    { label: 'Fuel Cost', before: '$1,247', after: '$738' },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center justify-between border-b border-[#2A3A5C]/40 pb-2 last:border-0">
                      <span className="text-sm text-[#5A6B8A]">{row.label}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-[#F59E0B] line-through">{row.before}</span>
                        <span className="text-sm font-semibold text-[#0EA5E9]">{row.after}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t border-[#2A3A5C]/40 pt-6">
                  <span className="text-xs font-medium uppercase tracking-wider text-[#5A6B8A]">After — AI Optimized</span>
                  <div className="mt-4 flex items-baseline justify-between">
                    <span className="text-4xl font-bold text-[#0EA5E9]">-39%</span>
                    <span className="text-sm text-[#5A6B8A]">Total cost reduction</span>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#2A3A5C]">
                    <motion.div
                      initial={reduced ? {} : { width: 0 }}
                      whileInView={{ width: '61%' }}
                      viewport={{ once: true }}
                      transition={{ duration: 1.2, ease: 'easeOut' }}
                      className="h-full rounded-full bg-gradient-to-r from-[#3B82F6] to-[#0EA5E9]"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section className="px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
            <motion.div
              initial={reduced ? {} : { opacity: 0, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-2 lg:order-1"
            >
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2A3A5C]/60 bg-[#0F1729]/60 px-4 py-1.5 text-xs font-medium text-[#0EA5E9]">
                <Cpu className="h-3 w-3" weight="fill" />
                IntelliLog Copilot
              </div>
              <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Natural Language
                <br />
                <span className="text-[#3B82F6]">Operations</span>
              </h2>
              <p className="mt-6 text-base leading-relaxed text-[#5A6B8A] lg:text-lg">
                Interrogate your entire logistics stack in plain English. The Copilot understands context,
                fleet state, weather impacts, and compliance rules — delivering answers, not data dumps.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  'Which drivers are approaching HOS limits on the Denver route?',
                  'Reroute all California shipments avoiding I-5 due to weather.',
                  'Show me predicted ETA variance for the Northeast corridor.',
                ].map((q, i) => (
                  <motion.div
                    key={q}
                    initial={reduced ? {} : { opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="flex items-start gap-3 rounded-lg border border-[#2A3A5C]/50 bg-[#0F1729]/50 px-4 py-3"
                  >
                    <PaperPlaneTilt className="mt-0.5 h-4 w-4 shrink-0 text-[#3B82F6]" />
                    <span className="text-sm text-[#CBD5E1]">{q}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
            <motion.div
              initial={reduced ? {} : { opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="order-1 lg:order-2"
            >
              <div className="overflow-hidden rounded-2xl border border-[#2A3A5C] bg-[#0F1729]">
                <div className="flex items-center gap-2 border-b border-[#2A3A5C] px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#0EA5E9]" />
                  </div>
                  <span className="ml-2 text-xs text-[#5A6B8A]">IntelliLog Copilot — Session Active</span>
                </div>
                <div className="space-y-4 p-4 lg:p-6">
                  <motion.div
                    initial={reduced ? {} : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="flex justify-start"
                  >
                    <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-[#2A3A5C] bg-[#0A0F1A] px-4 py-3">
                      <p className="text-sm text-[#CBD5E1]">
                        Show me the current fleet status on the West Coast with ETA anomalies.
                      </p>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={reduced ? {} : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.5 }}
                    className="flex justify-end"
                  >
                    <div className="max-w-[90%] rounded-2xl rounded-tr-md border border-[#3B82F6]/30 bg-[#3B82F6]/10 px-4 py-3">
                      <div className="mb-2 flex items-center gap-1.5">
                        <Cpu className="h-3.5 w-3.5 text-[#3B82F6]" weight="fill" />
                        <span className="text-xs font-medium text-[#3B82F6]">Copilot</span>
                      </div>
                      <p className="text-sm leading-relaxed text-[#CBD5E1]">
                        47 active units on the West Coast. 3 ETA anomalies detected:
                        <br />— Truck 442: +38 min (I-5 congestion, Seattle)
                        <br />— Truck 871: +22 min (port delay, Oakland)
                        <br />— Truck 293: -12 min (ahead of schedule, LA)
                        <br />
                        <span className="mt-1 inline-flex items-center gap-1 text-[#0EA5E9]">
                          <ArrowUpRight className="h-3 w-3" weight="bold" />
                          Reroute recommendations available
                        </span>
                      </p>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={reduced ? {} : { opacity: 0, y: 8 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 1 }}
                    className="flex justify-start"
                  >
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-[#2A3A5C] bg-[#0A0F1A] px-4 py-3">
                      <Terminal className="h-4 w-4 text-[#3B82F6]" />
                      <span className="text-sm text-[#CBD5E1]">Optimize those routes</span>
                      <TypewriterDots />
                    </div>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      <section id="architecture" className="border-t border-[#2A3A5C]/30 px-4 py-16 sm:px-6 lg:py-24">
        <div className="mx-auto max-w-7xl">
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#2A3A5C]/60 bg-[#0F1729]/60 px-4 py-1.5 text-xs font-medium text-[#0EA5E9]"
          >
            <Graph className="h-3 w-3" weight="fill" />
            System Architecture
          </motion.div>
          <motion.h2
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Built for <span className="text-[#3B82F6]">enterprise scale</span>
          </motion.h2>
          <motion.p
            initial={reduced ? {} : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="mt-4 max-w-xl text-base text-[#5A6B8A] lg:text-lg"
          >
            From telemetry ingestion to real-time decision delivery — every layer is designed for
            sub-second latency and fault tolerance.
          </motion.p>
          <div className="mt-16">
            <div className="flex flex-col items-center gap-2 lg:flex-row lg:justify-between">
              <ArchitectureNode icon={DeviceMobile} label="Edge" description="GPS &amp; IoT Devices" index={0} />
              <ConnectionLine index={0} />
              <ArchitectureNode icon={Database} label="Ingestion" description="Stream Processing" index={1} />
              <ConnectionLine index={1} />
              <ArchitectureNode icon={Cloud} label="API Layer" description="REST &amp; WebSocket" index={2} />
              <ConnectionLine index={2} />
              <ArchitectureNode icon={Cpu} label="ML Engine" description="OR-Tools &amp; Neural Nets" index={3} />
              <ConnectionLine index={3} />
              <ArchitectureNode icon={ChartBar} label="Dashboard" description="Real-Time UI" index={4} />
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden px-4 py-16 sm:px-6 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#3B82F6]/5 via-transparent to-[#0EA5E9]/5" />
        <div className="pointer-events-none absolute -left-32 -top-32 h-64 w-64 rounded-full bg-[#3B82F6]/10 blur-[100px]" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-64 w-64 rounded-full bg-[#0EA5E9]/10 blur-[100px]" />
        <div className="relative mx-auto max-w-4xl text-center">
          <motion.h2
            initial={reduced ? {} : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-5xl"
          >
            Ready to transform your
            <br />
            <span className="text-[#3B82F6]">logistics operations?</span>
          </motion.h2>
          <motion.p
            initial={reduced ? {} : { opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="mx-auto mt-6 max-w-lg text-base text-[#5A6B8A] lg:text-lg"
          >
            Join thousands of logistics teams using IntelliLog-AI to reduce costs, improve service levels,
            and automate decision-making.
          </motion.p>
          <motion.div
            initial={reduced ? {} : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.25 }}
            className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row"
          >
            <button onClick={() => navigate('/login')} className="group inline-flex h-12 items-center gap-2 rounded-xl bg-[#3B82F6] px-8 text-sm font-semibold text-white transition-all hover:bg-[#2563EB] hover:shadow-lg hover:shadow-[#3B82F6]/30 lg:h-14 lg:text-base">
              Get started free
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" weight="bold" />
            </button>
            <span className="inline-flex h-12 items-center gap-2 rounded-xl border border-[#2A3A5C] px-8 text-sm font-semibold text-[#5A6B8A] opacity-50 lg:h-14 lg:text-base">
              Talk to sales
            </span>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-[#2A3A5C]/30 px-4 py-10 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#3B82F6]">
              <Globe className="h-4 w-4 text-white" weight="bold" />
            </div>
            <span className="text-sm font-bold text-white">
              Intelli<span className="text-[#3B82F6]">Log</span>
            </span>
          </div>
          <div className="flex items-center gap-6">
            <span className="text-xs text-[#5A6B8A]">Privacy</span>
            <span className="text-xs text-[#5A6B8A]">Terms</span>
            <span className="text-xs text-[#5A6B8A]">Status</span>
            <span className="text-xs text-[#5A6B8A]">Docs</span>
          </div>
          <span className="text-xs text-[#5A6B8A]">&copy; {new Date().getFullYear()} IntelliLog-AI, Inc.</span>
        </div>
      </footer>
    </div>
  )
}

export default Landing
export { Landing }
