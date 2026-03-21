import { useEffect, useRef } from 'react';
import { DispatchWebSocketManager, type DispatchSocketMessage } from '../api';

interface DispatchWebSocketOptions {
  tenantId: string;
  onMessage: (message: DispatchSocketMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: () => void;
}

export function useDispatchWebSocket(options: DispatchWebSocketOptions) {
  const managerRef = useRef<DispatchWebSocketManager | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    managerRef.current = new DispatchWebSocketManager();
    managerRef.current.connect({
      tenantId: options.tenantId,
      onMessage: (message) => optionsRef.current.onMessage(message),
      onOpen: () => optionsRef.current.onOpen?.(),
      onClose: () => optionsRef.current.onClose?.(),
      onError: () => optionsRef.current.onError?.(),
    });

    return () => {
      managerRef.current?.disconnect();
      managerRef.current = null;
    };
  }, [options.tenantId]);

  return managerRef;
}
