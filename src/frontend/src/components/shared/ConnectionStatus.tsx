import React from 'react';
import StatusDot from './StatusDot';
import { COLORS } from '../../design-system';

type Props = {
  wsStatus: 'connecting' | 'connected' | 'disconnected' | 'error';
  retryCount?: number;
};

export default function ConnectionStatus({ wsStatus, retryCount = 0 }: Props) {
  const isConnecting = wsStatus === 'connecting';
  const statusText =
    wsStatus === 'connected'
      ? 'Live'
      : wsStatus === 'connecting'
        ? 'Connecting...'
        : wsStatus === 'disconnected'
          ? `Reconnecting... (${retryCount})`
          : 'Connection failed';

  return (
    <span
      data-testid="ws-status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.card,
        color: COLORS.textPrimary,
        borderRadius: 999,
        padding: '3px 8px',
        fontSize: 11,
      }}
    >
      {isConnecting ? (
        <span
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            border: `2px solid ${COLORS.amber}66`,
            borderTopColor: COLORS.amber,
            display: 'inline-block',
            animation: 'spin-conn 1s linear infinite',
          }}
        />
      ) : (
        <StatusDot status={wsStatus === 'connected' ? 'online' : wsStatus === 'error' ? 'critical' : 'offline'} size={8} />
      )}
      {statusText}
      <style>{`@keyframes spin-conn { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
