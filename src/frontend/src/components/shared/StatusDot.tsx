import React from 'react';
import { COLORS } from '../../design-system';

type StatusDotState = 'online' | 'warning' | 'offline' | 'critical';

type StatusDotProps = {
  status: StatusDotState;
  size?: number;
};

const CONFIG: Record<StatusDotState, { color: string; duration?: string; pulse: boolean; opacity?: number }> = {
  online: { color: COLORS.teal, duration: '3s', pulse: true },
  warning: { color: COLORS.amber, duration: '1.5s', pulse: true },
  critical: { color: COLORS.red, duration: '0.5s', pulse: true },
  offline: { color: COLORS.textMuted, pulse: false, opacity: 0.4 },
};

export default function StatusDot({ status, size = 8 }: StatusDotProps) {
  const cfg = CONFIG[status];
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: cfg.color,
        display: 'inline-block',
        opacity: cfg.opacity ?? 1,
        animation: cfg.pulse ? `status-dot-pulse ${cfg.duration} ease-in-out infinite` : 'none',
        boxShadow: cfg.pulse ? `0 0 10px ${cfg.color}66` : 'none',
      }}
      aria-label={`Status ${status}`}
    >
      <style>{`@keyframes status-dot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }`}</style>
    </span>
  );
}
