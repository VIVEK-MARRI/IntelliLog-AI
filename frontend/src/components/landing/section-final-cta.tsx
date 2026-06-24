'use client'

import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, Monitor, Layers, Radio } from 'lucide-react'
import { Button, Reveal, SectionLabel } from './primitives'
import { BrandMark } from './navigation'

export function FinalCtaSection() {
  const ref = useRef<HTMLElement>(null)
  const navigate = useNavigate()
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  })
  const glowScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.6, 1.1, 0.9])
  const glowOpacity = useTransform(scrollYProgress, [0, 0.5, 1], [0.3, 0.7, 0.4])

  return (
    <section
      ref={ref}
      id="cta"
      className="surface-graphite relative overflow-hidden py-28 sm:py-40"
    >
      {/* central glow */}
      <motion.div
        style={{ scale: glowScale, opacity: glowOpacity }}
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
      >
        <div
          className="h-[480px] w-[820px] rounded-full"
          style={{
            background:
              'radial-gradient(ellipse at center, oklch(0.50 0.07 195 / 0.45) 0%, oklch(0.55 0.10 45 / 0.18) 35%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
      </motion.div>

      {/* atlas grid */}
      <div className="pointer-events-none absolute inset-0 atlas-grid-dark opacity-50" />

      {/* decorative orbit lines */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-30" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="orbit-grad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="oklch(0.74 0.12 80)" stopOpacity="0" />
            <stop offset="50%" stopColor="oklch(0.74 0.12 80)" stopOpacity="0.6" />
            <stop offset="100%" stopColor="oklch(0.74 0.12 80)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <motion.ellipse
          cx="50%"
          cy="50%"
          rx="38%"
          ry="22%"
          fill="none"
          stroke="url(#orbit-grad)"
          strokeWidth="0.8"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: 'easeInOut' }}
        />
        <motion.ellipse
          cx="50%"
          cy="50%"
          rx="28%"
          ry="16%"
          fill="none"
          stroke="oklch(0.50 0.07 195 / 0.3)"
          strokeWidth="0.6"
          strokeDasharray="2 6"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 1.6, ease: 'easeInOut', delay: 0.2 }}
        />
      </svg>

      <div className="relative z-10 mx-auto max-w-5xl px-5 text-center sm:px-8">
        <Reveal>
          <div className="flex justify-center">
            <SectionLabel index="08 / Begin" tone="dark">
              Take command
            </SectionLabel>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="mt-8 flex justify-center">
            <BrandMark className="h-14 w-14" />
          </div>
        </Reveal>

        <Reveal delay={0.15}>
          <h2 className="editorial-title mt-6 text-[clamp(2.4rem,7vw,5rem)] text-white text-balance">
            See the
            <span className="italic text-[var(--amber)]"> command center.</span>
          </h2>
        </Reveal>

        <Reveal delay={0.25}>
          <p className="editorial-lead mx-auto mt-6 max-w-2xl text-[clamp(1.05rem,1.6vw,1.3rem)] text-white/70 text-pretty">
            Built for fleets that cannot afford to react late. IntelliLog-AI turns live
            telemetry into decisions — explainable, auditable, and operational from day one.
          </p>
        </Reveal>

        <Reveal delay={0.35}>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" variant="dark" iconRight={<ArrowUpRight className="h-4 w-4" />} onClick={() => navigate('/app')}>
              See the command center
            </Button>
            <Button size="lg" variant="secondary" iconRight={<ArrowRight className="h-4 w-4" />} onClick={() => document.getElementById('intelligence-layer')?.scrollIntoView({ behavior: 'smooth' })}>
              Explore the architecture
            </Button>
            <Button size="lg" variant="ghost" className="text-white/80 hover:bg-white/10" iconRight={<ArrowRight className="h-4 w-4" />} onClick={() => navigate('/app')}>
              View the live system
            </Button>
          </div>
        </Reveal>

        {/* Three-up "what's next" strip */}
        <Reveal delay={0.4}>
          <div className="mt-16 grid gap-4 sm:grid-cols-3">
            <NextCard
              icon={Monitor}
              kicker="Mission Control"
              title="Walk through the live preview"
              body="See the dashboard operators use every minute — fleet, risk, AI command, system health."
            />
            <NextCard
              icon={Layers}
              kicker="Architecture"
              title="Inspect the intelligence stack"
              body="Ten coordinated layers from Redis Streams to Gemini. Each one observable, replaceable."
            />
            <NextCard
              icon={Radio}
              kicker="Live system"
              title="Connect to a real deployment"
              body="Provisioned environments for qualified pilots — streaming real telemetry within 48 hours."
            />
          </div>
        </Reveal>

        {/* Closing statement */}
        <Reveal delay={0.45}>
          <div className="mt-16 flex items-center justify-center gap-3">
            <span className="h-px w-12 bg-white/20" />
            <span className="font-mono text-[11px] tracking-[0.18em] uppercase text-white/55">
              Built for serious operations
            </span>
            <span className="h-px w-12 bg-white/20" />
          </div>
          <p className="mx-auto mt-4 max-w-xl font-display text-[15px] italic text-white/60 text-pretty">
            "The system is alive, coordinated, and ready. The only question left is whether your
            fleet can afford to keep reacting."
          </p>
        </Reveal>
      </div>
    </section>
  )
}

function NextCard({
  icon: Icon,
  kicker,
  title,
  body,
}: {
  icon: any
  kicker: string
  title: string
  body: string
}) {
  return (
    <motion.div
      whileHover={{ y: -3 }}
      className="glass-dark rounded-2xl p-5 text-left transition-all duration-300"
    >
      <div className="flex items-center justify-between">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.08] text-[var(--amber)]">
          <Icon className="h-4 w-4" />
        </div>
        <ArrowUpRight className="h-4 w-4 text-white/40 transition-colors group-hover:text-white" />
      </div>
      <div className="mt-4 font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--amber)]">{kicker}</div>
      <div className="mt-1 font-display text-[15px] font-medium text-white">{title}</div>
      <p className="mt-2 text-[12.5px] leading-relaxed text-white/65">{body}</p>
    </motion.div>
  )
}
