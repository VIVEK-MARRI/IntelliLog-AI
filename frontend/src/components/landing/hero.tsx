'use client'

import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useScroll, useTransform, useSpring, useReducedMotion } from 'framer-motion'
import { ArrowUpRight, ArrowRight, Activity, MapPin, AlertTriangle, Gauge, Radio, ShieldCheck } from 'lucide-react'
import { Button } from './primitives'

export function Hero() {
  const ref = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const navigate = useNavigate()

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })

  // Smooth springs for parallax — each hook called unconditionally
  const titleYRaw = useTransform(scrollYProgress, [0, 1], [0, -120])
  const sceneRotateXRaw = useTransform(scrollYProgress, [0, 1], [8, -16])
  const sceneRotateYRaw = useTransform(scrollYProgress, [0, 1], [-12, 8])
  const sceneScaleRaw = useTransform(scrollYProgress, [0, 1], [1, 0.92])
  const sceneYRaw = useTransform(scrollYProgress, [0, 1], [0, 120])
  const layer1YRaw = useTransform(scrollYProgress, [0, 1], [0, -80])
  const layer2YRaw = useTransform(scrollYProgress, [0, 1], [0, -160])
  const layer3YRaw = useTransform(scrollYProgress, [0, 1], [0, -240])

  const spring = { stiffness: 80, damping: 26 }
  const titleY = useSpring(titleYRaw, spring)
  const sceneRotateX = useSpring(sceneRotateXRaw, spring)
  const sceneRotateY = useSpring(sceneRotateYRaw, spring)
  const sceneScale = useSpring(sceneScaleRaw, spring)
  const sceneY = useSpring(sceneYRaw, spring)
  const layer1Y = useSpring(layer1YRaw, spring)
  const layer2Y = useSpring(layer2YRaw, spring)
  const layer3Y = useSpring(layer3YRaw, spring)

  const titleOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])
  const layer1Opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0.5])

  return (
    <section
      id="top"
      ref={ref}
      className="relative min-h-[100svh] w-full overflow-hidden surface-porcelain paper-grain"
    >
      {/* Atlas backdrop */}
      <div className="pointer-events-none absolute inset-0 atlas-grid opacity-50" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 50% 100%, oklch(0.50 0.07 195 / 0.10) 0%, transparent 60%)',
        }}
      />

      {/* Top hairline */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--slate)]/30 to-transparent" />

      {/* Top corner readouts */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 hidden px-8 pt-24 lg:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--slate)]/70">
          <span>N 47.6062° · W 122.3321°</span>
          <span>System Status · Operational</span>
          <span>Build 4.2.0 · Region US-WEST</span>
        </div>
      </div>

      <div className="relative z-20 mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-5 pt-32 pb-16 sm:px-8">
        {/* Eyebrow */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="mb-7 flex flex-wrap items-center gap-3"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--slate)]/20 bg-white/70 px-3 py-1.5 backdrop-blur-sm">
            <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
            <span className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--slate)]">
              IntelliLog-AI · Operational Intelligence Layer
            </span>
          </span>
          <span className="hidden font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--slate)]/60 sm:inline">
            v4.2 · Streaming · Explainable · Production
          </span>
        </motion.div>

        {/* Title */}
        <motion.div style={{ y: reduce ? 0 : titleY, opacity: reduce ? 1 : titleOpacity }} className="max-w-5xl">
          <motion.h1
            initial={{ opacity: 0, y: 24, filter: 'blur(8px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
            className="editorial-title text-[clamp(2.6rem,8.2vw,6.4rem)] text-[var(--navy)]"
          >
            Intelligence for
            <br />
            <span className="text-gradient-navy italic">Logistics Operations</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
            className="editorial-lead mt-7 max-w-2xl text-pretty text-[clamp(1.05rem,1.6vw,1.35rem)] text-[var(--slate)]"
          >
            IntelliLog-AI turns live fleet telemetry into predictions, explainable decisions,
            and executive visibility — in real time. A coordinated intelligence loop from
            sensor to boardroom.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
            className="mt-9 flex flex-wrap items-center gap-3"
          >
            <Button size="lg" iconRight={<ArrowUpRight className="h-4 w-4" />} onClick={() => navigate('/app')}>
              Launch Mission Control
            </Button>
            <Button size="lg" variant="secondary" iconRight={<ArrowRight className="h-4 w-4" />}>
              View System Architecture
            </Button>
          </motion.div>
        </motion.div>

        {/* 3D Composition */}
        <div className="relative mt-16 lg:mt-12">
          <Hero3DScene
            sceneRotateX={sceneRotateX}
            sceneRotateY={sceneRotateY}
            sceneScale={sceneScale}
            sceneY={sceneY}
            layer1Y={layer1Y}
            layer1Opacity={layer1Opacity}
            layer2Y={layer2Y}
            layer3Y={layer3Y}
            reduce={reduce ?? false}
          />
        </div>

        {/* Bottom marquee strip — fleet vitals */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)] sm:grid-cols-4"
        >
          {[
            { label: 'Active Vehicles', value: '1,284', sub: '+12 last min' },
            { label: 'Streaming Events', value: '12.4k/s', sub: 'redis streams' },
            { label: 'Risk Predictions', value: '<180ms', sub: 'p95 latency' },
            { label: 'On-time Rate', value: '94.2%', sub: '+18 pts vs Q1' },
          ].map((stat) => (
            <div key={stat.label} className="bg-[var(--porcelain)] px-5 py-4">
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]/70">
                {stat.label}
              </div>
              <div className="mt-1 font-display text-2xl font-medium text-[var(--navy)]">
                {stat.value}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-[var(--teal)]">
                {stat.sub}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.1 }}
        className="absolute bottom-6 left-1/2 z-20 hidden -translate-x-1/2 flex-col items-center gap-2 lg:flex"
      >
        <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[var(--slate)]/60">
          Scroll to begin
        </span>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="h-8 w-px bg-gradient-to-b from-[var(--slate)]/50 to-transparent"
        />
      </motion.div>
    </section>
  )
}

