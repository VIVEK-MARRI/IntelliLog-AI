import axios, { AxiosError, AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type {
  ApiErrorPayload,
  AuthTokens,
  DriverTracking,
  ETAExplanation,
  LoginRequest,
  LogisticsMetrics,
  OrderRecord,
  RefreshRequest,
  RouteRecord,
  SystemStatus,
} from './types';

const RAW_API_BASE =
  ((import.meta as any)?.env?.VITE_API_BASE_URL as string | undefined) ||
  ((import.meta as any)?.env?.VITE_API_URL as string | undefined) ||
  ((import.meta as any)?.env?.REACT_APP_API_URL as string | undefined) ||
  'http://localhost:8000/api/v1';

const API_BASE = RAW_API_BASE.includes('<URL>') ? 'http://localhost:8000/api/v1' : RAW_API_BASE;

const TOKEN_KEYS = ['intellilog_token', 'access_token'];
const REFRESH_TOKEN_KEYS = ['intellilog_refresh_token', 'refresh_token'];
const TENANT_KEYS = ['intellilog_tenant', 'tenant_id'];

export class ApiClient {
  private readonly httpClient: AxiosInstance;
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(baseURL = API_BASE) {
    this.httpClient = axios.create({
      baseURL,
      timeout: 20000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.httpClient.interceptors.request.use((config) => {
      const headers = AxiosHeaders.from(config.headers || {});
      const token = this.getAccessToken();
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const tenantId = this.getTenantId();
      if (tenantId) {
        headers.set('X-Tenant-ID', tenantId);
      }

      config.headers = headers;

      return config;
    });

    this.httpClient.interceptors.response.use(
      (response) => response,
      async (error: AxiosError<ApiErrorPayload>) => {
        const originalRequest = error.config as (AxiosRequestConfig & { _retry?: boolean }) | undefined;
        if (!originalRequest) {
          return Promise.reject(error);
        }

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;
          const refreshed = await this.refreshAccessTokenSafe();
          if (refreshed) {
            const headers = AxiosHeaders.from(originalRequest.headers || {});
            headers.set('Authorization', `Bearer ${refreshed}`);
            originalRequest.headers = headers;
            return this.httpClient(originalRequest);
          }
          this.clearAuth();
        }

        const requestId = error.response?.headers?.['x-request-id'];
        if (requestId) {
          console.error(`[${requestId}] API error:`, error);
        } else {
          console.error('[no-request-id] API error:', error);
        }

        return Promise.reject(error);
      }
    );
  }

  get http(): AxiosInstance {
    return this.httpClient;
  }

  get baseURL(): string {
    return this.httpClient.defaults.baseURL || API_BASE;
  }

  async login(payload: LoginRequest): Promise<AuthTokens> {
    const tokenResponse = await this.httpClient.post<AuthTokens>('/auth/token', payload);
    this.setTokens(tokenResponse.data.access_token, tokenResponse.data.refresh_token);
    return tokenResponse.data;
  }

  async refresh(payload: RefreshRequest): Promise<{ access_token: string }> {
    const res = await this.httpClient.post<{ access_token: string }>('/auth/refresh', payload);
    this.setAccessToken(res.data.access_token);
    return res.data;
  }

  async getDriversNearby(lat: number, lon: number, radiusKm = 50): Promise<DriverTracking[]> {
    const params = { lat, lon, radius_km: radiusKm };
    const candidates = ['/nearby', '/driver/nearby', '/api/v1/driver/nearby'];

    for (const path of candidates) {
      try {
        const res = await this.httpClient.get<DriverTracking[] | { drivers?: DriverTracking[]; items?: DriverTracking[] }>(path, { params });
        const payload = res.data;
        if (Array.isArray(payload)) return payload;
        return payload.drivers || payload.items || [];
      } catch (error) {
        if (!this.isNotFound(error)) throw error;
      }
    }

    return [];
  }

  async getOrders(params?: { status?: string; skip?: number; limit?: number }): Promise<OrderRecord[]> {
    const tenantId = this.getTenantId();
    const mergedParams = {
      ...params,
      ...(tenantId ? { tenant_id: tenantId } : {}),
    };
    const res = await this.httpClient.get<OrderRecord[]>('/orders', { params: mergedParams });
    return Array.isArray(res.data) ? res.data : [];
  }

  async getRoutes(params?: { status?: string; skip?: number; limit?: number }): Promise<RouteRecord[]> {
    const res = await this.httpClient.get<RouteRecord[]>('/routes/', { params });
    return Array.isArray(res.data) ? res.data : [];
  }

  async optimizeRoutes(options?: {
    warehouse_id?: string;
    method?: 'greedy' | 'ortools';
    use_ml?: boolean;
    avg_speed_kmph?: number;
    ortools_time_limit?: number;
    use_osrm?: boolean;
  }): Promise<RouteRecord[]> {
    const res = await this.httpClient.post<RouteRecord[]>('/routes/optimize', null, { params: options });
    return Array.isArray(res.data) ? res.data : [];
  }

  async rerouteNow(): Promise<Record<string, unknown>> {
    const res = await this.httpClient.post<Record<string, unknown>>('/reroute/now');
    return res.data;
  }

  async getSystemStatus(): Promise<SystemStatus> {
    const candidates = ['/status/status/system', '/health'];
    for (const path of candidates) {
      try {
        const res = await this.httpClient.get<SystemStatus>(path);
        return res.data;
      } catch (error) {
        if (!this.isNotFound(error)) throw error;
      }
    }
    return { status: 'degraded' };
  }

  async getLogisticsMetrics(): Promise<LogisticsMetrics> {
    const res = await this.httpClient.get<LogisticsMetrics>('/status/metrics');
    return res.data;
  }

  async getExplanation(orderId: string, driverId?: string): Promise<ETAExplanation> {
    const res = await this.httpClient.post<ETAExplanation>('/predictions/explain', {
      order_id: orderId,
      driver_id: driverId,
    });
    return res.data;
  }

  async getWithRetry<T>(
    path: string,
    config?: AxiosRequestConfig,
    options?: { retries?: number; delayMs?: number; backoffFactor?: number }
  ): Promise<T> {
    const retries = options?.retries ?? 2;
    const delayMs = options?.delayMs ?? 300;
    const backoffFactor = options?.backoffFactor ?? 2;

    let attempt = 0;
    let wait = delayMs;
    while (attempt <= retries) {
      try {
        const response = await this.httpClient.get<T>(path, config);
        return response.data;
      } catch (error) {
        if (attempt === retries) throw error;
        await this.sleep(wait);
        wait *= backoffFactor;
        attempt += 1;
      }
    }

    throw new Error('Unreachable retry state');
  }

  setTenantId(tenantId: string): void {
    TENANT_KEYS.forEach((key) => localStorage.setItem(key, tenantId));
  }

  getTenantId(): string | null {
    for (const key of TENANT_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  }

  setTokens(accessToken: string, refreshToken?: string): void {
    this.setAccessToken(accessToken);
    if (refreshToken) {
      REFRESH_TOKEN_KEYS.forEach((key) => localStorage.setItem(key, refreshToken));
    }
  }

  private setAccessToken(accessToken: string): void {
    TOKEN_KEYS.forEach((key) => localStorage.setItem(key, accessToken));
  }

  getAccessToken(): string | null {
    for (const key of TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  }

  getRefreshToken(): string | null {
    for (const key of REFRESH_TOKEN_KEYS) {
      const value = localStorage.getItem(key);
      if (value) return value;
    }
    return null;
  }

  clearAuth(): void {
    [...TOKEN_KEYS, ...REFRESH_TOKEN_KEYS, 'user'].forEach((key) => localStorage.removeItem(key));
  }

  private async refreshAccessTokenSafe(): Promise<string | null> {
    if (this.refreshInFlight) {
      return this.refreshInFlight;
    }

    this.refreshInFlight = (async () => {
      try {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) return null;
        const refreshed = await this.refresh({ refresh_token: refreshToken });
        return refreshed.access_token;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }

  private isNotFound(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 404;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}

export const apiClient = new ApiClient();
