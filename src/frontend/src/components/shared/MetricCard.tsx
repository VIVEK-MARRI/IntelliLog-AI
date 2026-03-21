import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS } from '../../design-system';

type MetricCardProps = {
  label: string;
  value: number;
  change?: number;
  changeDirection?: 'up' | 'down';
  unit?: string;
};

function useCountUp(value: number, duration = 300) {
  const [animated, setAnimated] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const start = prevRef.current;
    const end = value;
    if (start === end) return;

    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setAnimated(start + (end - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, value]);

  return animated;
}

export default function MetricCard({ label, value, change, changeDirection = 'up', unit = '' }: MetricCardProps) {
  const animated = useCountUp(value, 300);
  const display = Number.isInteger(value) ? Math.round(animated).toString() : animated.toFixed(1);
  const changeColor = changeDirection === 'up' ? COLORS.teal : COLORS.red;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderLeft: `3px solid ${COLORS.teal}`,
        borderRadius: 12,
        padding: '10px 12px',
      }}
    >
      <div style={{ fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={`${value}`}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          style={{ fontSize: 24, fontWeight: 800, color: COLORS.textPrimary, lineHeight: 1.1 }}
        >
          {display}
          {unit}
        </motion.div>
      </AnimatePresence>
      {typeof change === 'number' && (
        <div style={{ marginTop: 4, fontSize: 12, color: changeColor }}>
          {changeDirection === 'up' ? '↑' : '↓'} {Math.abs(change)}
          {unit}
        </div>
      )}
    </motion.div>
  );
}
