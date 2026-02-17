import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';
import { HeroSection, FeaturesSection, ArchitectureFlow, CTASection } from '../components/landing';

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('access_token');
    if (token) {
      setIsLoggedIn(true);
      navigate('/dashboard');
    }
  }, [navigate]);

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span>IntelliLog AI</span>
          </div>
          <div className="nav-links">
            {!isLoggedIn && (
              <>
                <button 
                  className="nav-btn login-btn"
                  onClick={() => navigate('/login')}
                >
                  Sign In
                </button>
                <button 
                  className="nav-btn signup-btn"
                  onClick={() => navigate('/signup')}
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <HeroSection />
      <FeaturesSection />
      <ArchitectureFlow />
      <CTASection />

      <footer className="landing-footer">
        <p>&copy; 2026 IntelliLog AI. Next-generation logistics intelligence.</p>
      </footer>
    </div>
  );
};
