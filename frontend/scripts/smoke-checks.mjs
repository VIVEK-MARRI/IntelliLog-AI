#!/usr/bin/env node
// Smoke checks that don't require a browser
// Usage: node scripts/smoke-checks.mjs

import { setTimeout as wait } from 'node:timers/promises'

const API_URL = process.env.VITE_API_URL ?? process.env.API_URL ?? 'http://localhost:8000'
const WS_URL = process.env.VITE_WS_URL ?? process.env.WS_URL ?? 'ws://localhost:8000/ws'
const EMAIL = process.env.E2E_EMAIL ?? 'qa@intellilog.ai'
const PASSWORD = process.env.E2E_PASSWORD ?? 'TestPassword!23'
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 8000)

export async function checkApiHealth() {
  const t0 = Date.now()
  const res = await fetch(`${API_URL}/api/v1/health`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
  }).catch((e) => ({ ok: false, status: 0, error: e.message }))
  const ms = Date.now() - t0
  return {
    name: 'api.health',
    pass: res.ok === true && res.status >= 200 && res.status < 500,
    status: res.status ?? 0,
    ms,
    detail: res.error ?? '',
  }
}

export async function checkCopilotHealth() {
  const t0 = Date.now()
  try {
    const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!loginRes.ok) {
      return { name: 'copilot.health', pass: false, status: loginRes.status, ms: Date.now() - t0, detail: 'login failed' }
    }
    const { access_token } = await loginRes.json()

    const copilotRes = await fetch(`${API_URL}/api/v1/copilot/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({ query: 'health check', context: {} }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const ms = Date.now() - t0
    return {
      name: 'copilot.health',
      pass: copilotRes.status === 200 || copilotRes.status === 503,
      status: copilotRes.status,
      ms,
      detail: copilotRes.status === 503 ? 'gemini unavailable (degraded)' : '',
    }
  } catch (e) {
    return { name: 'copilot.health', pass: false, status: 0, ms: Date.now() - t0, detail: e.message }
  }
}

export async function checkWebSocketHealth() {
  const t0 = Date.now()
  return new Promise((resolve) => {
    let resolved = false
    const finish = (result) => {
      if (resolved) return
      resolved = true
      try { ws?.close() } catch {}
      resolve(result)
    }
    const timer = setTimeout(() => finish({
      name: 'ws.health', pass: false, status: 0, ms: Date.now() - t0, detail: 'timeout',
    }), TIMEOUT_MS)

    let ws
    try {
      ws = new WebSocket(WS_URL)
    } catch (e) {
      clearTimeout(timer)
      return finish({ name: 'ws.health', pass: false, status: 0, ms: Date.now() - t0, detail: e.message })
    }

    ws.onopen = () => {
      clearTimeout(timer)
      finish({ name: 'ws.health', pass: true, status: 101, ms: Date.now() - t0, detail: '' })
    }
    ws.onerror = (e) => {
      clearTimeout(timer)
      finish({ name: 'ws.health', pass: false, status: 0, ms: Date.now() - t0, detail: 'error event' })
    }
    ws.onclose = (e) => {
      clearTimeout(timer)
      if (!resolved) {
        finish({ name: 'ws.health', pass: false, status: e.code, ms: Date.now() - t0, detail: 'closed before open' })
      }
    }
  })
}

export async function runSmokeChecks() {
  const results = await Promise.all([
    checkApiHealth(),
    checkWebSocketHealth(),
    checkCopilotHealth(),
  ])
  return results
}
