'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { Clock, Route, EyeOff, Radio, AlertOctagon } from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

export function ProblemSection() {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const xLine = useTransform(scrollYProgress, [0, 1], ['-10%', '15%'])

  return (
    <section
      ref={ref}
      id="problem"
      className="surface-paper relative overflow-hidden py-28 sm:py-36"
    >
      {/* drifting horizontal line — "delay accumulation" */}
      <motion.div
        style={{ x: xLine }}
        className="pointer-events-none absolute left-0 top-1/2 hidden h-px w-[120%] bg-gradient-to-r from-transparent via-[var(--copper)]/30 to-transparent lg:block"
      />

      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionLabel index="01 / Problem">The reactive operations floor</SectionLabel>
        </Reveal>

        <div className="mt-10 grid gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-20">
          {/* Left — bold statement */}
          <div>
            <Reveal delay={0.05}>
              <h2 className="editorial-title text-[clamp(2.2rem,5.4vw,4.4rem)] text-[var(--navy)] text-balance">
                Logistics still runs on reaction.
                <span className="mt-2 block text-[var(--copper)] italic">
                  The cost is paid in minutes, fuel, and trust.
                </span>
              </h2>
            </Reveal>

            <Reveal delay={0.15} className="mt-8 max-w-xl">
              <p className="editorial-lead text-[1.05rem] leading-relaxed text-[var(--slate)]">
                Dispatchers spot delays after they happen. Risk accumulates across the fleet
                without surfacing. By the time a decision is made, the window to act has closed —
                and the next disruption is already inbound.
              </p>
            </Reveal>

            <Reveal delay={0.25} className="mt-10">
              <div className="hairline w-full" />
              <div className="mt-6 grid grid-cols-3 gap-6">
                <FailureStat value="$84B" label="annual US freight delay cost" />
                <FailureStat value="9.4%" label="of trucking hours lost to idle" />
                <FailureStat value="42 min" label="avg dispatcher reaction lag" />
              </div>
            </Reveal>
          </div>

          {/* Right — fragmented data cards */}
          <div className="relative">
            <div className="grid gap-4">
              <FragmentCard
                icon={<Clock className="h-4 w-4" />}
                tag="Telemetry · Disconnected"
                title="GPS pings without context"
                body="Vehicles broadcast every 8 seconds, but the signal lives in a separate silo from weather, traffic, and order data."
                tone="copper"
                offset="-rotate-1 -translate-x-2"
              />
              <FragmentCard
                icon={<Route className="h-4 w-4" />}
                tag="Routing · Static"
                title="Routes fixed at dispatch"
                body="Plans are computed once and never re-evaluated. Conditions change mid-route; the plan does not."
                tone="slate"
                offset="rotate-1 translate-x-3"
              />
              <FragmentCard
                icon={<AlertOctagon className="h-4 w-4" />}
                tag="Risk · Invisible"
                title="Failure surfaces after the fact"
                body="Late deliveries, asset breakdowns, and SLA breaches are reported in post-mortems — not predicted in advance."
                tone="copper"
                offset="-rotate-1 translate-x-1"
              />
              <FragmentCard
                icon={<EyeOff className="h-4 w-4" />}
                tag="Visibility · Fragmented"
                title="No single operational picture"
                body="Three dashboards, two exports, and a shared spreadsheet. Executives see yesterday's fleet."
                tone="slate"
                offset="rotate-1 -translate-x-2"
              />
            </div>

            {/* faint connector showing broken flow */}
            <div className="pointer-events-none absolute -right-3 top-1/2 hidden h-32 w-32 -translate-y-1/2 sm:block">
              <svg viewBox="0 0 120 120" className="h-full w-full opacity-30">
                <circle cx="60" cy="60" r="48" fill="none" stroke="oklch(0.55 0.10 45)" strokeWidth="0.8" strokeDasharray="2 4" />
                <text x="60" y="63" textAnchor="middle" fontFamily="monospace" fontSize="9" fill="oklch(0.55 0.10 45)" letterSpacing="1.5">
                  GAP
                </text>
              </svg>
            </div>
          </div>
        </div>

        {/* Footer statement */}
        <Reveal delay={0.2}>
          <div className="mt-20 flex flex-col items-start gap-4 rounded-2xl border border-[var(--copper)]/25 bg-[var(--copper)]/[0.04] p-7 sm:flex-row sm:items-center sm:gap-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--copper)]/15">
              <Radio className="h-5 w-5 text-[var(--copper)]" />
            </div>
            <p className="editorial-lead text-pretty text-[1.1rem] text-[var(--navy)]">
              The fleet is generating the answers.
              <span className="text-[var(--slate)]">
                {' '}Most platforms just aren't listening in real time.
              </span>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function FailureStat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-display text-2xl font-medium text-[var(--copper)] sm:text-3xl">{value}</div>
      <div className="mt-1 font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{label}</div>
    </div>
  )
}

function FragmentCard({
  icon,
  tag,
  title,
  body,
  tone,
  offset,
}: {
  icon: React.ReactNode
  tag: string
  title: string
  body: string
  tone: 'copper' | 'slate'
  offset: string
}) {
  return (
    <Reveal delay={0.1}>
      <motion.div
        whileHover={{ y: -3, rotate: 0 }}
        className={`soft-card soft-card-hover rounded-2xl p-5 transform ${offset}`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                tone === 'copper' ? 'bg-[var(--copper)]/12 text-[var(--copper)]' : 'bg-[var(--slate)]/10 text-[var(--slate)]'
              }`}
            >
              {icon}
            </div>
            <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]/70">{tag}</span>
          </div>
          <span className={`status-dot ${tone === 'copper' ? 'text-[var(--copper)]' : 'text-[var(--slate)]'}`}
            style={{ background: tone === 'copper' ? 'oklch(0.55 0.10 45)' : 'oklch(0.45 0.02 250)' }}
          />
        </div>
        <div className="mt-3 font-display text-[1.05rem] font-medium text-[var(--navy)]">{title}</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[var(--slate)]">{body}</p>
      </motion.div>
    </Reveal>
  )
}
