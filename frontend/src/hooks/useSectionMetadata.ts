import { useState, useCallback, useRef } from 'react'

export type RefreshStatus = 'idle' | 'loading' | 'ok' | 'error' | 'stale'

export interface SectionMetadata {
  lastUpdated: string | null
  refreshStatus: RefreshStatus
  dataQuality: number | null
  missingFields: string[]
}

const STALE_AFTER_MS = 60000

/**
 * Tracks metadata for a dashboard section: last updated time, refresh status,
 * data quality score, and missing fields. Handles staleness detection.
 */
export function useSectionMetadata() {
  const [meta, setMeta] = useState<SectionMetadata>({
    lastUpdated: null,
    refreshStatus: 'idle',
    dataQuality: null,
    missingFields: [],
  })
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const markLoading = useCallback(() => {
    setMeta((prev) => ({ ...prev, refreshStatus: 'loading' }))
  }, [])

  const markOk = useCallback((opts?: {
    timestamp?: string
    quality?: number
    missing?: string[]
  }) => {
    setMeta({
      lastUpdated: opts?.timestamp || new Date().toISOString(),
      refreshStatus: 'ok',
      dataQuality: opts?.quality ?? null,
      missingFields: opts?.missing ?? [],
    })
  }, [])

  const markError = useCallback(() => {
    setMeta((prev) => ({ ...prev, refreshStatus: 'error' }))
  }, [])

  const markStale = useCallback(() => {
    setMeta((prev) => ({ ...prev, refreshStatus: 'stale' }))
  }, [])

  // Auto-detect staleness
  const startStaleMonitor = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setMeta((prev) => {
        if (!prev.lastUpdated) return prev
        const age = Date.now() - new Date(prev.lastUpdated).getTime()
        if (age > STALE_AFTER_MS && prev.refreshStatus === 'ok') {
          return { ...prev, refreshStatus: 'stale' }
        }
        return prev
      })
    }, 10000)
  }, [])

  const stopStaleMonitor = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  return { meta, markLoading, markOk, markError, markStale, startStaleMonitor, stopStaleMonitor }
}
