import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { COLORS } from '../../design-system';

type Props = {
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
  duration?: number;
  onDismiss: () => void;
};

const colorByType: Record<Props['type'], string> = {
  info: COLORS.teal,
  warning: COLORS.amber,
  error: COLORS.red,
  success: '#22C55E',
};

export default function ToastNotification({ type, message, duration = 5000, onDismiss }: Props) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(id);
  }, [duration, onDismiss]);

  const color = colorByType[type];

  return (
    <motion.div
      data-testid="toast"
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      style={{ background: COLORS.card, border: `1px solid ${color}66`, borderRadius: 10, overflow: 'hidden' }}
    >
      <div style={{ padding: '10px 12px', color: COLORS.textPrimary, fontSize: 12 }}>{message}</div>
      <motion.div
        initial={{ width: '100%' }}
        animate={{ width: '0%' }}
        transition={{ duration: duration / 1000, ease: 'linear' }}
        style={{ height: 2, background: color }}
      />
    </motion.div>
  );
}
