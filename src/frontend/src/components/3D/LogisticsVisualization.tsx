// @ts-nocheck
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlowingNode } from './GlowingNode';
import { AnimatedRoute } from './AnimatedRoute';
import { ParticleSystem } from './ParticleSystem';

interface LogisticsVisualizationProps {
  quality: 'low' | 'medium' | 'high';
}

export const LogisticsVisualization: React.FC<LogisticsVisualizationProps> = ({
  quality,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  // Generate network data
  const { warehouses, customers, routes } = useMemo(() => {
    // Warehouse hubs (command centers)
    const warehouses = [
      { id: 'wh1', pos: [-25, 5, -25], name: 'Hub Central', intensity: 1.2 },
      { id: 'wh2', pos: [25, 5, -25], name: 'Hub East', intensity: 1 },
      { id: 'wh3', pos: [0, 8, 25], name: 'Hub North', intensity: 1.1 },
    ];

    // Customer destinations
    const customers = [
      { id: 'c1', pos: [-35, 2, -35], name: 'Customer A' },
      { id: 'c2', pos: [35, 2, -35], name: 'Customer B' },
      { id: 'c3', pos: [40, 2, 20], name: 'Customer C' },
      { id: 'c4', pos: [-40, 2, 30], name: 'Customer D' },
      { id: 'c5', pos: [10, 2, 35], name: 'Customer E' },
    ];

    // Routes connecting hubs to customers
    const routes = [
      { from: 'wh1', to: 'c1', speed: 1 },
      { from: 'wh1', to: 'c4', speed: 1.2 },
      { from: 'wh2', to: 'c2', speed: 1.1 },
      { from: 'wh2', to: 'c3', speed: 0.9 },
      { from: 'wh3', to: 'c5', speed: 1 },
      { from: 'wh3', to: 'c3', speed: 1.15 },
      // Inter-warehouse routes
      { from: 'wh1', to: 'wh2', speed: 0.7 },
      { from: 'wh2', to: 'wh3', speed: 0.8 },
    ];

    return { warehouses, customers, routes };
  }, []);

  // Animation loop
  useFrame(() => {
    if (groupRef.current && quality === 'high') {
      timeRef.current += 0.0016;
      // Subtle rotation for parallax effect - only for high quality
      groupRef.current.rotation.y += 0.0001;
    }
  });

  const particleCount = quality === 'high' ? 100 : quality === 'medium' ? 50 : 0;

  return (
    <group ref={groupRef}>
      {/* Environment Grid - subtle reference plane */}
      {quality === 'high' && <gridHelper args={[100, 20]} position={[0, 0, 0]} />}

      {/* Warehouse Nodes */}
      {warehouses.map((wh) => (
        <GlowingNode
          key={wh.id}
          position={wh.pos as [number, number, number]}
          intensity={wh.intensity}
          color="#6366f1"
          label={wh.name}
          type="warehouse"
        />
      ))}

      {/* Customer Points */}
      {customers.map((cust) => (
        <GlowingNode
          key={cust.id}
          position={cust.pos as [number, number, number]}
          intensity={0.8}
          color="#0ea5e9"
          label={cust.name}
          type="customer"
        />
      ))}

      {/* Animated Routes */}
      {/* Disabled - causing shader uniform errors */}
      {false && quality !== 'low' && routes.map((route, idx) => {
        const fromPos =
          warehouses.find((w) => w.id === route.from)?.pos ||
          customers.find((c) => c.id === route.from)?.pos;
        const toPos =
          warehouses.find((w) => w.id === route.to)?.pos ||
          customers.find((c) => c.id === route.to)?.pos;

        if (!fromPos || !toPos)
          return null;

        return (
          <AnimatedRoute
            key={`route-${idx}`}
            from={fromPos as [number, number, number]}
            to={toPos as [number, number, number]}
            speed={route.speed}
            color={0x3b82f6}
          />
        );
      })}

      {/* Particle System for Motion Depth */}
      {false && quality === 'high' && (
        <ParticleSystem count={particleCount} />
      )}
    </group>
  );
};
