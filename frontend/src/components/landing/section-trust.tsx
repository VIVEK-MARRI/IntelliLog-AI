'use client'

import { motion } from 'framer-motion'
import { ShieldCheck, FileSearch, GitCommitHorizontal, Eye, CheckCircle2, Lock } from 'lucide-react'
import { Reveal, SectionLabel } from './primitives'

export function TrustSection() {
  return (
    <section
      id="trust"
      className="surface-graphite relative overflow-hidden py-28 sm:py-36"
    >
      <div className="pointer-events-none absolute inset-0 dot-grid-dark opacity-50" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 60% 40% at 30% 20%, oklch(0.50 0.07 195 / 0.10) 0%, transparent 60%)',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal>
          <SectionLabel index="05 / Trust" tone="dark">
            Explainability & Evidence
          </SectionLabel>
        </Reveal>

        <div className="mt-8 grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
          <Reveal delay={0.05}>
            <h2 className="editorial-title text-[clamp(2rem,4.6vw,3.6rem)] text-white text-balance">
              No black boxes.
              <span className="block italic text-white/65">Every decision is traceable.</span>
            </h2>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="editorial-lead text-[1.05rem] leading-relaxed text-white/70 text-pretty">
              IntelliLog-AI does not return predictions without proof. Every risk score, every
              recommendation, every automated action ships with its evidence trail — feature
              attributions, source data, agent reasoning graph, and the validation status of
              the underlying model. Operators can audit any decision in seconds.
            </p>
          </Reveal>
        </div>

        {/* Three pillars */}
        <div className="mt-16 grid gap-4 md:grid-cols-3">
          <Pillar
            icon={ShieldCheck}
            tone="teal"
            title="Confidence indicators"
            body="Every output carries a calibrated confidence score. Below threshold, the system escalates rather than acts — operators always retain override authority."
            metric="0.91"
            metricLabel="median confidence"
          />
          <Pillar
            icon={FileSearch}
            tone="amber"
            title="Evidence validation"
            body="Recommendations cite their supporting data — telemetry snapshots, model attributions, constraint checks. Every claim is back-linked to a verifiable source."
            metric="3–5"
            metricLabel="sources per decision"
          />
          <Pillar
            icon={GitCommitHorizontal}
            tone="sage"
            title="Decision traceability"
            body="The full LangGraph reasoning loop is logged: query, evaluate, propose, validate, act. Any historical decision can be replayed node-by-node for review."
            metric="100%"
            metricLabel="actions traceable"
          />
        </div>

        {/* Decision audit card */}
        <Reveal delay={0.1}>
          <DecisionAuditCard />
        </Reveal>

        {/* Bottom row — guarantees */}
        <Reveal delay={0.15}>
          <div className="mt-10 grid gap-3 sm:grid-cols-3">
            <Guarantee icon={Eye} title="Full observability" body="Every layer logs structured events to Prometheus + Loki." />
            <Guarantee icon={Lock} title="Operator override" body="No automated action executes without a human escalation path." />
            <Guarantee icon={CheckCircle2} title="Reproducible" body="Replay any decision with the same inputs — same output, every time." />
          </div>
        </Reveal>
      </div>
    </section>
  )
}

function Pillar({
  icon: Icon,
  tone,
  title,
  body,
  metric,
  metricLabel,
}: {
  icon: any
  tone: 'teal' | 'amber' | 'sage'
  title: string
  body: string
  metric: string
  metricLabel: string
}) {
  const toneClass = {
    teal: { bg: 'bg-[var(--teal)]/12', fg: 'text-[var(--teal)]', border: 'border-[var(--teal)]/25' },
    amber: { bg: 'bg-[var(--amber)]/12', fg: 'text-[var(--amber)]', border: 'border-[var(--amber)]/25' },
    sage: { bg: 'bg-[var(--sage)]/15', fg: 'text-[var(--sage)]', border: 'border-[var(--sage)]/30' },
  }[tone]
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className={`glass-dark rounded-2xl border ${toneClass.border} p-5`}
    >
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneClass.bg} ${toneClass.fg}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-right">
          <div className={`font-display text-2xl font-medium ${toneClass.fg}`}>{metric}</div>
          <div className="font-mono text-[9px] tracking-[0.14em] uppercase text-white/45">{metricLabel}</div>
        </div>
      </div>
      <div className="mt-4 font-display text-[17px] font-medium text-white">{title}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-white/65 text-pretty">{body}</p>
    </motion.div>
  )
}

function DecisionAuditCard() {
  const trail = [
    { node: 'INGEST', time: '14:18:02.412', detail: 'Telemetry packet · TRK-1142 · speed 58mph · loc I-75 N', tone: 'teal' },
    { node: 'PREDICT', time: '14:18:02.590', detail: 'XGBoost risk score → 0.93 · top driver: traffic_severity (0.38)', tone: 'copper' },
    { node: 'EXPLAIN', time: '14:18:02.612', detail: 'SHAP attribution computed · 6 features · validated against model card', tone: 'teal' },
    { node: 'AGENT', time: '14:18:02.847', detail: 'LangGraph · query_context → evaluate_options → propose', tone: 'navy' },
    { node: 'GEMINI', time: '14:18:03.114', detail: 'Recommendation: reroute via I-24 E · conf 0.91 · 3 evidence sources', tone: 'amber' },
    { node: 'VALIDATE', time: '14:18:03.288', detail: 'OR-Tools solve 2.4s · 200 stops · new ETA within SLA window', tone: 'sage' },
    { node: 'EXECUTE', time: '14:18:03.541', detail: 'Route update pushed to TRK-1142 · ack received · audit log written', tone: 'navy' },
  ]
  const dotColor = (tone: string) =>
    tone === 'copper' ? 'oklch(0.55 0.10 45)'
    : tone === 'sage' ? 'oklch(0.62 0.05 145)'
    : tone === 'teal' ? 'oklch(0.50 0.07 195)'
    : tone === 'amber' ? 'oklch(0.74 0.12 80)'
    : 'oklch(0.22 0.04 255)'

  return (
    <div className="mt-12 glass-dark rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.16em] uppercase text-white/55">
            Decision audit trail · ORD-4827
          </div>
          <div className="mt-1 font-display text-[18px] font-medium text-white">
            Trace lg_7d4a9c · replayable
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-[var(--sage)]/30 bg-[var(--sage)]/10 px-3 py-1.5">
          <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
          <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--sage)]">completed · 1.13s end-to-end</span>
        </div>
      </div>

      <div className="mt-5 space-y-0">
        {trail.map((step, i) => (
          <motion.div
            key={step.node}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.5 }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="relative flex gap-4 pb-5 last:pb-0"
          >
            {/* rail */}
            {i < trail.length - 1 && (
              <div className="absolute left-[7px] top-5 h-full w-px bg-white/10" />
            )}
            {/* dot */}
            <div
              className="relative z-10 mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[var(--graphite)]"
              style={{ background: dotColor(step.tone) }}
            />
            {/* content */}
            <div className="flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-mono text-[11px] font-medium tracking-wide text-white">{step.node}</span>
                <span className="font-mono text-[10px] text-white/45">·</span>
                <span className="font-mono text-[10px] text-white/55">{step.time}</span>
              </div>
              <div className="mt-0.5 text-[13px] text-white/75">{step.detail}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function Guarantee({ icon: Icon, title, body }: { icon: any; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--amber)]" />
        <span className="font-display text-[14px] font-medium text-white">{title}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/65">{body}</p>
    </div>
  )
}
