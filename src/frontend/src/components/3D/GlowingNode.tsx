// @ts-nocheck
import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Text } from '@react-three/drei';

interface GlowingNodeProps {
  position: [number, number, number];
  intensity: number;
  color: string;
  label: string;
  type: 'warehouse' | 'customer';
}

export const GlowingNode: React.FC<GlowingNodeProps> = ({
  position,
  intensity,
  color,
  label,
  type,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);

  // Animation loop for pulsing effect
  useFrame((state: any) => {
    if (meshRef.current) {
      const t = state.clock.elapsedTime;
      meshRef.current.rotation.x = t * 0.1;
      meshRef.current.rotation.y = t * 0.15;

      // Pulsing scale
      const pulse = 1 + Math.sin(t * 2) * 0.1;
      meshRef.current.scale.set(pulse, pulse, pulse);
    }
  });

  // Cleanup WebGL resources
  useEffect(() => {
    return () => {
      meshRef.current?.geometry.dispose();
    };
  }, []);

  const size = type === 'warehouse' ? 1.5 : 0.8;

  return (
    <group position={position}>
      {/* Core geometry */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[size, 3]} />
        <meshBasicMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.8}
          wireframe={false}
        />
      </mesh>
    </group>
  );
};
