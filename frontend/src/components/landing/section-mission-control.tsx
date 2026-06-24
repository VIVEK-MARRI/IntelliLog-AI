'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import {
  Activity, AlertTriangle, Truck, MapPin, Radio, Gauge,
  ShieldCheck, Server, Cpu, Database,
} from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

export function MissionControlSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const panelY = useTransform(scrollYProgress, [0, 1], [60, -40])

  return (
    <section
      ref={ref}
      id="mission-control"
      className="surface-mist relative overflow-hidden py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-0 dot-grid opacity-50" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        {/* Header */}
        <Reveal>
          <SectionLabel index="03 / Live Preview">Mission Control</SectionLabel>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
          <Reveal delay={0.05}>
            <h2 className="editorial-title text-[clamp(2rem,4.6vw,3.6rem)] text-[var(--navy)] text-balance">
              The same picture,
              <span className="italic text-[var(--teal)]"> from dispatcher to boardroom.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="editorial-lead text-[1.05rem] leading-relaxed text-[var(--slate)] text-pretty">
              A live preview of the operational surface — fleet vitals, active risk orders,
              the agent activity feed, and the AI command center that ties them together.
              Every panel updates in real time over WebSockets.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-[var(--sage)]/30 bg-[var(--sage)]/10 px-3 py-1.5">
                <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--sage)]">Live preview</span>
              </span>
              <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--slate)]/70">
                WebSocket · 5k concurrent
              </span>
            </div>
          </Reveal>
        </div>

        {/* Main dashboard panel */}
        <Reveal delay={0.2}>
          <motion.div
            style={{ y: panelY }}
            className="mt-14 grid gap-3 lg:grid-cols-[1fr_1.4fr_1fr]"
          >
            {/* Left — Fleet overview */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <FleetOverview />
            </motion.div>

            {/* Center — Map + Risk orders */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
              className="flex flex-col gap-3"
            >
              <LiveMap />
              <HighRiskOrders />
            </motion.div>

            {/* Right — Activity feed + Command center */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
              className="flex flex-col gap-3"
            >
              <CommandCenter />
              <ActivityFeed />
              <SystemHealth />
            </motion.div>
          </motion.div>
        </Reveal>

        {/* Caption row */}
        <Reveal delay={0.1}>
          <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-[var(--border)] pt-6">
            <p className="max-w-2xl text-[13.5px] text-[var(--slate)] text-pretty">
              All metrics shown are illustrative of live operational data. The production system streams
              real telemetry from connected vehicles through Redis Streams to a WebSocket fan-out
              feeding every panel simultaneously.
            </p>
            <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] uppercase text-[var(--slate)]/70">
              <Server className="h-3.5 w-3.5" />
              <span>4 regions · 99.94% uptime</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

/* ---------- Fleet Overview ---------- */
function FleetOverview() {
  const vehicles = [
    { id: 'TRK-1142', status: 'active', loc: 'I-75 N · GA', speed: 58 },
    { id: 'TRK-2034', status: 'active', loc: 'I-40 E · TN', speed: 64 },
    { id: 'TRK-5571', status: 'idle', loc: 'Hub · ATL', speed: 0 },
    { id: 'TRK-3201', status: 'risk', loc: 'I-24 W · KY', speed: 42 },
    { id: 'TRK-8890', status: 'active', loc: 'I-85 N · SC', speed: 61 },
    { id: 'TRK-4421', status: 'active', loc: 'I-95 N · FL', speed: 67 },
  ]
  return (
    <div className="glass-card rounded-2xl p-4">
      <PanelHeader icon={Truck} title="Fleet Overview" meta="1,284 active" />
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat value="1,284" label="Vehicles" tone="navy" />
        <Stat value="61" label="Avg mph" tone="teal" />
        <Stat value="94.2%" label="On-time" tone="sage" />
      </div>
      <div className="mt-3 space-y-1">
        {vehicles.map((v, i) => (
          <motion.div
            key={v.id}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-white/60 px-2.5 py-2"
          >
            <span
              className="status-dot"
              style={{
                background:
                  v.status === 'risk' ? 'oklch(0.55 0.10 45)'
                  : v.status === 'idle' ? 'oklch(0.45 0.02 250)'
                  : 'oklch(0.62 0.05 145)',
                color:
                  v.status === 'risk' ? 'oklch(0.55 0.10 45)'
                  : v.status === 'idle' ? 'oklch(0.45 0.02 250)'
                  : 'oklch(0.62 0.05 145)',
              }}
            />
            <span className="font-mono text-[11px] text-[var(--navy)]">{v.id}</span>
            <span className="flex-1 truncate text-[11px] text-[var(--slate)]">{v.loc}</span>
            <span className="font-mono text-[10px] text-[var(--slate)]/70">{v.speed}mph</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Live Map ---------- */
function LiveMap() {
  return (
    <div className="glass-card relative flex-1 overflow-hidden rounded-2xl p-0">
      <div className="flex items-center justify-between p-4 pb-2">
        <PanelHeader icon={MapPin} title="Live Route Atlas" meta="NA · 8 regions" />
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--sage)]">streaming</span>
          <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
        </div>
      </div>
      <div className="relative h-44 w-full sm:h-56">
        <svg viewBox="0 0 600 280" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          {/* dot grid */}
          {Array.from({ length: 16 }).map((_, i) =>
            Array.from({ length: 8 }).map((_, j) => (
              <circle key={`${i}-${j}`} cx={20 + i * 38} cy={20 + j * 34} r="0.6" fill="oklch(0.45 0.02 250 / 0.16)" />
            ))
          )}
          {/* route arcs */}
          <path d="M 60 220 Q 180 80 320 160 T 540 110" stroke="oklch(0.50 0.07 195 / 0.8)" strokeWidth="1.6" fill="none" strokeDasharray="4 4" className="animate-dash" />
          <path d="M 100 60 Q 240 200 380 130 T 560 220" stroke="oklch(0.55 0.10 45 / 0.6)" strokeWidth="1.4" fill="none" strokeDasharray="2 5" className="animate-dash" style={{ animationDelay: '-1.2s' }} />
          <path d="M 40 130 Q 220 160 380 80 T 540 180" stroke="oklch(0.62 0.05 145 / 0.6)" strokeWidth="1.2" fill="none" strokeDasharray="2 6" className="animate-dash" style={{ animationDelay: '-2s' }} />

          {/* heat regions */}
          <ellipse cx="320" cy="160" rx="60" ry="34" fill="oklch(0.55 0.10 45 / 0.10)" />
          <ellipse cx="320" cy="160" rx="30" ry="16" fill="oklch(0.55 0.10 45 / 0.16)" />

          {/* vehicle markers */}
          {[
            { x: 120, y: 110, risk: false },
            { x: 200, y: 180, risk: false },
            { x: 320, y: 160, risk: true },
            { x: 410, y: 130, risk: false },
            { x: 500, y: 90, risk: false },
            { x: 380, y: 220, risk: false },
          ].map((m, i) => (
            <g key={i}>
              <circle cx={m.x} cy={m.y} r={m.risk ? 5 : 3} fill={m.risk ? 'oklch(0.55 0.10 45)' : 'oklch(0.22 0.04 255)'} />
              {m.risk && (
                <circle cx={m.x} cy={m.y} r="12" fill="none" stroke="oklch(0.55 0.10 45)" strokeWidth="0.8" opacity="0.5">
                  <animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur="2.4s" repeatCount="indefinite" />
                </circle>
              )}
            </g>
          ))}
          {/* hub */}
          <rect x="316" y="156" width="8" height="8" fill="oklch(0.74 0.12 80)" />
        </svg>
        {/* legend */}
        <div className="absolute bottom-2 left-3 flex items-center gap-3 font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/70">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.22 0.04 255)' }} /> vehicle</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: 'oklch(0.55 0.10 45)' }} /> risk</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2" style={{ background: 'oklch(0.74 0.12 80)' }} /> hub</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- High Risk Orders ---------- */
function HighRiskOrders() {
  const orders = [
    { id: 'ORD-4827', route: 'ATL → MEM', risk: 0.93, eta: '14:20', cause: 'traffic' },
    { id: 'ORD-5512', route: 'CHI → STL', risk: 0.87, eta: '16:05', cause: 'weather' },
    { id: 'ORD-3310', route: 'DEN → PHX', risk: 0.78, eta: '18:42', cause: 'fatigue' },
    { id: 'ORD-9043', route: 'SEA → POR', risk: 0.71, eta: '11:55', cause: 'load' },
  ]
  return (
    <div className="glass-card rounded-2xl p-4">
      <PanelHeader icon={AlertTriangle} title="High-Risk Orders" meta="4 active" tone="copper" />
      <div className="mt-3 space-y-1.5">
        {orders.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-2.5 rounded-lg border border-[var(--copper)]/15 bg-[var(--copper)]/[0.04] px-3 py-2"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--copper)]/12">
              <AlertTriangle className="h-3 w-3 text-[var(--copper)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-medium text-[var(--navy)]">{o.id}</span>
                <span className="text-[10px] text-[var(--slate)]/70">·</span>
                <span className="truncate text-[11px] text-[var(--slate)]">{o.route}</span>
              </div>
              <div className="mt-0.5 font-mono text-[9px] tracking-wide text-[var(--slate)]/60">
                ETA {o.eta} · cause: {o.cause}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono text-[12px] font-medium text-[var(--copper)]">{(o.risk * 100).toFixed(0)}%</div>
              <div className="font-mono text-[9px] text-[var(--slate)]/60">risk</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Command Center ---------- */
function CommandCenter() {
  return (
    <div className="glass-card rounded-2xl border-[var(--teal)]/25 p-4">
      <PanelHeader icon={ShieldCheck} title="AI Command Center" meta="agent active" tone="teal" />
      <div className="mt-3 rounded-xl border border-[var(--teal)]/20 bg-[var(--teal)]/[0.06] p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[var(--amber)]/20 px-2 py-0.5 font-mono text-[9px] tracking-wide text-[var(--amber)]">
            GEMINI · CONF 0.91
          </span>
          <span className="font-mono text-[10px] text-[var(--slate)]/70">action · reroute</span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--navy)] text-pretty">
          Reroute <span className="font-mono text-[var(--teal)]">TRK-1142</span> via I-24 E — avoid I-75 congestion, save 41 min, preserve ETA.
        </p>
        <div className="mt-2 flex items-center gap-2 border-t border-[var(--teal)]/15 pt-2 font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/60">
          <Radio className="h-3 w-3" />
          <span>Validated by SHAP · OR-Tools optimized</span>
        </div>
      </div>
    </div>
  )
}

/* ---------- Activity Feed ---------- */
function ActivityFeed() {
  const events = [
    { t: '0.4s', text: 'Prediction · ORD-4827 risk → 0.93', tone: 'copper' },
    { t: '1.2s', text: 'Agent · reroute proposal issued', tone: 'navy' },
    { t: '2.8s', text: 'OR-Tools · solve 2.4s · 200 stops', tone: 'sage' },
    { t: '4.1s', text: 'WebSocket · pushed to 5 ops clients', tone: 'teal' },
    { t: '6.0s', text: 'Execute · TRK-1142 route updated', tone: 'navy' },
  ]
  return (
    <div className="glass-card rounded-2xl p-4">
      <PanelHeader icon={Activity} title="Live Activity Feed" meta="realtime" />
      <div className="mt-3 space-y-1.5">
        {events.map((e, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.07 }}
            className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-[var(--mist)]/60"
          >
            <span className="font-mono text-[9px] text-[var(--slate)]/55 w-9">{e.t}</span>
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                background:
                  e.tone === 'copper' ? 'oklch(0.55 0.10 45)'
                  : e.tone === 'sage' ? 'oklch(0.62 0.05 145)'
                  : e.tone === 'teal' ? 'oklch(0.50 0.07 195)'
                  : 'oklch(0.22 0.04 255)',
              }}
            />
            <span className="text-[11.5px] text-[var(--navy)] truncate">{e.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ---------- System Health ---------- */
function SystemHealth() {
  const services = [
    { name: 'API Gateway', value: 99.98, icon: Server },
    { name: 'Risk Model', value: 99.94, icon: Cpu },
    { name: 'PostgreSQL', value: 99.99, icon: Database },
    { name: 'Redis Streams', value: 99.97, icon: Radio },
  ]
  return (
    <div className="glass-card rounded-2xl p-4">
      <PanelHeader icon={Gauge} title="System Health" meta="all green" tone="sage" />
      <div className="mt-3 space-y-2">
        {services.map((s, i) => (
          <motion.div
            key={s.name}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06 }}
            className="flex items-center gap-2.5"
          >
            <s.icon className="h-3.5 w-3.5 text-[var(--slate)]/70" />
            <span className="flex-1 text-[11.5px] text-[var(--navy)]">{s.name}</span>
            <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--mist)]">
              <motion.div
                initial={{ width: 0 }}
                whileInView={{ width: `${s.value}%` }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
                className="h-full rounded-full bg-[var(--sage)]"
              />
            </div>
            <span className="font-mono text-[10px] text-[var(--sage)] w-12 text-right">{s.value}%</span>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Shared panel bits ---------- */
function PanelHeader({
  icon: Icon, title, meta, tone = 'navy',
}: {
  icon: any; title: string; meta?: string; tone?: 'navy' | 'teal' | 'sage' | 'copper'
}) {
  const toneClass = {
    navy: 'bg-[var(--navy)]/[0.08] text-[var(--navy)]',
    teal: 'bg-[var(--teal)]/12 text-[var(--teal)]',
    sage: 'bg-[var(--sage)]/15 text-[var(--sage)]',
    copper: 'bg-[var(--copper)]/12 text-[var(--copper)]',
  }[tone]
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="font-display text-[14px] font-medium text-[var(--navy)]">{title}</span>
      </div>
      {meta && (
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{meta}</span>
      )}
    </div>
  )
}

function Stat({ value, label, tone }: { value: string; label: string; tone: 'navy' | 'teal' | 'sage' }) {
  const toneClass = {
    navy: 'text-[var(--navy)]',
    teal: 'text-[var(--teal)]',
    sage: 'text-[var(--sage)]',
  }[tone]
  return (
    <div className="rounded-lg border border-[var(--border)] bg-white/60 p-2.5 text-center">
      <div className={`font-display text-lg font-medium ${toneClass}`}>{value}</div>
      <div className="mt-0.5 font-mono text-[9px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{label}</div>
    </div>
  )
}
