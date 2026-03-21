import React from 'react';
import { COLORS } from '../../design-system';

type ProgressBarProps = {
  value: number;
  color?: string;
  animated?: boolean;
  label?: string;
};

export default function ProgressBar({ value, color = COLORS.teal, animated = false, label }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div>
      {label ? <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 4 }}>{label}</div> : null}
      <div style={{ height: 8, borderRadius: 999, background: '#0B1220', overflow: 'hidden' }}>
        <div
          style={{
            width: `${clamped}%`,
            height: '100%',
            borderRadius: 999,
            transition: 'width 0.8s ease',
            background: animated
              ? `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 70%, white 30%), ${color})`
              : color,
            backgroundSize: animated ? '200% 100%' : undefined,
            animation: animated ? 'ds-shimmer 2s linear infinite' : 'none',
          }}
        />
      </div>
      <style>{`@keyframes ds-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
