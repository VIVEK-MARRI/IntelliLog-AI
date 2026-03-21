import React, { type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { COLORS, SHADOWS, TRANSITIONS } from '../../design-system';

type Props = {
  children: ReactNode;
  glow?: boolean;
  interactive?: boolean;
  className?: string;
};

export default function GlassCard({ children, glow = false, interactive = false, className }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileHover={interactive ? { y: -2 } : undefined}
      style={{
        background: 'rgba(20, 27, 45, 0.8)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${interactive ? COLORS.borderHover : COLORS.border}`,
        borderRadius: 12,
        boxShadow: glow ? SHADOWS.tealGlow : 'none',
        transition: TRANSITIONS.spring,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