/* ----------------------------------
   3D Scene — layered perspective composition
   Planes: route map (back) → risk cards (mid) → command ribbon (front)
   ---------------------------------- */
function Hero3DScene({
  sceneRotateX,
  sceneRotateY,
  sceneScale,
  sceneY,
  layer1Y,
  layer1Opacity,
  layer2Y,
  layer3Y,
  reduce,
}: {
  sceneRotateX: any
  sceneRotateY: any
  sceneScale: any
  sceneY: any
  layer1Y: any
  layer1Opacity: any
  layer2Y: any
  layer3Y: any
  reduce: boolean
}) {
  return (
    <div
      className="relative h-[440px] w-full sm:h-[520px] lg:h-[580px]"
      style={{ perspective: '1400px', perspectiveOrigin: '50% 50%' }}
    >
      <motion.div
        style={{
          rotateX: reduce ? 0 : sceneRotateX,
          rotateY: reduce ? 0 : sceneRotateY,
          scale: reduce ? 1 : sceneScale,
          y: reduce ? 0 : sceneY,
          transformStyle: 'preserve-3d',
        }}
        className="relative h-full w-full"
      >
        {/* Back layer — route map plane */}
        <motion.div
          style={{ y: reduce ? 0 : layer3Y, transformStyle: 'preserve-3d' }}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div
            className="relative h-[360px] w-[820px] max-w-full rounded-3xl border border-[var(--slate)]/15 bg-white/50 p-6 backdrop-blur-sm sm:h-[440px]"
            style={{ transform: 'translateZ(-180px) rotateX(56deg)' }}
          >
            <RouteMapPlane />
          </div>
        </motion.div>

        {/* Mid layer — risk + telemetry cards */}
        <motion.div
          style={{
            y: reduce ? 0 : layer2Y,
            opacity: reduce ? 1 : layer1Opacity,
            transformStyle: 'preserve-3d',
          }}
          className="absolute inset-0"
        >
          <FloatingRiskCard
            className="absolute left-2 top-4 sm:left-8 sm:top-8"
            transform="translateZ(40px) rotateY(-12deg) rotateX(8deg)"
          />
          <FloatingTelemetryCard
            className="absolute right-2 top-12 sm:right-10 sm:top-20"
            transform="translateZ(80px) rotateY(14deg) rotateX(6deg)"
          />
        </motion.div>

        {/* Front layer — command ribbon */}
        <motion.div
          style={{ y: reduce ? 0 : layer1Y, transformStyle: 'preserve-3d' }}
          className="absolute inset-x-0 bottom-0 flex justify-center"
        >
          <div
            className="w-full max-w-2xl"
            style={{ transform: 'translateZ(140px)' }}
          >
            <CommandRibbon />
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

/* Stylized route map with arcs */
function RouteMapPlane() {
  return (
    <div className="relative h-full w-full">
      <svg viewBox="0 0 820 440" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="route-arc" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.50 0.07 195)" stopOpacity="0.1" />
            <stop offset="50%" stopColor="oklch(0.50 0.07 195)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="oklch(0.74 0.12 80)" stopOpacity="0.9" />
          </linearGradient>
          <linearGradient id="route-arc-2" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.55 0.10 45)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="oklch(0.22 0.04 255)" stopOpacity="0.4" />
          </linearGradient>
        </defs>

        {/* dot grid */}
        {Array.from({ length: 22 }).map((_, i) =>
          Array.from({ length: 11 }).map((_, j) => (
            <circle
              key={`${i}-${j}`}
              cx={20 + i * 36}
              cy={20 + j * 36}
              r={0.7}
              fill="oklch(0.45 0.02 250 / 0.18)"
            />
          ))
        )}

        {/* Major arcs — fleet routes */}
        <path
          d="M 80 320 Q 240 100 440 180 T 760 140"
          stroke="url(#route-arc)"
          strokeWidth="2.2"
          fill="none"
          strokeDasharray="6 6"
          className="animate-dash"
        />
        <path
          d="M 120 80 Q 280 280 480 240 T 740 320"
          stroke="url(#route-arc-2)"
          strokeWidth="1.6"
          fill="none"
          strokeDasharray="3 5"
          className="animate-dash"
          style={{ animationDelay: '-1.5s' }}
        />
        <path
          d="M 60 200 Q 220 220 380 140 T 720 220"
          stroke="url(#route-arc)"
          strokeWidth="1.4"
          fill="none"
          opacity="0.55"
          strokeDasharray="2 6"
          className="animate-dash"
          style={{ animationDelay: '-2.5s' }}
        />

        {/* Nodes — origin / hub / destination */}
        {[
          { x: 80, y: 320, label: 'SEA', main: true },
          { x: 440, y: 180, label: 'CHI', main: true },
          { x: 760, y: 140, label: 'BOS', main: true },
          { x: 120, y: 80, label: 'VAN' },
          { x: 740, y: 320, label: 'MIA' },
          { x: 480, y: 240, label: 'ATL' },
          { x: 60, y: 200, label: 'PDX' },
          { x: 720, y: 220, label: 'CLT' },
        ].map((n) => (
          <g key={n.label}>
            <circle cx={n.x} cy={n.y} r={n.main ? 5 : 3} fill={n.main ? 'oklch(0.22 0.04 255)' : 'oklch(0.50 0.07 195)'} />
            {n.main && (
              <circle cx={n.x} cy={n.y} r="10" fill="none" stroke="oklch(0.22 0.04 255)" strokeWidth="0.8" opacity="0.4">
                <animate attributeName="r" values="6;14;6" dur="2.6s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.4;0;0.4" dur="2.6s" repeatCount="indefinite" />
              </circle>
            )}
            <text
              x={n.x + 10}
              y={n.y + 4}
              fontSize="9"
              fontFamily="monospace"
              fill="oklch(0.45 0.02 250 / 0.7)"
              letterSpacing="1"
            >
              {n.label}
            </text>
          </g>
        ))}
      </svg>

      {/* corner annotations */}
      <div className="absolute left-4 top-4 font-mono text-[9px] tracking-[0.16em] uppercase text-[var(--slate)]/60">
        Live Route Atlas · NA Region
      </div>
      <div className="absolute right-4 top-4 font-mono text-[9px] tracking-[0.16em] uppercase text-[var(--sage)]">
        1,284 active routes
      </div>
    </div>
  )
}

