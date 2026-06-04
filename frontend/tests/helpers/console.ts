import type { ConsoleMessage, Page } from '@playwright/test'

export interface CapturedError {
  type: 'console' | 'pageerror' | 'unhandledrejection'
  text: string
  location?: string
  timestamp: number
}

const NOISE_PATTERNS = [
  /favicon/i,
  /DevTools/i,
  /Download the React DevTools/i,
  /leaflet.*tile/i,
  /tile\.openstreetmap/i,
  /carto\.com/i,
]

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(text))
}

export function captureConsoleErrors(page: Page): CapturedError[] {
  const errors: CapturedError[] = []

  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (isNoise(text)) return
    errors.push({
      type: 'console',
      text,
      location: msg.location()?.url,
      timestamp: Date.now(),
    })
  })

  page.on('pageerror', (err: Error) => {
    if (isNoise(err.message)) return
    errors.push({
      type: 'pageerror',
      text: err.message + (err.stack ? '\n' + err.stack.split('\n').slice(0, 3).join('\n') : ''),
      timestamp: Date.now(),
    })
  })

  page.on('requestfailed', (req) => {
    const url = req.url()
    if (isNoise(url)) return
    const failure = req.failure()
    errors.push({
      type: 'console',
      text: `REQUEST_FAILED: ${req.method()} ${url} — ${failure?.errorText ?? 'unknown'}`,
      location: url,
      timestamp: Date.now(),
    })
  })

  return errors
}

export function assertNoErrors(errors: CapturedError[], contextLabel: string) {
  const real = errors.filter((e) => !isNoise(e.text))
  if (real.length === 0) return
  const lines = real.map((e) => `  [${e.type}] ${e.text}`).join('\n')
  throw new Error(`Unexpected runtime errors during ${contextLabel}:\n${lines}`)
}
