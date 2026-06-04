import { useEffect, useRef } from 'react'

interface PerformanceMetrics {
  fps: number
  frameTime: number
  markerCount: number
  lastUpdated: number
}

const listeners = new Set<(metrics: PerformanceMetrics) => void>()
let frameCount = 0
let lastFpsTime = performance.now()
let latestFps = 60
let rafId: number | null = null

function tick() {
  const now = performance.now()
  const delta = now - lastFpsTime
  frameCount++
  if (delta >= 1000) {
    latestFps = Math.round((frameCount * 1000) / delta)
    const frameTimeMs = Math.round(delta / Math.max(frameCount, 1))
    frameCount = 0
    lastFpsTime = now
    const metrics: PerformanceMetrics = {
      fps: latestFps,
      frameTime: frameTimeMs,
      markerCount: 0,
      lastUpdated: now,
    }
    listeners.forEach((fn) => fn(metrics))
  }
  rafId = requestAnimationFrame(tick)
}

let started = false
function ensureRunning() {
  if (!started) {
    started = true
    rafId = requestAnimationFrame(tick)
  }
}

export function usePerformanceMonitor(callback: (metrics: PerformanceMetrics) => void) {
  const cbRef = useRef(callback)
  cbRef.current = callback

  useEffect(() => {
    ensureRunning()
    const handler = (m: PerformanceMetrics) => cbRef.current(m)
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
    }
  }, [])
}

export function stopPerformanceMonitor() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  started = false
}
