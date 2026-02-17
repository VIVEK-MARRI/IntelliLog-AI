import React from 'react';
import { useNavigate } from 'react-router-dom';

export const CTASection: React.FC = () => {
  const navigate = useNavigate();

  return (
    <section className="cta-section">
      <div className="cta-container">
        <div className="cta-content">
          <h2>Ready to Transform Your Logistics?</h2>
          <p>Join thousands of enterprises using IntelliLog AI to optimize deliveries and reduce costs.</p>
          
          <div className="cta-buttons">
            <button 
              className="btn btn-primary btn-large"
              onClick={() => navigate('/signup')}
            >
              Start Free Trial Today
            </button>
            <button 
              className="btn btn-secondary btn-outline"
              onClick={() => navigate('/login')}
            >
              Already Have Account?
            </button>
          </div>

          <div className="cta-stats">
            <div className="stat">
              <div className="stat-value">98%</div>
              <div className="stat-label">On-Time Delivery</div>
            </div>
            <div className="stat">
              <div className="stat-value">45%</div>
              <div className="stat-label">Cost Reduction</div>
            </div>
            <div className="stat">
              <div className="stat-value">24/7</div>
              <div className="stat-label">Support</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
