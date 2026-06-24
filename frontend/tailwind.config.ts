import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'monospace'],
        display: ['Geist', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Premium shell colors
        bgCharcoal: '#111315', // deep charcoal background
        bgGraphite: '#1A1D21', // graphite content surfaces
        bgSlate: '#2A3038', // secondary surfaces
        bgSilver: '#D9DDE3', // typography / light accents
        bgSilverMuted: '#A8B0BB', // muted silver
        'silver-muted': '#A8B0BB', // alias for UI class usage
        amberBright: '#F4C542', // bright amber for highlights
        success: '#27C281',
        warning: '#F59E0B',
        danger: '#EF4444',
        // Backwards compatible keys (map to new ones via CSS variables)
        background: '#111315',
        'background-secondary': '#1A1D21',
        'background-tertiary': '#2A3038',
        surface: '#1A1D21',
        elevated: '#2A3038',
        'surface-hover': '#2A3038',
        'surface-active': '#2A3038',

        // Borders
        border: '#E2E6ED',
        'border-hover': '#CDD2DA',

        // Text
        'text-primary': '#111827',
        'text-secondary': '#6B7280',
        'text-muted': '#9CA3AF',
        'text-inverse': '#FFFFFF',

        // Sidebar (dark #0F172A)
        sidebar: {
          bg: '#0F172A',
          surface: '#1A2332',
          hover: '#1E293B',
          active: '#2563EB',
          'active-bg': 'rgba(37, 99, 235, 0.12)',
          border: '#1E293B',
          text: '#94A3B8',
          'text-hover': '#F1F5F9',
          'text-active': '#FFFFFF',
        },

        // Premium palette
        amber: {
          DEFAULT: '#F4C542',
          dark: '#E9B900',
          light: '#FFD54A',
        },
        charcoal: '#101214',
        graphite: '#2A2F36',
        slate: '#3A4048',
        silver: {
          light: '#C9CDD3',
          DEFAULT: '#E5E7EB',
          dark: '#F3F4F6',
        },

        // Accent (amber-aligned for backward compat with CSS utilities)
        accent: {
          DEFAULT: '#E6B325',
          hover: '#D4A01E',
          light: '#F4C542',
          glow: 'rgba(230,179,37,0.08)',
        },
        'accent-bg': 'rgba(230,179,37,0.1)',
        'accent-hover-bg': 'rgba(230,179,37,0.06)',

        purple: {
          DEFAULT: '#8B5CF6',
          bg: 'rgba(139,92,246,0.1)',
          border: 'rgba(139,92,246,0.2)',
        },

        teal: {
          DEFAULT: '#14B8A6',
          bg: 'rgba(20,184,166,0.1)',
          border: 'rgba(20,184,166,0.2)',
        },

        success: {
          DEFAULT: '#10B981',
          bg: 'rgba(16,185,129,0.1)',
          border: 'rgba(16,185,129,0.2)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: 'rgba(245,158,11,0.1)',
          border: 'rgba(245,158,11,0.2)',
        },
        critical: {
          DEFAULT: '#EF4444',
          bg: 'rgba(239,68,68,0.08)',
          border: 'rgba(239,68,68,0.2)',
        },
        info: {
          DEFAULT: '#0EA5E9',
          bg: 'rgba(14,165,233,0.1)',
          border: 'rgba(14,165,233,0.2)',
        },

        // Legacy mapping for backward compat
        abyss: '#0F172A',
        obsidian: '#1A2332',
        pearl: '#F1F5F9',
        mist: '#94A3B8',
        cloud: '#64748B',
        'steel-grey': '#E2E6ED',
        'slate-blue': '#2563EB',
        navy: '#1E293B',

        route: {
          DEFAULT: '#2563EB',
          optimized: '#10B981',
        },
      },
      spacing: {
        page: '32px',
        13: '3.25rem',
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
      },
      borderRadius: {
        card: '16px',
        panel: '10px',
        pill: '9999px',
      },
      boxShadow: {
        panel: '0 4px 16px rgba(0,0,0,0.15), 0 0 0 1px rgba(255,255,255,0.05)',
        card: '0 2px 8px rgba(15,23,42,0.05)',
        elevated: '0 8px 24px rgba(15,23,42,0.08)',
        modal: '0 16px 40px rgba(15,23,42,0.10)',
        'floating': '0 4px 16px rgba(15,23,42,0.10), 0 0 0 1px rgba(255,255,255,0.5)',
        'floating-lg': '0 8px 32px rgba(15,23,42,0.12), 0 0 0 1px rgba(255,255,255,0.5)',
        'sidebar': '2px 0 16px rgba(15,23,42,0.08)',
        glow: '0 0 20px rgba(37,99,235,0.1)',
        'glow-purple': '0 0 20px rgba(139,92,246,0.1)',
        'glow-teal': '0 0 20px rgba(20,184,166,0.1)',
      },
      keyframes: {
        'marker-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        'status-pulse': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239,68,68,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(239,68,68,0)' },
        },
        'glow-pulse': {
          '0%, 100%': { opacity: '0.6' },
          '50%': { opacity: '1' },
        },
        'route-draw': {
          '0%': { strokeDashoffset: '1000' },
          '100%': { strokeDashoffset: '0' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-in-right': {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'kpi-enter': {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'ticker': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      animation: {
        'marker-pulse': 'marker-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'status-pulse': 'status-pulse 2s infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'route-draw': 'route-draw 2s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'slide-up': 'slide-up 0.4s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'kpi-enter': 'kpi-enter 0.5s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'shimmer': 'shimmer 1.5s infinite linear',
        'ticker': 'ticker 30s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config
