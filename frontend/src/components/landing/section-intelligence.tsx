'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import {
  Activity, GitBranch, Brain, Sparkles, Radio, Database,
  Network, Route, Server, BarChart3, Layers, type LucideIcon,
} from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

type Layer = {
  id: string
  name: string
  category: string
  icon: LucideIcon
  role: string
  detail: string
  tone: 'navy' | 'teal' | 'sage' | 'amber' | 'copper' | 'slate'
}

const LAYERS: Layer[] = [
  { id: 'xgboost', name: 'XGBoost', category: 'Prediction', icon: Activity, role: 'Gradient-boosted risk model', detail: 'Scores every active order against 47 streaming features in <180ms p95.', tone: 'copper' },
  { id: 'shap', name: 'SHAP', category: 'Explainability', icon: GitBranch, role: 'Per-prediction feature attribution', detail: 'Decomposes every risk score into contributing drivers, in plain language.', tone: 'teal' },
  { id: 'langgraph', name: 'LangGraph', category: 'Agent Orchestration', icon: Brain, role: 'Reasoning graph for decisions', detail: 'Multi-node agent loop — query, evaluate, propose. Observable and replayable.', tone: 'navy' },
  { id: 'gemini', name: 'Gemini', category: 'Reasoning', icon: Sparkles, role: 'Natural-language recommendation', detail: 'Composes structured action briefs with confidence, rationale, and evidence trail.', tone: 'amber' },
  { id: 'redis', name: 'Redis Streams', category: 'Streaming Bus', icon: Radio, role: 'Telemetry ingestion backbone', detail: 'Sustains 12k+ events/sec across regions with sub-millisecond fan-out.', tone: 'copper' },
  { id: 'ws', name: 'WebSockets', category: 'Realtime Push', icon: Network, role: 'Live UI fan-out', detail: '5,000 concurrent operator sessions with ordered, delta-compressed updates.', tone: 'teal' },
  { id: 'pg', name: 'PostgreSQL', category: 'System of Record', icon: Database, role: 'Operational truth store', detail: 'Orders, vehicles, decisions, audit trail — ACID, partitioned by region.', tone: 'navy' },
  { id: 'or-tools', name: 'OR-Tools', category: 'Optimization', icon: Route, role: 'Combinatorial route solver', detail: 'VRP solver handles 200-stop problems with vehicle and time-window constraints.', tone: 'sage' },
  { id: 'prom', name: 'Prometheus', category: 'Metrics', icon: Server, role: 'System observability', detail: 'Per-service latency, error rate, saturation — scraped every 15s.', tone: 'slate' },
  { id: 'grafana', name: 'Grafana', category: 'Dashboards', icon: BarChart3, role: 'Operational visualization', detail: 'Live dashboards for SREs and operations leads — alerts wired to PagerDuty.', tone: 'slate' },
]

const TONE = {
  navy: { bg: 'bg-[var(--navy)]/[0.08]', fg: 'text-[var(--navy)]', bar: 'bg-[var(--navy)]', border: 'border-[var(--navy)]/20' },
  teal: { bg: 'bg-[var(--teal)]/12', fg: 'text-[var(--teal)]', bar: 'bg-[var(--teal)]', border: 'border-[var(--teal)]/25' },
  sage: { bg: 'bg-[var(--sage)]/15', fg: 'text-[var(--sage)]', bar: 'bg-[var(--sage)]', border: 'border-[var(--sage)]/30' },
  amber: { bg: 'bg-[var(--amber)]/12', fg: 'text-[var(--amber)]', bar: 'bg-[var(--amber)]', border: 'border-[var(--amber)]/30' },
  copper: { bg: 'bg-[var(--copper)]/12', fg: 'text-[var(--copper)]', bar: 'bg-[var(--copper)]', border: 'border-[var(--copper)]/30' },
  slate: { bg: 'bg-[var(--slate)]/10', fg: 'text-[var(--slate)]', bar: 'bg-[var(--slate)]', border: 'border-[var(--slate)]/20' },
} as const

