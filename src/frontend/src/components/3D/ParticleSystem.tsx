// @ts-nocheck
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleSystemProps {
  count: number;
}

export const ParticleSystem: React.FC<ParticleSystemProps> = ({
  count,
}) => {
  const pointsRef = useRef<THREE.Points>(null);

  // Generate particle positions and initial velocities
  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Random positions in scene volume
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = Math.random() * 30;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 100;

      // Random velocities (flowing effect)
      velocities[i * 3] = (Math.random() - 0.5) * 0.3;
      velocities[i * 3 + 1] = Math.random() * 0.5 - 0.25;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
    }

    return { positions, velocities };
  }, [count]);

  // Animation loop
  useFrame((_state: any) => {
    if (pointsRef.current) {
      const posArray = pointsRef.current.geometry.attributes.position
        .array as Float32Array;

      for (let i = 0; i < count; i++) {
        // Update positions
        posArray[i * 3] += velocities[i * 3] * 0.1;
        posArray[i * 3 + 1] += velocities[i * 3 + 1] * 0.1;
        posArray[i * 3 + 2] += velocities[i * 3 + 2] * 0.1;

        // Wrap around boundaries
        if (Math.abs(posArray[i * 3]) > 60) {
          posArray[i * 3] = -posArray[i * 3];
        }
        if (posArray[i * 3 + 1] > 40 || posArray[i * 3 + 1] < 0) {
          velocities[i * 3 + 1] *= -1;
        }
        if (Math.abs(posArray[i * 3 + 2]) > 60) {
          posArray[i * 3 + 2] = -posArray[i * 3 + 2];
        }
      }

      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
  });

  // Cleanup WebGL resources
  useEffect(() => {
    return () => {
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
        if (Array.isArray(pointsRef.current.material)) {
          pointsRef.current.material.forEach(m => m.dispose());
        } else {
          pointsRef.current.material.dispose();
        }
      }
    };
  }, []);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          array={positions}
          count={count}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.2}
        color={0x00d9ff}
        sizeAttenuation={true}
        opacity={0.3}
        transparent={true}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};
