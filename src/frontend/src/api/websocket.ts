import { apiClient } from './client';
import type { DispatchSocketMessage } from './types';

type DispatchWebSocketOptions = {
  tenantId: string;
  onMessage: (message: DispatchSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
};

export class DispatchWebSocketManager {
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private reconnectAttempts = 0;
  private closedByClient = false;

  connect(options: DispatchWebSocketOptions): void {
    this.closedByClient = false;
    this.openSocket(options);
  }

  disconnect(): void {
    this.closedByClient = true;
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.socket?.close();
    this.socket = null;
  }

  private openSocket(options: DispatchWebSocketOptions): void {
    const configuredWsBase = (import.meta.env.VITE_WS_URL || '').replace(/\/$/, '');
    const baseUrl = configuredWsBase || apiClient.baseURL.replace(/\/api\/v1\/?$/, '').replace(/^http/i, 'ws');
    const token = apiClient.getAccessToken();
    const wsUrl = token
      ? `${baseUrl}/ws/dispatch/${options.tenantId}?token=${encodeURIComponent(token)}`
      : `${baseUrl}/ws/dispatch/${options.tenantId}`;
    const socket = new WebSocket(wsUrl);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempts = 0;
      options.onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as DispatchSocketMessage;
        options.onMessage(payload);
      } catch {
        // Ignore malformed websocket payloads.
      }
    };

    socket.onerror = () => {
      options.onError?.();
    };

    socket.onclose = () => {
      options.onClose?.();
      if (this.closedByClient) return;
      this.reconnectAttempts += 1;
      const delay = Math.min(10000, 1200 * this.reconnectAttempts);
      this.reconnectTimer = window.setTimeout(() => this.openSocket(options), delay);
    };
  }
}
