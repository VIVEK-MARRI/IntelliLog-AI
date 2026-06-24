import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/authStore'
import { SignIn, Eye, EyeSlash, Compass, MapPin, Lightning, ChartBar } from '@phosphor-icons/react'
import { motion } from 'framer-motion'

interface LoginProps {
  from?: string | null
}

export const Login: React.FC<LoginProps> = ({ from }) => {
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Demo credentials only in development
  const isDev = import.meta.env.DEV
  const demoEmail = isDev ? 'admin@intelliglog.com' : ''
  const demoPassword = isDev ? 'admin123' : ''

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      // Return-to redirect: use 'from' prop or default to '/'
      const redirectTo = from || '/'
      navigate(redirectTo, { replace: true })
    } catch {
      setError('Invalid credentials or server error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-obsidian flex">
      <div className="flex-1 flex items-center justify-center p-6 lg:p-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-sm"
        >
          <div className="flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Compass size={18} className="text-accent" weight="fill" />
            </div>
            <span className="text-lg font-semibold text-pearl tracking-tight">IntelliLog</span>
          </div>

          <h1 className="text-xl font-semibold text-pearl mb-1">Sign in</h1>
          <p className="text-sm text-mist mb-8">Access your logistics command center</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-[11px] font-semibold text-mist uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                autoComplete="email"
                className="w-full bg-obsidian border border-steel-grey/40 rounded-lg px-3 py-2.5 text-sm text-pearl placeholder-mist/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-[11px] font-semibold text-mist uppercase tracking-wider mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                  className="w-full bg-obsidian border border-steel-grey/40 rounded-lg px-3 py-2.5 pr-10 text-sm text-pearl placeholder-mist/50 focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-mist hover:text-pearl transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-xs text-critical flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-critical flex-shrink-0" />
                {error}
              </motion.p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent/90 disabled:bg-steel-grey disabled:cursor-not-allowed text-white rounded-lg px-4 py-2.5 text-sm font-semibold transition-all active:scale-[0.98] flex items-center justify-center"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <SignIn size={16} weight="bold" />
                  Sign in
                </span>
              )}
            </button>
          </form>

          {isDev && (
            <div className="mt-8 pt-6 border-t border-steel-grey/30">
              <p className="text-[10px] text-mist uppercase tracking-wider font-semibold mb-2">Demo credentials (dev only)</p>
              <div className="space-y-1">
                <p className="text-xs text-mist">Email: <span className="text-cloud font-mono">{demoEmail}</span></p>
                <p className="text-xs text-mist">Password: <span className="text-cloud font-mono">{demoPassword}</span></p>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <div className="hidden lg:flex flex-1 bg-abyss items-center justify-center p-8 border-l border-steel-grey/30">
        <div className="max-w-sm">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-6">
            <Compass size={24} className="text-accent" weight="fill" />
          </div>
          <h2 className="text-lg font-semibold text-pearl mb-3">
            AI-Powered Logistics Intelligence
          </h2>
          <p className="text-sm text-mist leading-relaxed">
            Real-time fleet operations, predictive routing, and autonomous decision intelligence for mission-critical logistics.
          </p>
          <div className="mt-6 space-y-4">
            {[
              { icon: MapPin, label: 'Real-time fleet tracking', desc: 'Live GPS telemetry with sub-second updates' },
              { icon: Lightning, label: 'AI route optimization', desc: 'OR-Tools powered solver for optimal routing' },
              { icon: ChartBar, label: 'Predictive analytics', desc: 'ML-based delay prediction with SHAP explanations' },
            ].map(({ icon: Icon, label, desc }, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-accent" weight="duotone" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-cloud">{label}</p>
                  <p className="text-[11px] text-mt">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
