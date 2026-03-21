import React from 'react';
import { COLORS } from '../../design-system';

type Props = {
  p10: number;
  p50: number;
  p90: number;
  unit?: string;
};

export default function ETAConfidenceBar({ p10, p50, p90, unit = 'min' }: Props) {
  const min = Math.min(p10, p50, p90);
  const max = Math.max(p10, p50, p90);
  const span = Math.max(1, max - min);
  const left = ((p10 - min) / span) * 100;
  const mid = ((p50 - min) / span) * 100;
  const right = ((p90 - min) / span) * 100;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ position: 'relative', height: 26 }}>
        <div style={{ position: 'absolute', top: 12, left: `${left}%`, width: `${Math.max(3, right - left)}%`, height: 6, borderRadius: 999, background: 'rgba(0,212,170,0.25)' }} />
        <div style={{ position: 'absolute', left: `${left}%`, top: 7, width: 2, height: 14, background: COLORS.textMuted }} />
        <div style={{ position: 'absolute', left: `${mid}%`, top: 4, width: 2, height: 18, background: COLORS.teal }} />
        <div style={{ position: 'absolute', left: `${right}%`, top: 7, width: 2, height: 14, background: COLORS.textMuted }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: COLORS.textMuted }}>
        <span>P10 {p10}{unit}</span>
        <span style={{ color: COLORS.teal }}>P50 {p50}{unit}</span>
        <span>P90 {p90}{unit}</span>
      </div>
    </div>
  );
}
