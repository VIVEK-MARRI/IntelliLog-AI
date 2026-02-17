import React from 'react';

export const FeaturesSection: React.FC = () => {
  const features = [
    {
      icon: '📍',
      title: 'Smart Warehouse Management',
      description: 'Monitor inventory levels, track orders, and manage warehouse operations in real-time across multiple locations.',
    },
    {
      icon: '🛣️',
      title: 'Dynamic Route Optimization',
      description: 'AI-powered algorithms that optimize delivery routes based on traffic, weather, and real-time demand.',
    },
    {
      icon: '📈',
      title: 'Delivery Prediction',
      description: 'Predict delivery times with machine learning models trained on historical logistics data.',
    },
    {
      icon: '👥',
      title: 'Fleet & Driver Management',
      description: 'Track drivers in real-time, assign deliveries intelligently, and monitor fleet performance.',
    },
    {
      icon: '📊',
      title: 'Live Analytics Dashboard',
      description: 'Comprehensive metrics on delivery performance, costs, and customer satisfaction.',
    },
    {
      icon: '🔔',
      title: 'Real-Time Alerts',
      description: 'Get notified instantly about delays, delivery completions, and optimization opportunities.',
    },
  ];

  return (
    <section className="features-section">
      <div className="section-container">
        <div className="section-header">
          <h2>Why IntelliLog AI?</h2>
          <p>Enterprise-grade logistics optimization for modern supply chains</p>
        </div>

        <div className="features-grid">
          {features.map((feature, idx) => (
            <div key={idx} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3>{feature.title}</h3>
              <p>{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
