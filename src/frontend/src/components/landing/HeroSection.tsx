import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

export const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const updateCanvasSize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);

    // Animation state
    let animationId: number;
    let time = 0;

    // Draw simple network nodes and connections
    const drawNetwork = () => {
      // Clear with dark background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      time += 0.005;

      // Generate dynamic nodes
      const nodeCount = 8;
      const nodes: Array<{ x: number; y: number; pulse: number }> = [];

      for (let i = 0; i < nodeCount; i++) {
        const angle = (i / nodeCount) * Math.PI * 2;
        const radius = 150 + Math.sin(time * 0.5 + i) * 50;
        const x = canvas.width / 2 + Math.cos(angle) * radius;
        const y = canvas.height / 2 + Math.sin(angle) * radius;
        const pulse = 0.5 + 0.5 * Math.sin(time * 3 + i * 0.5);
        nodes.push({ x, y, pulse });
      }

      // Draw connections
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.2)';
      ctx.lineWidth = 1;
      for (let i = 0; i < nodes.length; i++) {
        const next = nodes[(i + 1) % nodes.length];
        ctx.beginPath();
        ctx.moveTo(nodes[i].x, nodes[i].y);
        ctx.lineTo(next.x, next.y);
        ctx.stroke();
      }

      // Draw nodes
      for (const node of nodes) {
        // Glow
        const gradient = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, 20);
        gradient.addColorStop(0, `rgba(99, 102, 241, ${0.3 * node.pulse})`);
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
        ctx.fillStyle = gradient;
        ctx.fillRect(node.x - 20, node.y - 20, 40, 40);

        // Core
        ctx.fillStyle = `rgba(99, 102, 241, ${0.8 + 0.2 * node.pulse})`;
        ctx.beginPath();
        ctx.arc(node.x, node.y, 5 + 2 * node.pulse, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw center warehouse
      const centerPulse = 0.5 + 0.5 * Math.sin(time * 2);
      ctx.fillStyle = `rgba(14, 165, 233, ${centerPulse})`;
      ctx.beginPath();
      ctx.arc(canvas.width / 2, canvas.height / 2, 12, 0, Math.PI * 2);
      ctx.fill();

      animationId = requestAnimationFrame(drawNetwork);
    };

    drawNetwork();

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', updateCanvasSize);
    };
  }, []);

  return (
    <section className="hero-section">
      <canvas ref={canvasRef} className="hero-canvas"></canvas>
      
      <div className="hero-content">
        <h1 className="hero-title">
          Next-Generation<br />
          <span className="gradient-text">Logistics Intelligence</span>
        </h1>
        <p className="hero-subtitle">
          Real-time route optimization, live warehouse management, and AI-driven delivery predictions.
        </p>
        
        <div className="hero-cta">
          <button 
            className="btn btn-primary"
            onClick={() => navigate('/signup')}
          >
            Start Free Trial
          </button>
          <button 
            className="btn btn-secondary"
            onClick={() => navigate('/login')}
          >
            Sign In
          </button>
        </div>

        <div className="hero-features-inline">
          <div className="feature-chip">
            <span className="chip-icon">📊</span>
            <span>Real-time Analytics</span>
          </div>
          <div className="feature-chip">
            <span className="chip-icon">🚚</span>
            <span>Fleet Optimization</span>
          </div>
          <div className="feature-chip">
            <span className="chip-icon">⚡</span>
            <span>AI Predictions</span>
          </div>
        </div>
      </div>
    </section>
  );
};
