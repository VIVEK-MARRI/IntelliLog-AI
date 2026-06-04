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
        obsidian: '#0A0F1A',
        abyss: '#0F1729',
        navy: '#151E2F',
        'slate-blue': '#1E2A45',
        'steel-grey': '#2A3A5C',
        mist: '#5A6B8A',
        cloud: '#94A3B8',
        pearl: '#CBD5E1',
        white: '#F1F5F9',
        accent: {
          DEFAULT: '#3B82F6',
          hover: '#2563EB',
          light: '#60A5FA',
          glow: 'rgba(59,130,246,0.15)',
        },
        teal: {
          DEFAULT: '#0EA5E9',
          hover: '#0284C7',
        },
        success: {
          DEFAULT: '#0EA5E9',
          bg: 'rgba(14,165,233,0.12)',
          border: 'rgba(14,165,233,0.25)',
        },
        warning: {
          DEFAULT: '#F59E0B',
          bg: 'rgba(245,158,11,0.12)',
          border: 'rgba(245,158,11,0.25)',
        },
        critical: {
          DEFAULT: '#EF4444',
          bg: 'rgba(239,68,68,0.12)',
          border: 'rgba(239,68,68,0.25)',
        },
        info: {
          DEFAULT: '#06B6D4',
          bg: 'rgba(6,182,212,0.12)',
          border: 'rgba(6,182,212,0.25)',
        },
        'route': {
          DEFAULT: '#3B82F6',
          optimized: '#14B8A6',
        },
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-right': 'env(safe-area-inset-right)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
      },
      borderRadius: {
        card: '12px',
        panel: '8px',
        pill: '9999px',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
        elevated: '0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2)',
        modal: '0 10px 25px rgba(0,0,0,0.4), 0 4px 10px rgba(0,0,0,0.3)',
        glow: '0 0 20px rgba(59,130,246,0.15)',
        'glow-teal': '0 0 20px rgba(14,165,233,0.15)',
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
        'kpi-enter': {
          '0%': { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'marker-pulse': 'marker-pulse 2s cubic-bezier(0.4,0,0.6,1) infinite',
        'status-pulse': 'status-pulse 2s infinite',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'route-draw': 'route-draw 2s ease-out forwards',
        'fade-in': 'fade-in 0.4s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'slide-in-right': 'slide-in-right 0.3s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'kpi-enter': 'kpi-enter 0.5s ease-[cubic-bezier(0.16,1,0.3,1)] forwards',
        'shimmer': 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [],
} satisfies Config
