/**
 * Demo Mode — One-click scenario playback for platform demonstrations.
 * Floating control center with scenario selector, timeline progress,
 * and speed control. Accessible from any page via AppShell.
 */

import React, { useState, useCallback } from 'react'
import clsx from 'clsx'
import {
  Play, Pause, Stop, CaretRight, Lightning,
  WarningCircle, CloudSun, RoadHorizon, SuitcaseSimple,
} from '@phosphor-icons/react'
import { useDemoStore, SPEED_OPTIONS, DEMO_COLORS } from '@/store/demoStore'
import { SCENARIO_LIST } from '@/data/demoScenarios'
import type { ScenarioType } from '@/data/demoScenarios'
import type { DemoSpeed } from '@/store/demoStore'

// ─── Icons per scenario ───────────────────────────────────────────────────

const SCENARIO_ICONS: Record<string, React.ElementType> = {
  normal: Lightning,
  incident: WarningCircle,
  peak_load: ChartIcon,
  weather: CloudSun,
  traffic: RoadHorizon,
  executive: SuitcaseSimple,
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="18" rx="1" />
      <rect x="14" y="8" width="7" height="13" rx="1" />
    </svg>
  )
}

function ScenarioIcon({ type, className }: { type: ScenarioType; className?: string }) {
  const Icon = SCENARIO_ICONS[type]
  return Icon ? <Icon className={className} /> : null
}

// ─── Main Component ──────────────────────────────────────────────────────

