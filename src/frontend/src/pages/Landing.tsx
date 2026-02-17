import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, TrendingUp, Users, BarChart3, ChevronRight, Lock } from 'lucide-react';
import '../styles/landing.css';

/**
 * Landing page for IntelliLog-AI SaaS platform.
 * Features professional design with animated background,
 * feature highlights, and clear CTAs for login/signup.
 */
export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isDark, setIsDark] = useState(true);

  const features = [
    {
      icon: Zap,
      title: 'Route Optimization',
      description: 'AI-powered route planning that reduces delivery time by up to 40%',
    },
    {
      icon: Users,
      title: 'Warehouse Intelligence',
      description: 'Real-time warehouse management with intelligent order distribution',
    },
    {
      icon: TrendingUp,
      title: 'Driver Efficiency',
      description: 'Monitor driver performance and optimize fleet utilization',
    },
    {
      icon: BarChart3,
      title: 'Real-time Analytics',
      description: 'Comprehensive dashboards with actionable logistics insights',
    },
  ];

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
      {/* Animated gradient background */}
      <div className="animated-bg" />
      <div className="orb-1" />
      <div className="orb-2" />
      <div className="orb-3" />
      <div className="bg-overlay" />

      {/* Content Container */}
      <div className="relative z-10">
        {/* Navigation */}
        <nav className="flex justify-between items-center px-8 py-6 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
              IntelliLog-AI
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsDark(!isDark)}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isDark
                  ? 'bg-slate-800/50 text-white hover:bg-slate-700/50'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              }`}
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <button
              onClick={() => navigate('/auth/login')}
              className={`px-6 py-2 rounded-lg transition-colors ${
                isDark
                  ? 'bg-slate-800/50 text-white hover:bg-slate-700/50'
                  : 'bg-slate-100 text-slate-900 hover:bg-slate-200'
              }`}
            >
              Login
            </button>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="px-8 py-24 text-center">
          <h1 className={`text-6xl font-bold mb-6 leading-tight animate-fade-in-up ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            Optimize Your <span className="text-blue-500">Logistics Network</span>
          </h1>
          
          <p className={`text-xl mb-12 max-w-2xl mx-auto animate-fade-in-up [animation-delay:200ms] ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            IntelliLog-AI leverages advanced machine learning and optimization algorithms
            to transform your delivery operations, reduce costs, and delight customers.
          </p>

          <div className="flex gap-4 justify-center mb-12 animate-fade-in-up [animation-delay:400ms]">
            <button
              onClick={() => navigate('/auth/signup')}
              className="px-8 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors flex items-center gap-2 hover:scale-105 transform"
            >
              Get Started <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={() => navigate('/auth/login')}
              className={`px-8 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2 hover:scale-105 transform ${
                isDark
                  ? 'border border-blue-500 text-blue-400 hover:bg-blue-500/10'
                  : 'border border-blue-400 text-blue-600 hover:bg-blue-100'
              }`}
            >
              <Lock className="w-5 h-5" />
              Sign In
            </button>
          </div>

          {/* Trust badges */}
          <div className={`flex justify-center gap-8 text-sm animate-fade-in-up [animation-delay:600ms] ${
            isDark ? 'text-slate-400' : 'text-slate-600'
          }`}>
            <div>✓ Enterprise Grade Security</div>
            <div>✓ 99.9% Uptime SLA</div>
            <div>✓ 24/7 Support</div>
          </div>
        </section>

        {/* Features Section */}
        <section className="px-8 py-24">
          <h2 className={`text-4xl font-bold text-center mb-16 animate-fade-in-up ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            Powerful Features
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className={`p-8 rounded-lg backdrop-blur-sm transition-all hover:scale-105 animate-fade-in-up ${
                    isDark
                      ? 'bg-slate-800/30 border border-slate-700/50'
                      : 'bg-white/30 border border-slate-200/50'
                  }`}
                  style={{ animationDelay: `${idx * 100}ms` }}
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Icon className="w-6 h-6 text-blue-500" />
                    </div>
                    <div className="text-left">
                      <h3 className={`font-semibold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {feature.title}
                      </h3>
                      <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                        {feature.description}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Architecture Section */}
        <section className="px-8 py-24">
          <h2 className={`text-4xl font-bold text-center mb-16 animate-fade-in-up ${
            isDark ? 'text-white' : 'text-slate-900'
          }`}>
            How It Works
          </h2>

          <div className={`max-w-4xl mx-auto rounded-lg backdrop-blur-sm p-8 animate-fade-in-up [animation-delay:200ms] ${
            isDark
              ? 'bg-slate-800/30 border border-slate-700/50'
              : 'bg-white/30 border border-slate-200/50'
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                { step: '1', title: 'Orders Received', desc: 'Incoming delivery requests from your customers' },
                { step: '2', title: 'Smart Assignment', desc: 'AI-powered system assigns to optimal warehouse' },
                { step: '3', title: 'Route Optimization', desc: 'ML models generate most efficient delivery routes' },
              ].map((item, idx) => (
                <div key={idx} className="text-center animate-fade-in-up" style={{ animationDelay: `${300 + idx * 100}ms` }}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-lg transform hover:scale-110 transition-transform ${
                    isDark
                      ? 'bg-blue-500 text-white'
                      : 'bg-blue-400 text-white'
                  }`}>
                    {item.step}
                  </div>
                  <h4 className={`font-semibold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                    {item.title}
                  </h4>
                  <p className={isDark ? 'text-slate-400' : 'text-slate-600'}>
                    {item.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-8 py-24 text-center">
          <h2 className={`text-4xl font-bold mb-8 animate-fade-in-up ${isDark ? 'text-white' : 'text-slate-900'}`}>
            Ready to Transform Your Logistics?
          </h2>
          
          <p className={`text-lg mb-8 max-w-2xl mx-auto animate-fade-in-up [animation-delay:200ms] ${
            isDark ? 'text-slate-300' : 'text-slate-600'
          }`}>
            Join hundreds of logistics companies already using IntelliLog-AI
            to optimize routes and improve delivery efficiency.
          </p>

          <button
            onClick={() => navigate('/auth/signup')}
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-semibold hover:from-blue-600 hover:to-blue-700 transition-all transform hover:scale-105 animate-fade-in-up [animation-delay:400ms]"
          >
            Start Your Free Trial
          </button>
        </section>

        {/* Footer */}
        <footer className={`border-t ${isDark ? 'border-slate-700/50' : 'border-slate-200/50'} py-8 px-8 mt-16`}>
          <div className={`max-w-6xl mx-auto text-center ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            <p>&copy; 2026 IntelliLog-AI. All rights reserved. | Enterprise Logistics Optimization Platform</p>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default LandingPage;
