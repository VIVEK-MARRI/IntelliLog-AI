// k6 load test for IntelliLog-AI dashboard
// Usage:
//   k6 run -e API_URL=http://localhost:8000 -e WS_URL=ws://localhost:8000/ws \
//          -e PROFILE=small tests/load/dashboard.js
//
// Profiles: small (50 orders, 15 drivers), medium (100, 30), large (500, 100)

import http from 'k6/http'
import { check, sleep } from 'k6'
import { Counter, Rate, Trend } from 'k6/metrics'
import ws from 'k6/ws'

const API_URL = __ENV.API_URL || 'http://localhost:8000'
const WS_URL = __ENV.WS_URL || 'ws://localhost:8000/ws'
const PROFILE = __ENV.PROFILE || 'small'
const TEST_EMAIL = __ENV.E2E_EMAIL || 'qa@intellilog.ai'
const TEST_PASSWORD = __ENV.E2E_PASSWORD || 'TestPassword!23'

const profile = {
  small: { orders: 50, drivers: 15, vus: 10, duration: '30s' },
  medium: { orders: 100, drivers: 30, vus: 25, duration: '1m' },
  large: { orders: 500, drivers: 100, vus: 50, duration: '2m' },
}[PROFILE] || { orders: 50, drivers: 15, vus: 10, duration: '30s' }

export const options = {
  scenarios: {
    dashboard_load: {
      executor: 'constant-vus',
      vus: profile.vus,
      duration: profile.duration,
      tags: { scenario: 'dashboard' },
    },
    websocket_load: {
      executor: 'constant-vus',
      vus: Math.max(2, Math.floor(profile.vus / 5)),
      duration: profile.duration,
      tags: { scenario: 'websocket' },
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<1000'],
    http_req_failed: ['rate<0.01'],
    'ws_session_duration': ['p(95)<30000'],
    'ws_msgs_received': ['count>0'],
  },
}

const apiDuration = new Trend('api_duration_ms', true)
const apiFailed = new Rate('api_failed')
const wsMessages = new Counter('ws_msgs_received')
const optimizeLatency = new Trend('optimize_latency_ms', true)

export function setup() {
  const loginRes = http.post(`${API_URL}/api/v1/auth/login`, JSON.stringify({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  }), { headers: { 'Content-Type': 'application/json' } })

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${loginRes.status} ${loginRes.body}`)
  }
  const { access_token, tenant } = JSON.parse(loginRes.body)
  return { token: access_token, tenant }
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  }

  const t0 = Date.now()
  const ordersRes = http.get(`${API_URL}/api/v1/orders?page=1&page_size=${profile.orders}`, { headers })
  apiDuration.add(Date.now() - t0)
  apiFailed.add(ordersRes.status !== 200)
  check(ordersRes, {
    'orders 200': (r) => r.status === 200,
    'orders has items': (r) => {
      try {
        return JSON.parse(r.body).items.length > 0
      } catch {
        return false
      }
    },
  })

  const metricsRes = http.get(`${API_URL}/api/v1/predictions/operational-metrics`, { headers })
  apiFailed.add(metricsRes.status !== 200)
  check(metricsRes, { 'metrics 200': (r) => r.status === 200 })

  const healthRes = http.get(`${API_URL}/api/v1/predictions/fleet-health`, { headers })
  apiFailed.add(healthRes.status !== 200)
  check(healthRes, { 'health 200': (r) => r.status === 200 })

  const optT0 = Date.now()
  const optRes = http.post(`${API_URL}/api/v1/routes/optimize`, JSON.stringify({
    order_ids: [],
    driver_ids: [],
  }), { headers })
  optimizeLatency.add(Date.now() - optT0)
  apiFailed.add(optRes.status >= 500)
  check(optRes, { 'optimize not 5xx': (r) => r.status < 500 })

  sleep(1)
}

export function handleSummary(data) {
  return {
    'reports/k6-summary.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  }
}

function textSummary(data) {
  const lines = []
  lines.push('=== k6 Load Test Summary ===')
  lines.push(`Profile: ${PROFILE} (${profile.orders} orders, ${profile.drivers} drivers, ${profile.vus} VUs)`)
  lines.push('')
  for (const key of Object.keys(data.metrics)) {
    if (key.startsWith('__')) continue
    const m = data.metrics[key]
    if (m.values) {
      const v = m.values
      lines.push(`${key}: p50=${v.median?.toFixed?.(1) ?? '-'} p95=${v['p(95)']?.toFixed?.(1) ?? '-'} p99=${v['p(99)']?.toFixed?.(1) ?? '-'} count=${v.count ?? 0}`)
    }
  }
  return lines.join('\n')
}
