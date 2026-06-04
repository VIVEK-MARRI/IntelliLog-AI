import { useRef, useCallback, useEffect } from 'react'

interface PositionState {
  lat: number
  lng: number
  speed_kmh: number
  heading: number
}

interface SmoothPositionOptions {
  /** Duration multiplier (higher = slower interpolation). Default 1. */
  durationFactor?: number
  /** Minimum transition time in ms. Default 200. */
  minDuration?: number
  /** Maximum transition time in ms. Default 3000. */
  maxDuration?: number
}

const DEFAULT_OPTIONS: Required<SmoothPositionOptions> = {
  durationFactor: 1,
  minDuration: 200,
  maxDuration: 3000,
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2)
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function computeDuration(
  current: PositionState,
  target: PositionState,
  options: Required<SmoothPositionOptions>
): number {
  const dist = distanceKm(current.lat, current.lng, target.lat, target.lng)
  const speedMs = Math.max(target.speed_kmh, 1) / 3.6
  let duration = (dist / speedMs) * 1000 * options.durationFactor
  duration = Math.max(options.minDuration, Math.min(options.maxDuration, duration))
  return duration
}

export function useSmoothPosition(
  rawLat: number,
  rawLng: number,
  rawSpeed: number,
  rawHeading: number,
  options?: SmoothPositionOptions
) {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const currentRef = useRef<PositionState>({ lat: rawLat, lng: rawLng, speed_kmh: rawSpeed, heading: rawHeading })
  const targetRef = useRef<PositionState>({ lat: rawLat, lng: rawLng, speed_kmh: rawSpeed, heading: rawHeading })
  const animationRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const startPosRef = useRef<PositionState>({ lat: rawLat, lng: rawLng, speed_kmh: rawSpeed, heading: rawHeading })
  const durationRef = useRef<number>(0)
  const isAnimatingRef = useRef(false)
  const rawRef = useRef({ lat: rawLat, lng: rawLng, speed_kmh: rawSpeed, heading: rawHeading })

  const updateRaw = useCallback((lat: number, lng: number, speed: number, heading: number) => {
    rawRef.current = { lat, lng, speed_kmh: speed, heading }
  }, [])

  const animate = useCallback(() => {
    const now = performance.now()
    const elapsed = now - startTimeRef.current
    const t = durationRef.current > 0 ? Math.min(elapsed / durationRef.current, 1) : 1
    const eased = t * (2 - t)

    currentRef.current = {
      lat: lerp(startPosRef.current.lat, targetRef.current.lat, eased),
      lng: lerp(startPosRef.current.lng, targetRef.current.lng, eased),
      speed_kmh: lerp(startPosRef.current.speed_kmh, targetRef.current.speed_kmh, eased),
      heading: lerp(startPosRef.current.heading, targetRef.current.heading, eased),
    }

    if (t < 1) {
      animationRef.current = requestAnimationFrame(animate)
    } else {
      currentRef.current = { ...targetRef.current }
      isAnimatingRef.current = false
      animationRef.current = null
    }
  }, [])

  const smoothSet = useCallback((lat: number, lng: number, speed: number, heading: number) => {
    const target: PositionState = { lat, lng, speed_kmh: speed, heading }
    targetRef.current = target

    if (isAnimatingRef.current) {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = null
      }
      startPosRef.current = { ...currentRef.current }
    } else {
      startPosRef.current = { ...currentRef.current }
    }

    const duration = computeDuration(startPosRef.current, target, opts)
    durationRef.current = duration
    startTimeRef.current = performance.now()
    isAnimatingRef.current = true
    animationRef.current = requestAnimationFrame(animate)
  }, [animate, opts])

  useEffect(() => {
    const { lat, lng } = rawRef.current
    if (lat !== rawLat || lng !== rawLng) {
      updateRaw(rawLat, rawLng, rawSpeed, rawHeading)
      smoothSet(rawLat, rawLng, rawSpeed, rawHeading)
    }
  }, [rawLat, rawLng, rawSpeed, rawHeading, updateRaw, smoothSet])

  useEffect(() => {
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [])

  return currentRef
}

export type { PositionState }
