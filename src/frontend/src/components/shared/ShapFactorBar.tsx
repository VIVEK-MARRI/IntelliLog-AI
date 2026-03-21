import React, { useMemo, useState } from 'react';
import { getFeatureLabel, getImpactDescription } from '../../utils/shapLabels';
import { COLORS } from '../../design-system';

type Props = {
  featureName: string;
  impactMinutes: number;
  featureValue?: number;
  rank: number;
};

export default function ShapFactorBar({ featureName, impactMinutes, featureValue, rank }: Props) {
  const [mounted, setMounted] = useState(false);
  const positive = impactMinutes >= 0;
  const label = useMemo(() => getFeatureLabel(featureName), [featureName]);
  const desc = useMemo(() => getImpactDescription(featureName, impactMinutes, featureValue), [featureName, impactMinutes, featureValue]);
  const pct = Math.max(8, Math.min(100, Math.abs(impactMinutes) * 10));

  React.useEffect(() => {
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, []);

  return (
    <div title={featureValue !== undefined ? `Raw value: ${featureValue}` : desc} style={{ display: 'grid', gridTemplateColumns: '1fr 120px auto', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: COLORS.textPrimary }}>{rank}. {label}</span>
      <div style={{ height: 8, borderRadius: 999, background: '#0B1220', overflow: 'hidden' }}>
        <div
          style={{
            width: mounted ? `${pct}%` : '0%',
            height: '100%',
            borderRadius: 999,
            transition: 'width 0.7s ease, filter 0.2s ease',
            background: positive ? COLORS.teal : '#22C55E',
          }}
          className="shap-bar-fill"
        />
      </div>
      <span style={{ fontSize: 12, color: positive ? COLORS.teal : '#22C55E', fontWeight: 700 }}>
        {impactMinutes > 0 ? '+' : '-'}{Math.abs(impactMinutes).toFixed(1)} min
      </span>
    </div>
  );
}