export const DemoMode: React.FC = () => {
  const {
    isActive, scenario, speed, currentTick, totalTicks,
    startScenario, stop, pause, resume, setSpeed,
  } = useDemoStore()

  const [expanded, setExpanded] = useState(false)

  const isPaused = isActive && !useDemoStore.getState().tickInterval

  const handleStart = useCallback((type: ScenarioType) => {
    startScenario(type)
    setExpanded(true)
  }, [startScenario])

  const handleStop = useCallback(() => {
    stop()
    setExpanded(false)
  }, [stop])

  const handleTogglePause = useCallback(() => {
    if (isPaused) {
      resume()
    } else {
      pause()
    }
  }, [isPaused, resume, pause])

  const handleSpeed = useCallback((s: DemoSpeed) => {
    setSpeed(s)
  }, [setSpeed])

  // ── Not active: floating trigger button ──────────────────────────────
  if (!isActive) {
    return (
      <>
        {/* Floating trigger */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={clsx(
            'fixed bottom-6 right-6 z-50 flex items-center gap-2',
            'px-4 py-3 rounded-xl shadow-lg border transition-all duration-200',
            expanded
              ? 'bg-abyss border-steel-grey/40 shadow-steel-grey/10'
              : 'bg-accent border-accent/50 shadow-accent/20 hover:shadow-accent/30',
          )}
        >
          {!expanded && (
            <Lightning className="w-4 h-4 text-white" weight="fill" />
          )}
          <span className={clsx('text-sm font-semibold', expanded ? 'text-pearl' : 'text-white')}>
            {expanded ? 'Close Demo' : 'Demo Mode'}
          </span>
        </button>

        {/* Expanded selector panel */}
        {expanded && (
          <div className="fixed bottom-20 right-6 z-50 w-80 bg-abyss border border-steel-grey/30 rounded-xl shadow-xl overflow-hidden animate-fade-in">
            <div className="px-4 py-3 border-b border-steel-grey/20">
              <h3 className="text-sm font-semibold text-pearl">Demo Mode</h3>
              <p className="text-[10px] text-mist/50">Select a scenario to experience the platform</p>
            </div>
            <div className="p-2 space-y-1 max-h-80 overflow-y-auto">
              {SCENARIO_LIST.map((s) => {
                const color = DEMO_COLORS[s.id]
                const Icon = SCENARIO_ICONS[s.id] || Lightning
                return (
                  <button
                    key={s.id}
                    onClick={() => handleStart(s.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-navy/50 transition-colors text-left group"
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${color}15`, color }}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-semibold text-pearl group-hover:text-white transition-colors">
                        {s.label}
                      </div>
                      <div className="text-[10px] text-mist/60 truncate">{s.description}</div>
                    </div>
                    <div className="text-[9px] text-mist/40 font-mono shrink-0">{s.eventCount} events</div>
                  </button>
                )
              })}
            </div>
            <div className="px-4 py-2 border-t border-steel-grey/20 bg-navy/30">
              <p className="text-[9px] text-mist/30 text-center">
                Data is simulated. No external dependencies required.
              </p>
            </div>
          </div>
        )}
      </>
    )
  }

  // ── Active: playback control panel ──────────────────────────────────
  const color = scenario ? DEMO_COLORS[scenario] : '#0EA5E9'
  const progressPct = totalTicks > 0 ? (currentTick / totalTicks) * 100 : 0
  const elapsedSec = Math.floor(Date.now() - (useDemoStore.getState().startedAt || Date.now())) / 1000

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[520px] max-w-[calc(100vw-32px)]">
      <div className="bg-abyss/95 backdrop-blur-xl border border-steel-grey/30 rounded-xl shadow-xl overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-navy/60">
          <div
            className="h-full transition-all duration-300 ease-linear"
            style={{ width: `${progressPct}%`, backgroundColor: color }}
          />
        </div>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            {/* Scenario info */}
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${color}20`, color }}
              >
                {scenario && <ScenarioIcon type={scenario} className="w-3.5 h-3.5" />}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold text-pearl truncate block">
                  {scenario && SCENARIO_LIST.find(s => s.id === scenario)?.label}
                </span>
                <span className="text-[9px] text-mist/40 font-mono">
                  T+{elapsedSec.toFixed(0)}s · Tick {currentTick}/{totalTicks}
                </span>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1">
              {/* Play/Pause */}
              <button
                onClick={handleTogglePause}
                className={clsx(
                  'p-1.5 rounded-lg transition-colors',
                  isPaused ? 'text-accent hover:bg-accent/10' : 'text-pearl hover:bg-navy/50',
                )}
                title={isPaused ? 'Resume' : 'Pause'}
              >
                {isPaused ? <Play className="w-4 h-4" weight="fill" /> : <Pause className="w-4 h-4" weight="fill" />}
              </button>

              {/* Step forward */}
              <button
                onClick={() => useDemoStore.getState().advanceTick()}
                className="p-1.5 rounded-lg text-mist/60 hover:text-pearl hover:bg-navy/50 transition-colors"
                title="Step forward"
              >
                <CaretRight className="w-4 h-4" weight="bold" />
              </button>

              {/* Speed selector */}
              <div className="flex items-center gap-0.5 ml-1 border-l border-steel-grey/20 pl-2">
                {SPEED_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleSpeed(opt.value)}
                    className={clsx(
                      'px-1.5 py-0.5 rounded text-[10px] font-mono font-medium transition-colors',
                      speed === opt.value
                        ? 'text-white'
                        : 'text-mist/40 hover:text-mist/70',
                    )}
                    style={speed === opt.value ? { backgroundColor: `${color}25`, color: color } : undefined}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Stop */}
              <button
                onClick={handleStop}
                className="p-1.5 rounded-lg text-mist/40 hover:text-critical hover:bg-critical-bg transition-colors ml-1"
                title="Stop demo"
              >
                <Stop className="w-4 h-4" weight="fill" />
              </button>
            </div>
          </div>

          {/* Timeline ticks */}
          {totalTicks > 0 && (
            <div className="flex items-center gap-0.5 mt-1">
              {Array.from({ length: Math.min(totalTicks, 30) }, (_, i) => {
                const tickNum = i + 1
                const isPast = tickNum <= currentTick
                const hasEvent = scenario
                  ? (useDemoStore.getState().definition?.events.some(e => e.tick === tickNum))
                  : false
                return (
                  <div
                    key={i}
                    className={clsx(
                      'h-1.5 rounded-sm flex-1 transition-all duration-300',
                      isPast ? 'opacity-80' : 'opacity-20',
                    )}
                    style={{
                      backgroundColor: hasEvent ? color : isPast ? color : 'rgb(42 58 92)',
                      opacity: isPast ? (hasEvent ? 1 : 0.5) : 0.2,
                    }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}