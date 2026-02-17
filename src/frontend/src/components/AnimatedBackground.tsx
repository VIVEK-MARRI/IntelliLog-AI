import React, { useEffect, useRef } from 'react';

/**
 * Animated logistics-themed background for the landing page.
 * Features:
 * - Moving route lines connecting warehouse nodes
 * - Delivery vehicles traveling along routes
 * - Warehouse nodes with pulsing glow
 * - Glowing map grid background
 * - GPU-optimized animations for smooth performance
 */
export const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Warehouse nodes (depots)
    const warehouses = [
      { x: canvas.width * 0.2, y: canvas.height * 0.3, id: 'wh1' },
      { x: canvas.width * 0.8, y: canvas.height * 0.4, id: 'wh2' },
      { x: canvas.width * 0.5, y: canvas.height * 0.8, id: 'wh3' },
    ];

    // Customer locations (delivery destinations)
    const customers = [
      { x: canvas.width * 0.15, y: canvas.height * 0.6 },
      { x: canvas.width * 0.35, y: canvas.height * 0.5 },
      { x: canvas.width * 0.65, y: canvas.height * 0.2 },
      { x: canvas.width * 0.85, y: canvas.height * 0.7 },
      { x: canvas.width * 0.45, y: canvas.height * 0.35 },
    ];

    // Routes (connections between waypoints)
    const routes = [
      { start: warehouses[0], waypoints: [customers[0], customers[1]], speed: 0.0005 },
      { start: warehouses[1], waypoints: [customers[2], customers[3]], speed: 0.0004 },
      { start: warehouses[2], waypoints: [customers[4]], speed: 0.0006 },
    ];

    let animationTime = 0;

    const drawGrid = () => {
      const gridSize = 40;
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.05)';
      ctx.lineWidth = 1;

      for (let x = 0; x < canvas.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }

      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
    };

    const drawRoute = (route: typeof routes[0]) => {
      // Draw route line
      ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      
      ctx.beginPath();
      ctx.moveTo(route.start.x, route.start.y);
      
      for (const waypoint of route.waypoints) {
        ctx.lineTo(waypoint.x, waypoint.y);
      }
      
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawWarehouse = (warehouse: typeof warehouses[0], pulse: number) => {
      const glow = 20 + Math.sin(pulse) * 5;
      
      // Outer glow
      const glowGradient = ctx.createRadialGradient(
        warehouse.x,
        warehouse.y,
        0,
        warehouse.x,
        warehouse.y,
        glow
      );
      glowGradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
      glowGradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
      
      ctx.fillStyle = glowGradient;
      ctx.fillRect(
        warehouse.x - glow,
        warehouse.y - glow,
        glow * 2,
        glow * 2
      );

      // Center circle
      ctx.fillStyle = 'rgb(59, 130, 246)';
      ctx.beginPath();
      ctx.arc(warehouse.x, warehouse.y, 8, 0, Math.PI * 2);
      ctx.fill();

      // Inner white core
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(warehouse.x, warehouse.y, 4, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawCustomer = (customer: typeof customers[0]) => {
      // Simple small node
      ctx.fillStyle = 'rgba(34, 197, 94, 0.6)';
      ctx.beginPath();
      ctx.arc(customer.x, customer.y, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(34, 197, 94, 0.8)';
      ctx.lineWidth = 2;
      ctx.stroke();
    };

    const drawVehicle = (x: number, y: number, angle: number) => {
      // Vehicle body
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Vehicle rectangle
      ctx.fillStyle = 'rgb(236, 72, 153)';
      ctx.fillRect(-12, -6, 24, 12);

      // Vehicle heading indicator
      ctx.fillStyle = 'white';
      ctx.fillRect(8, -4, 4, 8);

      ctx.restore();

      // Vehicle glow
      const glowGradient = ctx.createRadialGradient(x, y, 0, x, y, 20);
      glowGradient.addColorStop(0, 'rgba(236, 72, 153, 0.3)');
      glowGradient.addColorStop(1, 'rgba(236, 72, 153, 0)');
      ctx.fillStyle = glowGradient;
      ctx.beginPath();
      ctx.arc(x, y, 20, 0, Math.PI * 2);
      ctx.fill();
    };

    const getPositionOnPath = (
      start: typeof warehouses[0],
      waypoints: typeof customers,
      progress: number
    ): { x: number; y: number; angle: number } => {
      const points = [start, ...waypoints];
      const cycleProgress = progress % 1;
      const currentSegment = Math.floor(cycleProgress * (points.length - 1));
      const nextSegment = (currentSegment + 1) % points.length;
      
      const segmentProgress = (cycleProgress * (points.length - 1) - currentSegment);
      
      const p1 = points[currentSegment];
      const p2 = points[nextSegment];
      
      const x = p1.x + (p2.x - p1.x) * segmentProgress;
      const y = p1.y + (p2.y - p1.y) * segmentProgress;
      
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      
      return { x, y, angle };
    };

    const animate = () => {
      animationTime += 1;

      // Clear canvas
      ctx.fillStyle = 'rgb(15, 23, 42)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw grid
      drawGrid();

      // Draw routes
      routes.forEach(route => {
        drawRoute(route);
      });

      // Draw warehouses
      warehouses.forEach(wh => {
        drawWarehouse(wh, animationTime * 0.05);
      });

      // Draw customers
      customers.forEach(customer => {
        drawCustomer(customer);
      });

      // Draw vehicles
      routes.forEach(route => {
        const progress = (animationTime * route.speed) % 1;
        const pos = getPositionOnPath(route.start, route.waypoints, progress);
        drawVehicle(pos.x, pos.y, pos.angle);
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ display: 'block' }}
    />
  );
};
