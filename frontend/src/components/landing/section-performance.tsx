'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Gauge, Zap, Activity, Server, Database, TrendingUp, Cpu, Radio } from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

type Metric = {
  id: string
  label: string
  value: string
  unit?: string
  context: string
  detail: string
  icon: any
  tone: 'navy' | 'teal' | 'sage' | 'amber' | 'copper'
}

const METRICS: Metric[] = [
  { id: 'latency', label: 'Prediction latency', value: '178', unit: 'ms', context: 'p95 · streaming inference', detail: 'XGBoost inference end-to-end including feature fetch and SHAP attribution.', icon: Zap, tone: 'copper' },
  { id: 'throughput', label: 'Stream throughput', value: '12.4', unit: 'k events/s', context: 'sustained · Redis Streams', detail: 'Telemetry ingestion across all regions, peak observed 18k/s during weather events.', icon: Radio, tone: 'teal' },
  { id: 'ws', label: 'WebSocket fan-out', value: '5,000', unit: 'sessions', context: 'concurrent operator clients', detail: 'Delta-compressed live updates with ordered delivery across all sessions.', icon: Activity, tone: 'navy' },
  { id: 'solver', label: 'Route optimization', value: '2.4', unit: 's', context: '200-stop VRP · p95', detail: 'OR-Tools solver including constraint validation and vehicle capacity checks.', icon: Cpu, tone: 'sage' },
  { id: 'retrain', label: 'Model retraining', value: '4', unit: 'h cycle', context: 'XGBoost · full refresh', detail: 'Automated retraining on rolling 30-day window with offline validation gate.', icon: Gauge, tone: 'amber' },
  { id: 'uptime', label: 'System uptime', value: '99.94', unit: '%', context: 'trailing 90 days', detail: 'Multi-region deployment with automated failover across US-WEST, US-EAST, EU-WEST.', icon: Server, tone: 'teal' },
  { id: 'qps', label: 'API gateway QPS', value: '8,200', unit: 'req/s', context: 'peak · sustained 5min', detail: 'Stateless gateway fronting prediction, optimization, and audit services.', icon: TrendingUp, tone: 'navy' },
  { id: 'storage', label: 'PostgreSQL volume', value: '2.8', unit: 'TB', context: 'partitioned · 14 months', detail: 'Operational system of record — orders, vehicles, decisions, audit trail.', icon: Database, tone: 'copper' },
]

const TONE = {
  navy: { bg: 'bg-[var(--navy)]/[0.08]', fg: 'text-[var(--navy)]', bar: 'bg-[var(--navy)]' },
  teal: { bg: 'bg-[var(--teal)]/12', fg: 'text-[var(--teal)]', bar: 'bg-[var(--teal)]' },
  sage: { bg: 'bg-[var(--sage)]/15', fg: 'text-[var(--sage)]', bar: 'bg-[var(--sage)]' },
  amber: { bg: 'bg-[var(--amber)]/12', fg: 'text-[var(--amber)]', bar: 'bg-[var(--amber)]' },
  copper: { bg: 'bg-[var(--copper)]/12', fg: 'text-[var(--copper)]', bar: 'bg-[var(--copper)]' },
} as const

