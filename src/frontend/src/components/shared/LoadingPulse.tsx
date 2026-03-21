import React from 'react';

type Props = {
  rows?: number;
  width?: string;
};

export default function LoadingPulse({ rows = 3, width = '100%' }: Props) {
  return (
    <div data-testid="loading-pulse" style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 14,
            width,
            borderRadius: 8,
            background: '#141B2D',
            animation: 'loading-pulse 1.1s ease-in-out infinite',
            animationDelay: `${i * 0.08}s`,
          }}
        />
      ))}
      <style>{`@keyframes loading-pulse { 0%, 100% { background: #141B2D; } 50% { background: #1E2A42; } }`}</style>
    </div>
  );
}
