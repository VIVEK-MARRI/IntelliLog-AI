'use client'

import { motion } from 'framer-motion'
import { BrandMark } from './navigation'

const FOOTER_LINKS: Record<string, { label: string; href: string }[]> = {
  Platform: [
    { label: 'Mission Control', href: '#mission-control' },
    { label: 'Intelligence Layer', href: '#intelligence-layer' },
    { label: 'Trust & Explainability', href: '#trust' },
    { label: 'Performance', href: '#performance' },
  ],
  Stack: [
    { label: 'XGBoost · Risk model', href: '#intelligence-layer' },
    { label: 'LangGraph · Agent', href: '#intelligence-layer' },
    { label: 'Gemini · Recommendations', href: '#intelligence-layer' },
    { label: 'OR-Tools · Optimization', href: '#intelligence-layer' },
  ],
  Company: [
    { label: 'About', href: '#' },
    { label: 'Engineering blog', href: '#' },
    { label: 'Careers', href: '#' },
    { label: 'Contact', href: '#' },
  ],
}

export function Footer() {
  return (
    <footer className="surface-porcelain relative overflow-hidden border-t border-[var(--border)]">
      <div className="pointer-events-none absolute inset-0 atlas-grid opacity-30" />

      <div className="relative mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
        {/* Top — brand + nav */}
        <div className="grid gap-10 lg:grid-cols-[1.4fr_2fr] lg:gap-16">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7 }}
              className="flex items-center gap-2.5"
            >
              <BrandMark />
              <span className="font-display text-[18px] font-medium tracking-tight text-[var(--navy)]">
                IntelliLog<span className="text-[var(--teal)]">-AI</span>
              </span>
            </motion.div>
            <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-[var(--slate)] text-pretty">
              Operational intelligence for logistics. Live fleet telemetry, predictive risk,
              explainable decisions, and executive visibility — coordinated in real time.
            </p>
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--sage)]/30 bg-[var(--sage)]/[0.08] px-3 py-1.5">
              <span className="status-dot text-[var(--sage)]" style={{ background: 'oklch(0.62 0.05 145)' }} />
              <span className="font-mono text-[10px] tracking-[0.16em] uppercase text-[var(--sage)]">
                All systems operational
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {Object.entries(FOOTER_LINKS).map(([heading, links]) => (
              <div key={heading}>
                <div className="font-mono text-[10px] tracking-[0.18em] uppercase text-[var(--slate)]/70">
                  {heading}
                </div>
                <ul className="mt-3 space-y-2">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        className="text-[13px] text-[var(--navy)] transition-colors hover:text-[var(--teal)]"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Hairline */}
        <div className="mt-12 hairline w-full" />

        {/* Bottom — meta row */}
        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex flex-wrap items-center gap-4 font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">
            <span>© 2025 IntelliLog-AI</span>
            <span className="hidden h-3 w-px bg-[var(--border)] sm:block" />
            <span>Build 4.2.0</span>
            <span className="hidden h-3 w-px bg-[var(--border)] sm:block" />
            <span>Region · US-WEST</span>
            <span className="hidden h-3 w-px bg-[var(--border)] sm:block" />
            <span>SOC 2 · Type II</span>
          </div>
          <div className="flex items-center gap-3 font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--slate)]/70">
            <a href="#" className="hover:text-[var(--navy)]">Privacy</a>
            <a href="#" className="hover:text-[var(--navy)]">Terms</a>
            <a href="#" className="hover:text-[var(--navy)]">Security</a>
          </div>
        </div>

        {/* Massive wordmark — watermark */}
        <div
          aria-hidden="true"
          className="mt-12 select-none overflow-hidden text-center"
        >
          <div className="font-display text-[clamp(3rem,16vw,12rem)] font-medium leading-none text-[var(--navy)]/[0.06] tracking-tighter">
            IntelliLog-AI
          </div>
        </div>
      </div>
    </footer>
  )
}
