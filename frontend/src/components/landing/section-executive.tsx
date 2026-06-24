'use client'

import { motion } from 'framer-motion'
import { Clock, TrendingDown, Heart, ShieldOff, Timer, DollarSign, ArrowUpRight } from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

export function ExecutiveImpactSection() {
  return (
    <section
      id="executive-impact"
      className="surface-mist relative overflow-hidden py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-0 atlas-grid opacity-30" />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionLabel index="07 / Executive Impact">Boardroom Outcomes</SectionLabel>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <Reveal delay={0.05}>
            <h2 className="editorial-title text-[clamp(2rem,4.6vw,3.6rem)] text-[var(--navy)] text-balance">
              For the operator and the executive —
              <span className="block italic text-[var(--copper)]">the same source of truth.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="editorial-lead text-[1.05rem] leading-relaxed text-[var(--slate)] text-pretty">
              Over an 8-week rollout with a regional fleet operator, IntelliLog-AI produced
              measurable operational improvement. The numbers below reflect the delta between
              the 30-day baseline and the 30-day post-deployment window — measured against
              the same routes, drivers, and order volume.
            </p>
          </Reveal>
        </div>

        {/* Headline KPI */}
        <Reveal delay={0.1}>
          <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={Clock}
              value="−23%"
              label="Delay rate reduction"
              detail="Late deliveries dropped from 14.8% to 11.4% of total orders."
              tone="copper"
              highlight
            />
            <KpiCard
              icon={Timer}
              value="4.2h"
              label="Saved per dispatcher / day"
              detail="Reduced manual route adjustment and exception handling time."
              tone="teal"
            />
            <KpiCard
              icon={Heart}
              value="+18"
              label="Fleet health index points"
              detail="Predictive maintenance alerts caught 142 incidents before failure."
              tone="sage"
            />
            <KpiCard
              icon={ShieldOff}
              value="142"
              label="Risk-avoided incidents · 30d"
              detail="High-risk events surfaced and mitigated before SLA breach."
              tone="navy"
            />
          </div>
        </Reveal>

        {/* Executive narrative card */}
        <Reveal delay={0.15}>
          <div className="mt-12 grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <div className="soft-card rounded-3xl p-6 sm:p-8">
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]/70">
                Executive summary · 8-week pilot
              </div>
              <h3 className="editorial-title mt-3 text-[clamp(1.5rem,2.4vw,2rem)] text-[var(--navy)] text-balance">
                "The fleet is healthier, dispatchers are calmer, and the board sees the same
                numbers we do."
              </h3>
              <p className="mt-4 text-[14px] leading-relaxed text-[var(--slate)] text-pretty">
                The platform paid back its deployment cost inside the first 90 days. More
                importantly, it shifted the operations team from a reactive posture to a
                predictive one — exceptions are now surfaced and resolved before they
                become incidents. The same dashboard serves the dispatcher on the floor and
                the VP of Logistics in the weekly review.
              </p>
              <div className="mt-6 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--navy)]/[0.08] font-display text-[14px] font-medium text-[var(--navy)]">
                  DR
                </div>
                <div>
                  <div className="font-display text-[14px] font-medium text-[var(--navy)]">Director of Operations</div>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">Regional Fleet · 1,200 vehicles</div>
                </div>
              </div>
            </div>

            {/* ROI ladder */}
            <div className="soft-card rounded-3xl p-6 sm:p-8">
              <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--slate)]/70">
                ROI trajectory
              </div>
              <div className="mt-5 space-y-3">
                <RoiRow phase="Week 1–2" task="Integration · telemetry pipeline connected" status="done" />
                <RoiRow phase="Week 3–4" task="Baseline · risk model tuned to fleet profile" status="done" />
                <RoiRow phase="Week 5–6" task="Activation · agent loop live on 80% of routes" status="done" />
                <RoiRow phase="Week 7–8" task="Rollup · executive dashboards in production" status="done" />
                <RoiRow phase="Week 9+" task="Compounding · continuous improvement loop" status="active" />
              </div>
              <div className="mt-5 flex items-center justify-between rounded-xl bg-[var(--sage)]/10 px-4 py-3">
                <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--sage)]">Payback</span>
                <span className="font-display text-[18px] font-medium text-[var(--sage)]">&lt; 90 days</span>
              </div>
            </div>
          </div>
        </Reveal>

        {/* Bottom strip — financial impact */}
        <Reveal delay={0.1}>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <FinancialStat
              icon={DollarSign}
              value="$2.1M"
              label="annualized savings · pilot fleet"
              detail="Driver hours, fuel, SLA penalties avoided."
            />
            <FinancialStat
              icon={TrendingDown}
              value="−14%"
              label="fuel cost per route"
              detail="Optimized routing reduced idle and deadhead miles."
            />
            <FinancialStat
              icon={ArrowUpRight}
              value="3.4×"
              label="dispatcher productivity"
              detail="Orders managed per dispatcher per shift."
            />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function KpiCard({
  icon: Icon,
  value,
  label,
  detail,
  tone,
  highlight = false,
}: {
  icon: any
  value: string
  label: string
  detail: string
  tone: 'navy' | 'teal' | 'sage' | 'copper'
  highlight?: boolean
}) {
  const toneClass = {
    navy: { bg: 'bg-[var(--navy)]/[0.08]', fg: 'text-[var(--navy)]' },
    teal: { bg: 'bg-[var(--teal)]/12', fg: 'text-[var(--teal)]' },
    sage: { bg: 'bg-[var(--sage)]/15', fg: 'text-[var(--sage)]' },
    copper: { bg: 'bg-[var(--copper)]/12', fg: 'text-[var(--copper)]' },
  }[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`soft-card soft-card-hover rounded-2xl p-5 ${highlight ? 'ring-1 ring-[var(--copper)]/30' : ''}`}
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${toneClass.bg} ${toneClass.fg}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className={`mt-4 font-display text-[2.4rem] font-medium leading-none ${toneClass.fg}`}>{value}</div>
      <div className="mt-2 font-display text-[14px] font-medium text-[var(--navy)]">{label}</div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--slate)]/85 text-pretty">{detail}</p>
    </motion.div>
  )
}

function RoiRow({ phase, task, status }: { phase: string; task: string; status: 'done' | 'active' }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 border-[var(--sage)] bg-[var(--sage)]/15">
        {status === 'done' ? (
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5">
            <path d="M2 6 L5 9 L10 3" stroke="oklch(0.62 0.05 145)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="status-dot text-[var(--amber)]" style={{ background: 'oklch(0.74 0.12 80)' }} />
        )}
      </div>
      <div className="flex-1">
        <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{phase}</div>
        <div className="text-[13px] text-[var(--navy)]">{task}</div>
      </div>
    </div>
  )
}

function FinancialStat({
  icon: Icon,
  value,
  label,
  detail,
}: {
  icon: any
  value: string
  label: string
  detail: string
}) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--copper)]" />
        <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">{label}</span>
      </div>
      <div className="mt-3 font-display text-[2rem] font-medium text-[var(--navy)]">{value}</div>
      <p className="mt-1 text-[12px] text-[var(--slate)]/85">{detail}</p>
    </div>
  )
}
