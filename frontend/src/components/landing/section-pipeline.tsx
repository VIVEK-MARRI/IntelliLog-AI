'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform, useMotionValueEvent } from 'framer-motion'
import { useState } from 'react'
import {
  Radio, Activity, GitBranch, Brain, Sparkles, Route, LayoutDashboard,
  type LucideIcon,
} from 'lucide-react'
import { SectionLabel } from './primitives'

type Step = {
  id: string
  index: string
  icon: LucideIcon
  title: string
  tagline: string
  description: string
  tech: string[]
  tone: 'navy' | 'teal' | 'sage' | 'amber' | 'copper'
}

const STEPS: Step[] = [
  {
    id: 'telemetry',
    index: '01',
    icon: Radio,
    title: 'Telemetry Ingestion',
    tagline: 'Sensor → stream → memory',
    description:
      'GPS, ELD, telemetry, weather, and traffic data are ingested through Redis Streams at 12,000+ events per second. Every vehicle becomes a continuously emitting signal source — no batch jobs, no lag, no gaps.',
    tech: ['Redis Streams', 'WebSockets', 'Protobuf'],
    tone: 'navy',
  },
  {
    id: 'prediction',
    index: '02',
    icon: Activity,
    title: 'Risk Prediction',
    tagline: 'XGBoost on streaming features',
    description:
      'A gradient-boosted ensemble scores every active order against 47 live features — traffic severity, fatigue index, weather alerts, load profile, route geometry. Risk surfaces in under 180 milliseconds at p95.',
    tech: ['XGBoost', 'Feature Store', 'ONNX Runtime'],
    tone: 'copper',
  },
  {
    id: 'explainability',
    index: '03',
    icon: GitBranch,
    title: 'SHAP Explainability',
    tagline: 'Every score, decomposed',
    description:
      'For every prediction, SHAP values attribute contribution back to each input feature. The system never says "high risk" without naming the drivers — and the weights, in plain language.',
    tech: ['SHAP', 'TreeExplainer', 'Feature Attribution'],
    tone: 'teal',
  },
  {
    id: 'agent',
    index: '04',
    icon: Brain,
    title: 'Agent Decision',
    tagline: 'LangGraph reasoning loop',
    description:
      'A LangGraph orchestrator receives the scored event, queries relevant context, evaluates intervention options, and proposes a decision graph. Each node is observable, replayable, and auditable.',
    tech: ['LangGraph', 'Tool Calls', 'State Graph'],
    tone: 'navy',
  },
  {
    id: 'gemini',
    index: '05',
    icon: Sparkles,
    title: 'Gemini Recommendation',
    tagline: 'Natural language action brief',
    description:
      'Gemini composes a structured recommendation: reroute, hold, escalate, or maintain — with a one-sentence rationale, a confidence score, and the evidence trail that supports it.',
    tech: ['Gemini 1.5 Pro', 'Structured Output', 'Confidence Scoring'],
    tone: 'amber',
  },
  {
    id: 'route',
    index: '06',
    icon: Route,
    title: 'Route Optimization',
    tagline: 'OR-Tools constraint solver',
    description:
      'When the recommendation involves rerouting, OR-Tools solves the new problem — vehicle constraints, time windows, capacity, traffic — in under 2.4 seconds for 200-stop problems.',
    tech: ['OR-Tools', 'VRP Solver', 'Constraint Engine'],
    tone: 'sage',
  },
  {
    id: 'visibility',
    index: '07',
    icon: LayoutDashboard,
    title: 'Executive Visibility',
    tagline: 'Boardroom-grade rollup',
    description:
      'Every action, prediction, and outcome rolls up into live KPIs — delay rate, fleet health, risk-avoided incidents, dispatcher time saved. Executives see the same truth the operators do, in real time.',
    tech: ['Live KPIs', 'WebSocket Push', 'Audit Trail'],
    tone: 'teal',
  },
]

const TONE_STYLES: Record<Step['tone'], { bg: string; fg: string; ring: string; bar: string }> = {
  navy: {
    bg: 'bg-[var(--navy)]/[0.08]',
    fg: 'text-[var(--navy)]',
    ring: 'border-[var(--navy)]/25',
    bar: 'bg-[var(--navy)]',
  },
  teal: {
    bg: 'bg-[var(--teal)]/10',
    fg: 'text-[var(--teal)]',
    ring: 'border-[var(--teal)]/25',
    bar: 'bg-[var(--teal)]',
  },
  sage: {
    bg: 'bg-[var(--sage)]/12',
    fg: 'text-[var(--sage)]',
    ring: 'border-[var(--sage)]/30',
    bar: 'bg-[var(--sage)]',
  },
  amber: {
    bg: 'bg-[var(--amber)]/12',
    fg: 'text-[var(--amber)]',
    ring: 'border-[var(--amber)]/30',
    bar: 'bg-[var(--amber)]',
  },
  copper: {
    bg: 'bg-[var(--copper)]/12',
    fg: 'text-[var(--copper)]',
    ring: 'border-[var(--copper)]/30',
    bar: 'bg-[var(--copper)]',
  },
}