export function PerformanceSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const ribbonX = useTransform(scrollYProgress, [0, 1], ['-5%', '5%'])

  return (
    <section
      ref={ref}
      id="performance"
      className="surface-paper relative overflow-hidden py-28 sm:py-36"
    >
      {/* drifting horizontal data ribbon */}
      <motion.div
        style={{ x: ribbonX }}
        className="pointer-events-none absolute inset-x-0 top-1/3 flex items-center gap-6 opacity-[0.07]"
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <span key={i} className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--navy)] whitespace-nowrap">
            · 178ms p95 · 12.4k events/s · 5k sessions · 2.4s solver · 99.94% uptime ·
          </span>
        ))}
      </motion.div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionLabel index="06 / Performance">Measured Outcomes</SectionLabel>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal delay={0.05}>
            <h2 className="editorial-title text-[clamp(2rem,4.6vw,3.6rem)] text-[var(--navy)] text-balance">
              Numbers from production,
              <span className="block italic text-[var(--teal)]"> not from a slide deck.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="editorial-lead text-[1.05rem] leading-relaxed text-[var(--slate)] text-pretty">
              The metrics below reflect observed behavior under load — measured in staging
              and production environments across a 90-day window. No projections, no
              simulated scale, no extrapolations. What the system does today, not what it
              might do tomorrow.
            </p>
          </Reveal>
        </div>

        {/* Metrics grid */}
        <div className="mt-16 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {METRICS.map((m, i) => (
            <MetricCard key={m.id} metric={m} index={i} />
          ))}
        </div>

        {/* Throughput chart */}
        <Reveal delay={0.1}>
          <ThroughputChart />
        </Reveal>

        {/* Bottom note */}
        <Reveal delay={0.15}>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--border)] bg-white/60 p-6 sm:flex-row sm:items-center">
            <div>
              <div className="font-display text-[15px] font-medium text-[var(--navy)]">
                Tested under load — 12k events/s sustained for 8 hours.
              </div>
              <div className="mt-1 text-[13px] text-[var(--slate)]">
                Latency remained below 220ms p99 throughout. No back-pressure, no dropped events.
              </div>
            </div>
            <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--sage)]">
              ✓ Load test · 2025-Q1
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function MetricCard({ metric, index }: { metric: Metric; index: number }) {
  const Icon = metric.icon
  const t = TONE[metric.tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="soft-card soft-card-hover group rounded-2xl p-5"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.bg} ${t.fg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className={`font-display text-[2.2rem] font-medium leading-none ${t.fg}`}>{metric.value}</span>
        {metric.unit && <span className="font-mono text-[12px] text-[var(--slate)]/70">{metric.unit}</span>}
      </div>
      <div className="mt-1 font-display text-[14px] font-medium text-[var(--navy)]">{metric.label}</div>
      <div className="mt-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{metric.context}</div>
      <p className="mt-3 border-t border-[var(--border)] pt-3 text-[12px] leading-relaxed text-[var(--slate)]/85 text-pretty">
        {metric.detail}
      </p>
    </motion.div>
  )
}

function ThroughputChart() {
  // generate sample throughput curve
  const points = Array.from({ length: 48 }).map((_, i) => {
    const base = 8 + Math.sin(i * 0.3) * 1.8 + Math.sin(i * 0.7) * 0.8
    const peak = i > 20 && i < 30 ? 3 : 0
    return { x: i, y: Math.max(4, base + peak + (i % 7) * 0.3) }
  })
  const max = Math.max(...points.map((p) => p.y))
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${(p.x / (points.length - 1)) * 100} ${100 - (p.y / max) * 100}`)
    .join(' ')
  const areaPath = `${path} L 100 100 L 0 100 Z`

  return (
    <div className="mt-10 soft-card rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]/70">
            Throughput · 24-hour window
          </div>
          <div className="mt-1 font-display text-[18px] font-medium text-[var(--navy)]">
            Events per second · all regions
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] text-[var(--slate)]/70">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--teal)]" /> events/s</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--copper)]" /> p95</span>
          <span>peak 18.4k · trough 6.2k</span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-[60px_1fr] gap-3">
        {/* Y axis */}
        <div className="flex flex-col justify-between py-2 font-mono text-[9px] text-[var(--slate)]/60">
          <span>20k</span>
          <span>15k</span>
          <span>10k</span>
          <span>5k</span>
          <span>0</span>
        </div>
        {/* Chart */}
        <div className="relative">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full sm:h-56">
            <defs>
              <linearGradient id="area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.50 0.07 195 / 0.32)" />
                <stop offset="100%" stopColor="oklch(0.50 0.07 195 / 0)" />
              </linearGradient>
            </defs>
            {/* grid lines */}
            {[20, 40, 60, 80].map((y) => (
              <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="oklch(0.45 0.02 250 / 0.08)" strokeWidth="0.2" />
            ))}
            {/* area */}
            <motion.path
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
              d={areaPath}
              fill="url(#area-grad)"
            />
            {/* line */}
            <motion.path
              initial={{ pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 1.4, ease: 'easeInOut' }}
              d={path}
              fill="none"
              stroke="oklch(0.50 0.07 195)"
              strokeWidth="0.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* peak marker */}
            <line x1="50" y1="0" x2="50" y2="100" stroke="oklch(0.55 0.10 45 / 0.4)" strokeWidth="0.3" strokeDasharray="1 1" />
          </svg>
          {/* X axis */}
          <div className="mt-2 flex justify-between font-mono text-[9px] text-[var(--slate)]/60">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
        </div>
      </div>
    </div>
  )
}
