import { Navigation } from '@/components/landing/navigation'
import { Hero } from '@/components/landing/hero'
import { ProblemSection } from '@/components/landing/section-problem'
import { PipelineSection } from '@/components/landing/section-pipeline'
import { MissionControlSection } from '@/components/landing/section-mission-control'
import { IntelligenceStackSection } from '@/components/landing/section-intelligence'
import { TrustSection } from '@/components/landing/section-trust'
import { PerformanceSection } from '@/components/landing/section-performance'
import { ExecutiveImpactSection } from '@/components/landing/section-executive'
import { FinalCtaSection } from '@/components/landing/section-final-cta'
import { Footer } from '@/components/landing/footer'
import { ScrollProgress } from '@/components/landing/primitives'
import './landing.css'

export function Landing() {
  return (
    <div className="landing-page relative flex min-h-screen flex-col surface-porcelain">
      <ScrollProgress />
      <Navigation />
      <main className="flex-1">
        <Hero />
        <ProblemSection />
        <PipelineSection />
        <MissionControlSection />
        <IntelligenceStackSection />
        <TrustSection />
        <PerformanceSection />
        <ExecutiveImpactSection />
        <FinalCtaSection />
      </main>
      <Footer />
    </div>
  )
}

export default Landing
