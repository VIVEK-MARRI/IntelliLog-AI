export const COLORS = {
  bg: '#0A0A0F',
  surface: '#0F1420',
  card: '#141B2D',
  border: 'rgba(255,255,255,0.08)',
  borderHover: 'rgba(0,212,170,0.3)',
  teal: '#00D4AA',
  tealDim: 'rgba(0,212,170,0.15)',
  amber: '#F59E0B',
  red: '#EF4444',
  textPrimary: '#F1F5F9',
  textMuted: '#64748B',
  textDim: '#334155',
} as const;

export const TRANSITIONS = {
  fast: 'all 0.15s ease',
  normal: 'all 0.25s ease',
  slow: 'all 0.4s ease',
  spring: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
} as const;

export const SHADOWS = {
  tealGlow: '0 0 20px rgba(0,212,170,0.15)',
  tealGlowStrong: '0 0 40px rgba(0,212,170,0.3)',
  cardHover: '0 8px 32px rgba(0,0,0,0.4)',
} as const;