function FloatingRiskCard({ className, transform }: { className?: string; transform: string }) {
  return (
    <div
      className={`glass-card w-[270px] rounded-2xl p-4 sm:w-[320px] ${className}`}
      style={{ transform }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--copper)]/12">
            <AlertTriangle className="h-3.5 w-3.5 text-[var(--copper)]" />
          </div>
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]">
            High-Risk Order
          </span>
        </div>
        <span className="font-mono text-[10px] text-[var(--copper)]">93%</span>
      </div>
      <div className="mt-3 font-display text-base font-medium text-[var(--navy)]">
        ORD-4827 · Atlanta → Memphis
      </div>
      <div className="mt-1 font-mono text-[11px] text-[var(--slate)]/80">
        Predicted delay: 47 min · ETA breach likely
      </div>

      <div className="mt-3 space-y-1.5">
        {[
          { f: 'traffic_severity', w: 0.38 },
          { f: 'weather_alert', w: 0.27 },
          { f: 'fatigue_index', w: 0.18 },
          { f: 'load_weight', w: 0.11 },
        ].map((row) => (
          <div key={row.f} className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-[var(--slate)]/70 w-28 truncate">{row.f}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--mist)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[var(--copper)] to-[var(--amber)]"
                style={{ width: `${row.w * 100}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-[var(--slate)]/60 w-8 text-right">
              {(row.w * 100).toFixed(0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function FloatingTelemetryCard({ className, transform }: { className?: string; transform: string }) {
  return (
    <div
      className={`glass-card w-[260px] rounded-2xl p-4 sm:w-[300px] ${className}`}
      style={{ transform }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--teal)]/12">
            <Activity className="h-3.5 w-3.5 text-[var(--teal)]" />
          </div>
          <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]">
            Vehicle TRK-1142
          </span>
        </div>
        <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="Speed" value="58" unit="mph" />
        <Metric label="Fuel" value="68" unit="%" />
        <Metric label="Temp" value="192" unit="°F" />
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--mist)] px-2.5 py-1.5">
        <MapPin className="h-3 w-3 text-[var(--slate)]" />
        <span className="font-mono text-[10px] text-[var(--slate)]/80 truncate">
          35.0461° N · 85.3074° W · I-75 N
        </span>
      </div>
      {/* mini sparkline */}
      <svg viewBox="0 0 200 36" className="mt-3 h-9 w-full">
        <polyline
          points="0,28 20,22 40,26 60,18 80,20 100,12 120,16 140,8 160,14 180,6 200,10"
          fill="none"
          stroke="oklch(0.50 0.07 195)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points="0,28 20,22 40,26 60,18 80,20 100,12 120,16 140,8 160,14 180,6 200,10 200,36 0,36"
          fill="oklch(0.50 0.07 195 / 0.10)"
        />
      </svg>
    </div>
  )
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-0.5">
        <span className="font-display text-lg font-medium text-[var(--navy)]">{value}</span>
        <span className="font-mono text-[10px] text-[var(--slate)]/60">{unit}</span>
      </div>
    </div>
  )
}

function CommandRibbon() {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--navy)] text-[var(--porcelain)]">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--teal)]">
              Gemini Recommendation
            </span>
            <span className="rounded-full bg-[var(--sage)]/20 px-2 py-0.5 font-mono text-[9px] tracking-wide text-[var(--sage)]">
              CONF 0.91
            </span>
          </div>
          <div className="mt-0.5 truncate text-[13px] text-[var(--navy)]">
            Reroute TRK-1142 via I-24 E — avoid I-75 congestion, save 41 min, ETA preserved.
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-1 rounded-full bg-[var(--navy)] px-3 py-1.5 font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--porcelain)] sm:flex">
          <Radio className="h-3 w-3" />
          Execute
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 border-t border-[var(--slate)]/10 pt-2.5 font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/60">
        <Gauge className="h-3 w-3" />
        <span>LangGraph agent · validated by SHAP · OR-Tools optimized</span>
      </div>
    </div>
  )
}
