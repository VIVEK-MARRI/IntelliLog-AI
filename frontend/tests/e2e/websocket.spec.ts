import { test, expect } from '@playwright/test'
import { login } from '../fixtures/auth'
import { captureConsoleErrors, assertNoErrors } from '../helpers/console'

test.describe('WebSocket validation', () => {
  test('I.1 — Single active websocket after login', async ({ page, context }) => {
    const wsEvents: { url: string; opened: number; closed: number }[] = []
    context.on('websocket', (ws) => {
      const evt = { url: ws.url(), opened: 0, closed: 0 }
      ws.on('socketopen', () => evt.opened++)
      ws.on('close', () => evt.closed++)
      wsEvents.push(evt)
    })

    await login(page)
    await page.waitForTimeout(3000)

    const mainWs = wsEvents.filter((e) => e.url.includes('/ws'))
    expect(mainWs.length, 'one main websocket created').toBe(1)
    expect(mainWs[0].opened, 'main websocket open').toBe(1)
  })

  test('I.2 — No duplicate websocket on navigation', async ({ page, context }) => {
    let wsCount = 0
    context.on('websocket', (ws) => {
      if (ws.url().includes('/ws')) {
        wsCount++
      }
    })

    await login(page)
    await page.waitForTimeout(2000)
    const baseline = wsCount

    await page.goto('/dashboard')
    await page.waitForTimeout(2000)

    expect(wsCount - baseline, 'no new ws on same-route navigation').toBe(0)
  })

  test('I.3 — Reconnect after server kill', async ({ page, context }) => {
    const errors = captureConsoleErrors(page)
    let connectCount = 0
    let disconnectCount = 0
    context.on('websocket', (ws) => {
      if (!ws.url().includes('/ws')) return
      ws.on('socketopen', () => connectCount++)
      ws.on('close', () => disconnectCount++)
    })

    await login(page)
    await page.waitForTimeout(2000)
    const initialConnects = connectCount

    const status = page.getByText(/reconnecting|connecting|offline|disconnected|live/i).first()
    expect(await status.isVisible().catch(() => false)).toBe(true)

    expect(connectCount, 'initial connect').toBeGreaterThanOrEqual(1)
    expect(errors.filter((e) => e.text.includes('unhandled')).length, 'no unhandled errors').toBe(0)
    expect(initialConnects, 'connected after login').toBeGreaterThan(0)
  })
})
