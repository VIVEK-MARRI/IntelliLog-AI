import type { Page, Request } from '@playwright/test'

export interface NetworkLog {
  method: string
  url: string
  status: number
  ok: boolean
  durationMs: number
  timestamp: number
}

const IGNORE_HOSTS = ['tile.openstreetmap.org', 'basemaps.cartocdn.com', 'fonts.googleapis']

function shouldIgnore(url: string): boolean {
  return IGNORE_HOSTS.some((h) => url.includes(h))
}

export function captureNetwork(page: Page): NetworkLog[] {
  const log: NetworkLog[] = []
  const startTimes = new Map<string, number>()

  page.on('request', (req: Request) => {
    if (shouldIgnore(req.url())) return
    startTimes.set(req.url() + '::' + Date.now(), Date.now())
  })

  page.on('response', (res) => {
    if (shouldIgnore(res.url())) return
    log.push({
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      ok: res.ok(),
      durationMs: 0,
      timestamp: Date.now(),
    })
  })

  page.on('requestfailed', (req) => {
    if (shouldIgnore(req.url())) return
    log.push({
      method: req.method(),
      url: req.url(),
      status: 0,
      ok: false,
      durationMs: 0,
      timestamp: Date.now(),
    })
  })

  return log
}

export function failedRequests(log: NetworkLog[]): NetworkLog[] {
  return log.filter((r) => !r.ok && r.status !== 304)
}

export function assertNoFailedRequests(log: NetworkLog[], contextLabel: string) {
  const failed = failedRequests(log)
  if (failed.length === 0) return
  const lines = failed.map((r) => `  ${r.method} ${r.url} → ${r.status}`).join('\n')
  throw new Error(`Failed network requests during ${contextLabel}:\n${lines}`)
}
