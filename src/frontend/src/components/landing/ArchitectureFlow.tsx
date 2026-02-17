import React from 'react';

export const ArchitectureFlow: React.FC = () => {
  return (
    <section className="architecture-section">
      <div className="section-container">
        <div className="section-header">
          <h2>How IntelliLog AI Works</h2>
          <p>End-to-end logistics optimization pipeline</p>
        </div>

        <div className="flow-diagram">
          {/* Warehouse */}
          <div className="flow-step warehouse-step">
            <div className="step-icon">🏭</div>
            <h3>Warehouses</h3>
            <p>Track inventory, manage orders, optimize capacity</p>
            <div className="step-detail">
              <div className="detail-item">✓ Real-time inventory</div>
              <div className="detail-item">✓ Order clustering</div>
              <div className="detail-item">✓ Capacity planning</div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flow-arrow">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <defs>
                <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                  <polygon points="0 0, 10 3, 0 6" fill="#6366f1" />
                </marker>
              </defs>
              <path d="M 10 30 Q 30 10, 50 30" stroke="#6366f1" strokeWidth="2" fill="none" markerEnd="url(#arrowhead)" />
            </svg>
          </div>

          {/* Drivers */}
          <div className="flow-step driver-step">
            <div className="step-icon">🚗</div>
            <h3>Drivers & Fleet</h3>
            <p>Assign deliveries, track vehicles, optimize routes</p>
            <div className="step-detail">
              <div className="detail-item">✓ Smart assignment</div>
              <div className="detail-item">✓ Live tracking</div>
              <div className="detail-item">✓ Performance metrics</div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flow-arrow">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <defs>
                <marker id="arrowhead2" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
                  <polygon points="0 0, 10 3, 0 6" fill="#0ea5e9" />
                </marker>
              </defs>
              <path d="M 10 30 Q 30 50, 50 30" stroke="#0ea5e9" strokeWidth="2" fill="none" markerEnd="url(#arrowhead2)" />
            </svg>
          </div>

          {/* Customers */}
          <div className="flow-step customer-step">
            <div className="step-icon">📦</div>
            <h3>Customers</h3>
            <p>Deliver on time, update in real-time, gather feedback</p>
            <div className="step-detail">
              <div className="detail-item">✓ On-time delivery</div>
              <div className="detail-item">✓ Real-time updates</div>
              <div className="detail-item">✓ Satisfaction tracking</div>
            </div>
          </div>
        </div>

        {/* Horizontal Flow for Mobile */}
        <div className="flow-horizontal">
          <div className="horizontal-step">
            <div className="h-icon">🏭</div>
            <p>Warehouses</p>
          </div>
          <div className="h-arrow">→</div>
          <div className="horizontal-step">
            <div className="h-icon">🚗</div>
            <p>Drivers</p>
          </div>
          <div className="h-arrow">→</div>
          <div className="horizontal-step">
            <div className="h-icon">📦</div>
            <p>Customers</p>
          </div>
        </div>

        {/* AI Processing */}
        <div className="ai-processor">
          <div className="processor-icon">⚡</div>
          <div className="processor-text">
            <h4>AI Route Engine</h4>
            <p>Continuously optimizes all delivery routes using machine learning and real-time traffic data</p>
          </div>
        </div>
      </div>
    </section>
  );
};
