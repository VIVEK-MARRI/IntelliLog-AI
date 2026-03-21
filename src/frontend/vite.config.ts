import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
  },
  define: {
    'process.env': {},
  },
  optimizeDeps: {
    include: ['react', 'react-dom', '@react-three/fiber', '@react-three/drei', 'three', 'maplibre-gl'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          'three-extras': ['three/examples/jsm/controls/OrbitControls.js'],
          leaflet: ['leaflet'],
          framer: ['framer-motion'],
          lottie: ['lottie-react', 'lottie-web'],
          gsap: ['gsap'],
          simplex: ['simplex-noise'],
        },
      },
    },
    target: 'ES2020',
  },
})
