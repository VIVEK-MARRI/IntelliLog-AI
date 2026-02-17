// @ts-nocheck
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface AnimatedRouteProps {
  from: [number, number, number];
  to: [number, number, number];
  speed: number;
  color: number;
}

export const AnimatedRoute: React.FC<AnimatedRouteProps> = ({
  from,
  to,
  speed,
  color,
}) => {
  const lineRef = useRef<THREE.Line>(null) as any;
  const pulseRef = useRef<THREE.Line>(null) as any;

  // Create bezier curve for smooth routing
  const curve = useMemo(() => {
    const midpoint = new THREE.Vector3(
      (from[0] + to[0]) / 2,
      Math.max(from[1], to[1]) + 5,
      (from[2] + to[2]) / 2
    );
    return new THREE.CatmullRomCurve3([
      new THREE.Vector3(...from),
      midpoint,
      new THREE.Vector3(...to),
    ]);
  }, [from, to]);

  // Route path points
  const points = useMemo(() => {
    return curve.getPoints(64);
  }, [curve]);

  // Animated pulse along route
  useFrame((state: any) => {
    if (pulseRef.current) {
      const t = (state.clock.elapsedTime * speed) % 1;
      const pulseGeometry = new THREE.BufferGeometry();
      const pulsePath = [];

      // Create leading pulse
      for (let i = Math.max(0, t - 0.1); i <= Math.min(1, t + 0.1); i += 0.01) {
        const p = curve.getPoint(i);
        pulsePath.push(p);
      }

      pulseGeometry.setFromPoints(pulsePath);
      pulseRef.current.geometry = pulseGeometry;
    }
  });

  // Cleanup WebGL resources
  useEffect(() => {
    return () => {
      lineRef.current?.geometry.dispose();
      pulseRef.current?.geometry.dispose();
      if (lineRef.current && Array.isArray(lineRef.current.material)) {
        lineRef.current.material.forEach(m => m.dispose());
      } else if (lineRef.current) {
        lineRef.current.material?.dispose();
      }
      if (pulseRef.current && Array.isArray(pulseRef.current.material)) {
        pulseRef.current.material.forEach(m => m.dispose());
      } else if (pulseRef.current) {
        pulseRef.current.material?.dispose();
      }
    };
  }, []);

  return (
    <group>
      {/* Main route line */}
      <line ref={lineRef}>
        <bufferGeometry attach="geometry" />
        <lineBasicMaterial
          attach="material"
          color={color}
          linewidth={2}
          opacity={0.4}
          transparent={true}
          blending={THREE.AdditiveBlending}
        />
        <bufferGeometry
          attach="geometry"
          setFromPoints={points}
        />
      </line>

      {/* Animated pulse */}
      <line ref={pulseRef}>
        <bufferGeometry attach="geometry" />
        <lineBasicMaterial
          attach="material"
          color={0x00d9ff}
          linewidth={4}
          opacity={0.8}
          transparent={true}
          blending={THREE.AdditiveBlending}
        />
      </line>

      {/* Glow edges */}
      <line>
        <bufferGeometry
          attach="geometry"
          setFromPoints={points}
        />
        <lineBasicMaterial
          attach="material"
          color={color}
          linewidth={1}
          opacity={0.15}
          transparent={true}
        />
      </line>
    </group>
  );
};