export function IntelligenceStackSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const stackY = useTransform(scrollYProgress, [0, 1], [80, -80])

  return (
    <section
      ref={ref}
      id="intelligence-layer"
      className="surface-porcelain relative overflow-hidden py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-0 atlas-grid opacity-40" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionLabel index="04 / Intelligence Layer">System Architecture</SectionLabel>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal delay={0.05}>
            <h2 className="editorial-title text-[clamp(2rem,4.6vw,3.6rem)] text-[var(--navy)] text-balance">
              Ten coordinated layers.
              <span className="block italic text-[var(--copper)]">One operational intelligence.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="editorial-lead text-[1.05rem] leading-relaxed text-[var(--slate)] text-pretty">
              IntelliLog-AI is not a single model wrapped in a UI. It is a layered system where
              prediction, explanation, reasoning, and execution are first-class components —
              each instrumented, observable, and replaceable. This is what makes the platform
              auditable at the layer boundary.
            </p>
          </Reveal>
        </div>

        {/* Stack diagram + cards */}
        <div className="mt-16 grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          {/* Left — 3D stacked isometric diagram */}
          <motion.div style={{ y: stackY }} className="relative">
            <Reveal>
              <StackDiagram />
            </Reveal>
          </motion.div>

          {/* Right — layer cards grid */}
          <div>
            <Reveal delay={0.05}>
              <div className="grid gap-3 sm:grid-cols-2">
                {LAYERS.map((l, i) => (
                  <LayerCard key={l.id} layer={l} index={i} />
                ))}
              </div>
            </Reveal>
          </div>
        </div>

        {/* Bottom hairline + caption */}
        <Reveal delay={0.1}>
          <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-[var(--border)] pt-6 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--slate)]/70">
              <Layers className="h-3.5 w-3.5" />
              <span>Each layer · independently observable · independently replaceable</span>
            </div>
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--teal)]">
              10 layers · 4 regions · 1 truth
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* Stacked isometric diagram — represents layers as 3D planes */
function StackDiagram() {
  const layers = [
    { name: 'Presentation', tech: 'WebSocket · Next.js', tone: 'teal' },
    { name: 'Optimization', tech: 'OR-Tools', tone: 'sage' },
    { name: 'Reasoning', tech: 'LangGraph · Gemini', tone: 'amber' },
    { name: 'Explainability', tech: 'SHAP', tone: 'teal' },
    { name: 'Prediction', tech: 'XGBoost', tone: 'copper' },
    { name: 'Streaming', tech: 'Redis Streams', tone: 'copper' },
    { name: 'Storage', tech: 'PostgreSQL', tone: 'navy' },
  ]
  return (
    <div
      className="relative h-[520px] w-full"
      style={{ perspective: '1200px', perspectiveOrigin: '50% 30%' }}
    >
      <motion.div
        initial={{ rotateX: 60, rotateZ: -30, opacity: 0 }}
        whileInView={{ rotateX: 56, rotateZ: -28, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
        className="relative h-full w-full"
      >
        {layers.map((l, i) => {
          const t = TONE[l.tone as keyof typeof TONE]
          const z = i * 38
          const y = -i * 32
          return (
            <motion.div
              key={l.name}
              initial={{ opacity: 0, y: y + 30 }}
              whileInView={{ opacity: 1, y }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: 0.2 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              style={{
                transform: `translateZ(${z}px)`,
              }}
              className={`absolute inset-x-4 flex items-center justify-between rounded-xl border ${t.border} bg-white/80 px-4 py-3 backdrop-blur-sm`}
            >
              <div className="flex items-center gap-3">
                <div className={`h-2 w-2 rounded-full ${t.bar}`} />
                <div>
                  <div className="font-display text-[14px] font-medium text-[var(--navy)]">{l.name}</div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{l.tech}</div>
                </div>
              </div>
              <span className={`font-mono text-[10px] ${t.fg}`}>L{String(layers.length - i).padStart(2, '0')}</span>
            </motion.div>
          )
        })}

        {/* vertical connector */}
        <div
          className="absolute left-1/2 top-0 h-full w-px bg-gradient-to-b from-transparent via-[var(--slate)]/20 to-transparent"
          style={{ transform: 'translateZ(0px) rotateY(90deg) translateX(-50%)' }}
        />
      </motion.div>

      {/* axis labels */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--slate)]/50">
        ↑ Data Flow
      </div>
      <div className="absolute bottom-0 right-0 font-mono text-[9px] tracking-[0.2em] uppercase text-[var(--slate)]/50">
        Layer L01 → L07
      </div>
    </div>
  )
}

function LayerCard({ layer, index }: { layer: Layer; index: number }) {
  const Icon = layer.icon
  const t = TONE[layer.tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, delay: index * 0.04, ease: [0.16, 1, 0.3, 1] }}
      className={`soft-card soft-card-hover group rounded-2xl p-4`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${t.bg} ${t.fg}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className={`font-mono text-[10px] tracking-[0.14em] uppercase ${t.fg}`}>
          {layer.category}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display text-[18px] font-medium text-[var(--navy)]">{layer.name}</span>
        <span className={`h-px flex-1 ${t.bar} opacity-30`} />
      </div>
      <div className="mt-1 text-[12px] font-medium text-[var(--slate)]">{layer.role}</div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--slate)]/85 text-pretty">
        {layer.detail}
      </p>
    </motion.div>
  )
}