export function PipelineSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  })

  const [activeStep, setActiveStep] = useState(0)
  useMotionValueEvent(scrollYProgress, 'change', (v) => {
    const idx = Math.min(STEPS.length - 1, Math.floor(v * STEPS.length))
    setActiveStep(idx)
  })

  // Progress bar fills as you scroll
  const progressWidth = useTransform(scrollYProgress, [0, 1], ['0%', '100%'])
  const bgY = useTransform(scrollYProgress, [0, 1], ['0%', '-15%'])

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="relative h-[440vh]"
    >
      {/* Sticky canvas */}
      <div className="sticky top-0 h-[100svh] overflow-hidden surface-graphite">
        {/* Atlas grid backdrop */}
        <div className="pointer-events-none absolute inset-0 atlas-grid-dark opacity-60" />
        <motion.div
          style={{ y: bgY }}
          className="pointer-events-none absolute inset-0"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(ellipse 50% 40% at 80% 30%, oklch(0.50 0.07 195 / 0.15) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 15% 80%, oklch(0.55 0.10 45 / 0.12) 0%, transparent 60%)',
            }}
          />
        </motion.div>

        {/* Top header — fixed */}
        <div className="absolute inset-x-0 top-0 z-30 px-5 pt-24 sm:px-8 sm:pt-28">
          <div className="mx-auto max-w-7xl">
            <SectionLabel index="02 / Pipeline" tone="dark">
              How IntelliLog-AI Works
            </SectionLabel>
            <div className="mt-5 flex flex-wrap items-end justify-between gap-6">
              <h2 className="editorial-title max-w-2xl text-[clamp(2rem,4.6vw,3.6rem)] text-white text-balance">
                One continuous loop,
                <span className="italic text-white/65"> seven coordinated stages.</span>
              </h2>
              <div className="hidden font-mono text-[11px] tracking-[0.18em] uppercase text-white/55 sm:block">
                Scroll to traverse the pipeline
              </div>
            </div>
          </div>
        </div>

        {/* Progress rail */}
        <div className="absolute left-1/2 top-1/2 z-20 hidden h-[58vh] w-px -translate-x-1/2 -translate-y-1/2 lg:block">
          <div className="absolute inset-0 bg-white/[0.08]" />
          <motion.div
            style={{ height: progressWidth }}
            className="absolute left-0 top-0 w-px bg-gradient-to-b from-[var(--teal)] via-[var(--amber)] to-[var(--copper)]"
          />
          {/* step dots */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {STEPS.map((step, i) => {
              const isActive = i === activeStep
              const isPassed = i < activeStep
              return (
                <div
                  key={step.id}
                  className={`absolute -left-[7px] h-3.5 w-3.5 rounded-full border-2 transition-all duration-500 ${
                    isActive
                      ? 'scale-150 border-[var(--amber)] bg-[var(--amber)] shadow-[0_0_18px_oklch(0.74_0.12_80/0.7)]'
                      : isPassed
                      ? 'border-[var(--teal)] bg-[var(--teal)]'
                      : 'border-white/30 bg-[var(--graphite)]'
                  }`}
                  style={{ top: `${(i / (STEPS.length - 1)) * 100}%` }}
                >
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[10px] tracking-[0.16em] uppercase text-white/60">
                    {step.index}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Center stage — active step */}
        <div className="absolute inset-0 z-20 flex items-center justify-center px-5 pt-32 sm:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <ActiveStep stage={STEPS[activeStep]} index={activeStep} total={STEPS.length} />
          </div>
        </div>

        {/* Bottom rail — step navigator */}
        <div className="absolute inset-x-0 bottom-0 z-30 border-t border-white/[0.08] bg-[var(--graphite)]/80 px-5 py-4 backdrop-blur-md sm:px-8">
          <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto">
            {STEPS.map((step, i) => {
              const isActive = i === activeStep
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 ${
                    isActive ? 'bg-white/10' : 'opacity-50'
                  }`}
                >
                  <span className={`font-mono text-[10px] tracking-[0.16em] ${isActive ? 'text-white' : 'text-white/60'}`}>
                    {step.index}
                  </span>
                  <span className={`whitespace-nowrap text-[12px] font-medium ${isActive ? 'text-white' : 'text-white/70'}`}>
                    {step.title}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="ml-1 h-px w-4 bg-white/15" />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

function ActiveStep({ stage, index, total }: { stage: Step; index: number; total: number }) {
  const tone = TONE_STYLES[stage.tone]

  return (
    <motion.div
      key={stage.id}
      initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: -24, filter: 'blur(8px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="grid items-center gap-8 lg:grid-cols-[1fr_1.1fr] lg:gap-16"
    >
      {/* Left — stage detail */}
      <div className="order-2 lg:order-1">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/55">
            Stage {stage.index} / {String(total).padStart(2, '0')}
          </span>
          <span className="h-px w-12 bg-white/20" />
          <span className={`font-mono text-[11px] tracking-[0.18em] uppercase ${tone.fg}`}>
            {stage.tagline}
          </span>
        </div>

        <h3 className="editorial-title mt-4 text-[clamp(2.2rem,4.6vw,3.4rem)] text-white text-balance">
          {stage.title}
        </h3>

        <p className="editorial-lead mt-5 max-w-xl text-[1.05rem] leading-relaxed text-white/70 text-pretty">
          {stage.description}
        </p>

        <div className="mt-7 flex flex-wrap gap-2">
          {stage.tech.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/15 bg-white/5 px-3 py-1.5 font-mono text-[11px] tracking-wide text-white/75"
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Right — visual motif */}
      <div className="order-1 lg:order-2">
        <StageVisual stage={stage} index={index} />
      </div>
    </motion.div>
  )
}

function StageVisual({ stage, index }: { stage: Step; index: number }) {
  const Icon = stage.icon
  const tone = TONE_STYLES[stage.tone]

  // Render a different visual per step
  const visual = (() => {
    switch (stage.id) {
      case 'telemetry':
        return <TelemetryVisual />
      case 'prediction':
        return <PredictionVisual />
      case 'explainability':
        return <ExplainabilityVisual />
      case 'agent':
        return <AgentVisual />
      case 'gemini':
        return <GeminiVisual />
      case 'route':
        return <RouteVisual />
      case 'visibility':
        return <VisibilityVisual />
      default:
        return null
    }
  })()

  return (
    <div className="relative">
      {/* Stage number watermark */}
      <div className="pointer-events-none absolute -top-12 right-0 select-none font-display text-[10rem] leading-none text-white/5 sm:text-[14rem]">
        {stage.index}
      </div>

      <div className={`relative rounded-3xl border ${tone.ring} glass-dark p-6 sm:p-8`}>
        {/* header */}
        <div className="flex items-center justify-between">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone.bg} ${tone.fg}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="status-dot" style={{ background: 'oklch(0.74 0.12 80)' }}>
              <span style={{ color: 'oklch(0.74 0.12 80)' }} />
            </span>
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
              live · stage {index + 1}
            </span>
          </div>
        </div>

        <div className="mt-6">{visual}</div>
      </div>
    </div>
  )
}

/* --- Per-stage visuals --- */

function TelemetryVisual() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {['GPS', 'ELD', 'WX', 'TCO'].map((s) => (
          <div key={s} className="rounded-lg border border-white/10 bg-white/5 px-2 py-2 text-center">
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/55">{s}</div>
            <div className="mt-0.5 flex justify-center">
              <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
            </div>
          </div>
        ))}
      </div>
      {/* stream bars */}
      <div className="flex h-20 items-end gap-1 rounded-lg border border-white/10 bg-white/5 p-2">
        {Array.from({ length: 32 }).map((_, i) => {
          const h = 30 + Math.abs(Math.sin(i * 0.7) * 50) + (i % 5) * 6
          return (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.4, delay: i * 0.02 }}
              className="flex-1 rounded-t-sm bg-gradient-to-t from-[var(--teal)]/40 to-[var(--teal)]"
            />
          )
        })}
      </div>
      <div className="flex justify-between font-mono text-[9px] tracking-[0.14em] uppercase text-white/45">
        <span>12,418 events/s</span>
        <span>offset 8923417</span>
        <span>lag 0ms</span>
      </div>
    </div>
  )
}

function PredictionVisual() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">XGBoost · live inference</span>
        <span className="font-mono text-[11px] text-[var(--copper)]">risk 0.93</span>
      </div>
      <div className="relative h-24 rounded-lg border border-white/10 bg-white/5 p-3">
        {/* decision boundary */}
        <div className="absolute inset-x-3 top-1/2 h-px bg-white/15" />
        <div className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[8px] tracking-wide text-white/40">
          threshold 0.5
        </div>
        {/* points */}
        {[
          { x: 12, y: 30, c: 'teal' },
          { x: 28, y: 55, c: 'teal' },
          { x: 44, y: 40, c: 'teal' },
          { x: 62, y: 78, c: 'copper' },
          { x: 78, y: 28, c: 'teal' },
          { x: 88, y: 82, c: 'copper' },
          { x: 36, y: 72, c: 'copper' },
        ].map((p, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: i * 0.06 }}
            className="absolute h-2 w-2 rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              background:
                p.c === 'copper' ? 'oklch(0.55 0.10 45)' : 'oklch(0.50 0.07 195)',
              boxShadow: p.c === 'copper' ? '0 0 12px oklch(0.55 0.10 45 / 0.6)' : 'none',
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">p95</div>
          <div className="text-white">178ms</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">features</div>
          <div className="text-white">47</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">auc</div>
          <div className="text-white">0.912</div>
        </div>
      </div>
    </div>
  )
}

function ExplainabilityVisual() {
  const features = [
    { name: 'traffic_severity', value: 0.38, dir: '+' },
    { name: 'weather_alert', value: 0.27, dir: '+' },
    { name: 'fatigue_index', value: 0.18, dir: '+' },
    { name: 'load_weight', value: 0.11, dir: '+' },
    { name: 'historical_ontime', value: -0.09, dir: '-' },
    { name: 'vehicle_age', value: -0.04, dir: '-' },
  ]
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
        <span>SHAP · feature attribution</span>
        <span>order ORD-4827</span>
      </div>
      <div className="space-y-1.5">
        {features.map((f, i) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-2"
          >
            <span className="w-32 truncate font-mono text-[10px] text-white/70">{f.name}</span>
            <div className="relative h-2 flex-1 bg-white/[0.08]">
              <div className="absolute left-1/2 top-0 h-full w-px bg-white/30" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.abs(f.value) * 100}%` }}
                transition={{ delay: i * 0.06 + 0.2, duration: 0.5 }}
                className="absolute top-0 h-full rounded-full"
                style={{
                  left: f.dir === '+' ? '50%' : 'auto',
                  right: f.dir === '-' ? '50%' : 'auto',
                  background: f.dir === '+' ? 'oklch(0.55 0.10 45)' : 'oklch(0.50 0.07 195)',
                }}
              />
            </div>
            <span className="w-10 text-right font-mono text-[10px] text-white/70">
              {f.dir === '+' ? '+' : ''}{f.value.toFixed(2)}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function AgentVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
        LangGraph · decision graph
      </div>
      <div className="relative h-44 rounded-lg border border-white/10 bg-white/5 p-3">
        <svg viewBox="0 0 320 140" className="h-full w-full">
          <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L0,6 L6,3 z" fill="oklch(0.74 0.12 80 / 0.7)" />
            </marker>
          </defs>
          {/* edges */}
          {[
            ['s', 'r1'], ['s', 'r2'], ['s', 'r3'],
            ['r1', 'e'], ['r2', 'e'], ['r3', 'e'],
          ].map(([a, b], i) => {
            const pos: Record<string, [number, number]> = {
              s: [40, 70], r1: [140, 25], r2: [140, 70], r3: [140, 115], e: [260, 70],
            }
            return (
              <motion.path
                key={`${a}-${b}`}
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.55 }}
                transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
                d={`M ${pos[a][0]} ${pos[a][1]} Q ${(pos[a][0] + pos[b][0]) / 2} ${(pos[a][1] + pos[b][1]) / 2 - 8} ${pos[b][0]} ${pos[b][1]}`}
                stroke="oklch(0.74 0.12 80 / 0.7)"
                strokeWidth="1.2"
                fill="none"
                markerEnd="url(#arr)"
              />
            )
          })}
          {/* nodes */}
          {[
            { id: 's', x: 40, y: 70, label: 'INGEST', main: true },
            { id: 'r1', x: 140, y: 25, label: 'QUERY' },
            { id: 'r2', x: 140, y: 70, label: 'EVAL', main: true },
            { id: 'r3', x: 140, y: 115, label: 'CHECK' },
            { id: 'e', x: 260, y: 70, label: 'ACT', main: true },
          ].map((n) => (
            <motion.g
              key={n.id}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.2 + (n.x / 320) * 0.5 }}
            >
              <circle
                cx={n.x}
                cy={n.y}
                r={n.main ? 14 : 10}
                fill={n.main ? 'oklch(0.74 0.12 80 / 0.18)' : 'oklch(1 0 0 / 0.05)'}
                stroke={n.main ? 'oklch(0.74 0.12 80)' : 'oklch(1 0 0 / 0.3)'}
                strokeWidth="1.2"
              />
              <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="8" fontFamily="monospace" fill={n.main ? 'oklch(0.74 0.12 80)' : 'white'} letterSpacing="0.5">
                {n.label}
              </text>
            </motion.g>
          ))}
        </svg>
      </div>
      <div className="flex justify-between font-mono text-[9px] tracking-[0.14em] uppercase text-white/45">
        <span>nodes 5 · edges 6</span>
        <span>trace_id lg_7d4a</span>
        <span>replayable ✓</span>
      </div>
    </div>
  )
}

function GeminiVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
        Gemini · recommendation
      </div>
      <div className="rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/[0.08] p-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--amber)]/20 px-2 py-0.5 font-mono text-[9px] tracking-wide text-[var(--amber)]">
            CONF 0.91
          </span>
          <span className="font-mono text-[10px] text-white/55">action · reroute</span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-white">
          Reroute <span className="font-mono text-[var(--amber)]">TRK-1142</span> via I-24 E to avoid I-75 congestion. Saves 41 minutes, preserves ETA window, no SLA impact. Top SHAP driver: traffic_severity (0.38).
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">evidence</div>
          <div className="text-white">3 sources</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">validated</div>
          <div className="text-[var(--sage)]">✓ SHAP</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">lang</div>
          <div className="text-white">en-US</div>
        </div>
      </div>
    </div>
  )
}

function RouteVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
        OR-Tools · VRP solver
      </div>
      <div className="relative h-40 rounded-lg border border-white/10 bg-white/5 p-3">
        <svg viewBox="0 0 320 130" className="h-full w-full">
          {/* old route */}
          <path d="M 30 100 L 90 60 L 160 80 L 230 40 L 290 70" stroke="oklch(0.55 0.10 45 / 0.4)" strokeWidth="1.5" strokeDasharray="3 4" fill="none" />
          {/* new route */}
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.4, ease: 'easeInOut' }}
            d="M 30 100 L 70 110 L 130 95 L 190 60 L 240 75 L 290 70"
            stroke="oklch(0.62 0.05 145)"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          {/* stops */}
          {[
            { x: 30, y: 100, label: 'A' },
            { x: 90, y: 60, label: 'B' },
            { x: 160, y: 80, label: 'C' },
            { x: 230, y: 40, label: 'D' },
            { x: 290, y: 70, label: 'E' },
            { x: 70, y: 110, label: 'B′' },
            { x: 130, y: 95, label: 'C′' },
            { x: 190, y: 60, label: 'D′' },
          ].map((s, i) => (
            <g key={`${s.label}-${i}`}>
              <circle cx={s.x} cy={s.y} r="3.5" fill={s.label.includes('′') ? 'oklch(0.62 0.05 145)' : 'oklch(1 0 0 / 0.7)'} />
              <text x={s.x + 6} y={s.y + 3} fontSize="8" fontFamily="monospace" fill="white" opacity="0.7">{s.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2 font-mono text-[10px]">
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">stops</div>
          <div className="text-white">200</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">solve</div>
          <div className="text-white">2.4s</div>
        </div>
        <div className="rounded border border-white/10 bg-white/5 px-2 py-1.5">
          <div className="text-white/50">saved</div>
          <div className="text-[var(--sage)]">41 min</div>
        </div>
      </div>
    </div>
  )
}

function VisibilityVisual() {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
        Executive KPI rollup · live
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'On-time Rate', value: '94.2%', delta: '+18pts', up: true },
          { label: 'Delay Incidents', value: '12', delta: '-23%', up: true },
          { label: 'Fleet Health', value: '87.4', delta: '+4.2', up: true },
          { label: 'Risk Avoided', value: '142', delta: '30d', up: true },
        ].map((kpi, i) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-lg border border-white/10 bg-white/5 p-3"
          >
            <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/50">{kpi.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-2xl font-medium text-white">{kpi.value}</span>
              <span className="font-mono text-[10px] text-[var(--sage)]">{kpi.delta}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[10px] text-white/60">
        <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
        <span>Streaming · last update 0.4s ago · 1,284 vehicles</span>
      </div>
    </div>
  )
}
