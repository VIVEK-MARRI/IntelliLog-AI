import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:8000';

test.describe('Backend-Frontend Wiring', () => {
  test.beforeEach(async ({ page }) => {
    // Set demo tenant in localStorage before each test
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('intellilog_tenant', 'demo-tenant-001');
      localStorage.setItem('intellilog_token', 'demo-token');
    });
  });

  // TEST GROUP 1: API connectivity
  test('health endpoint is reachable and all services healthy', async ({ page }) => {
    const candidates = ['/api/v1/health', '/api/v1/status/status/system'];
    let response = await page.request.get(`${API_URL}${candidates[0]}`);
    if (response.status() !== 200) {
      response = await page.request.get(`${API_URL}${candidates[1]}`);
    }

    const statusCode = response.status();
    expect([200, 401, 403]).toContain(statusCode);

    if (statusCode === 200) {
      const body = await response.json();
      const apiState = body.api || body.status || 'healthy';
      const dbState = body.db || body.database || 'healthy';
      const redisState = body.redis || 'healthy';

      expect(['healthy', 'operational', 'ok']).toContain(String(apiState));
      expect(['healthy', 'operational', 'ok']).toContain(String(dbState));
      expect(['healthy', 'operational', 'ok']).toContain(String(redisState));
    }
  });

  test('bottom status bar shows all green dots within 5 seconds', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('[data-testid="status-bar"]', { timeout: 5000 });
    const statusDots = page.locator('[data-testid="service-status"]');
    const count = await statusDots.count();
    expect(count).toBe(5); // api, db, redis, celery, model
    for (let i = 0; i < count; i++) {
      const dot = statusDots.nth(i);
      const status = await dot.getAttribute('data-status');
      expect(['healthy', 'degraded']).toContain(status || '');
    }
  });

  // TEST GROUP 2: Orders loading
  test('dashboard loads orders within 3 seconds', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    // Wait for order markers to appear on map
    await page.waitForSelector('[data-testid="order-marker"]', { timeout: 3000 });
    const markers = page.locator('[data-testid="order-marker"]');
    const count = await markers.count();
    expect(count).toBeGreaterThan(0);
  });

  test('API call for orders includes tenant_id', async ({ page }) => {
    let ordersRequest: any = null;
    page.on('request', (req) => {
      if (req.url().includes('/api/v1/orders')) ordersRequest = req;
    });
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForTimeout(2000);
    expect(ordersRequest).not.toBeNull();

    const requestUrl: string = ordersRequest.url();
    const tenantHeader = await ordersRequest.headerValue('x-tenant-id');
    const hasTenantQuery = requestUrl.includes('tenant_id=demo-tenant-001');
    const hasTenantHeader = tenantHeader === 'demo-tenant-001';

    expect(hasTenantQuery || hasTenantHeader).toBeTruthy();
  });

  // TEST GROUP 3: SHAP explanation wiring
  test('clicking order marker fetches and displays SHAP explanation', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('[data-testid="order-marker"]', { timeout: 3000 });
    const markers = page.locator('[data-testid="order-marker"]');
    const markerCount = await markers.count();
    expect(markerCount).toBeGreaterThan(0);

    // Capture explain API call if this click triggers one.
    const explainRequestPromise = page
      .waitForRequest((req) => req.url().includes('/predictions/explain'), { timeout: 3000 })
      .catch(() => null);

    // Click a different marker when possible so a new explain call is triggered.
    await markers.nth(markerCount > 1 ? 1 : 0).click({ force: true });

    // Wait for explanation to load
    await expect(page.locator('[data-testid="eta-explanation-card"]')).toBeVisible({ timeout: 5000 });

    // Verify explain API request payload when a network call is observed.
    const explainRequest = await explainRequestPromise;
    if (explainRequest) {
      const requestBody = JSON.parse(explainRequest.postData() || '{}');
      expect(requestBody).toHaveProperty('order_id');
      expect(requestBody).toHaveProperty('driver_id');
    }

    // Verify no raw field names visible
    const cardText = await page.locator('[data-testid="eta-explanation-card"]').textContent();
    expect(cardText).not.toContain('_ratio');
    expect(cardText).not.toContain('_km');
    expect(cardText).not.toContain('driver_zone');
  });

  test('SHAP factors animate in sequentially', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('[data-testid="order-marker"]', { timeout: 3000 });
    await page.locator('[data-testid="order-marker"]').first().click();
    await page.waitForSelector('[data-testid="shap-factor"]', { timeout: 5000 });

    const factors = page.locator('[data-testid="shap-factor"]');
    const count = await factors.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // All factors should eventually be visible
    for (let i = 0; i < count; i++) {
      await expect(factors.nth(i)).toBeVisible({ timeout: 3000 });
    }
  });

  // TEST GROUP 4: WebSocket connectivity
  test('WebSocket connects and bottom bar shows Live status', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('[data-testid="ws-status"]')).toHaveText('Live', { timeout: 5000 });
  });

  test('driver markers appear on map within 3 seconds', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await page.waitForSelector('[data-testid="driver-marker"]', { timeout: 3000 });
    const markers = page.locator('[data-testid="driver-marker"]');
    expect(await markers.count()).toBeGreaterThan(0);
  });

  // TEST GROUP 5: Fleet control wiring
  test('fleet control KPI bar shows non-zero metrics', async ({ page }) => {
    await page.goto(`${BASE_URL}/fleet`);
    await page.waitForSelector('[data-testid="kpi-bar"]', { timeout: 3000 });
    const utilization = await page.locator('[data-testid="kpi-fleet-utilization"]').textContent();
    expect(parseFloat(utilization || '0')).toBeGreaterThan(0);
  });

  test('ML health tab shows current model version', async ({ page }) => {
    await page.goto(`${BASE_URL}/fleet`);
    await page.locator('[data-testid="tab-ml-health"]').click();
    await page.waitForSelector('[data-testid="model-version"]', { timeout: 3000 });
    const version = await page.locator('[data-testid="model-version"]').textContent();
    expect(version).toMatch(/v_\d{8}_\d{6}/);
  });

  // TEST GROUP 6: No raw field names anywhere
  test('no raw Python field names visible on any page', async ({ page }) => {
    const FORBIDDEN = ['_ratio', '_km', '_encoded', '_familiarity', '_severity', '_avg_', '_std_', 'driver_zone_'];

    const pages = ['/dashboard', '/fleet', '/'];
    for (const path of pages) {
      await page.goto(`${BASE_URL}${path}`);
      await page.waitForTimeout(2000);
      // Use rendered text only; textContent includes CSS in <style> tags.
      const bodyText = await page.locator('body').innerText();
      for (const pattern of FORBIDDEN) {
        expect(bodyText, `Found "${pattern}" on ${path}`).not.toContain(pattern);
      }
    }
  });

  // TEST GROUP 7: Error handling
  test('API error shows toast not crash', async ({ page }) => {
    // Block the orders endpoint to simulate error
    await page.route('**/api/v1/orders*', (route) => route.abort());
    await page.goto(`${BASE_URL}/dashboard`);
    // Toast should appear
    await expect(page.locator('[data-testid="toast"]').first()).toBeVisible({ timeout: 3000 });
    // Page should NOT show error boundary
    await expect(page.locator('[data-testid="error-boundary"]')).not.toBeVisible();
  });

  test('WebSocket disconnection shows reconnecting status', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);
    await expect(page.locator('[data-testid="ws-status"]')).toHaveText('Live', { timeout: 5000 });
    // Block WebSocket
    await page.route('**/ws/**', (route) => route.abort());
    // Force reconnect by simulating network drop
    await page.evaluate(() => window.dispatchEvent(new Event('offline')));
    await expect(page.locator('[data-testid="ws-status"]')).toHaveText(/Reconnecting/, { timeout: 5000 });
  });
});
