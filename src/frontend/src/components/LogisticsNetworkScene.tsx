// @ts-nocheck
import React, { useEffect, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { LogisticsVisualization } from './3D/LogisticsVisualization';
import { useAdaptiveQuality } from '../hooks/useAdaptiveQuality';

export const LogisticsNetworkScene: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const quality = useAdaptiveQuality();

  // Ensure client-side only rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-full bg-gradient-to-b from-gray-950 via-blue-950 to-gray-950" />
    );
  }

  return (
    <div className="w-full h-full bg-gradient-to-b from-gray-950 via-blue-950 to-gray-950 absolute inset-0">
      <Canvas
        camera={{ position: [0, 15, 30], fov: 60, near: 0.1, far: 1000 }}
        dpr={1}
        gl={{
          antialias: false,
          powerPreference: 'low-power',
          alpha: true,
          stencil: false,
          depth: true,
          preserveDrawingBuffer: false,
          failIfMajorPerformanceCaveat: false,
          precision: 'lowp',
        }}
        onCreated={(state) => {
          // Handle WebGL context loss
          const canvas = state.gl?.domElement || state.gl?.canvas;
          if (canvas) {
            canvas.addEventListener('webglcontextlost', (event: Event) => {
              event.preventDefault();
              console.warn('WebGL context lost, attempting recovery...');
            });
            canvas.addEventListener('webglcontextrestored', () => {
              console.log('WebGL context restored');
            });
          }
        }}
      >
        <color attach="background" args={['#0f172a']} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <pointLight position={[20, 30, 20]} intensity={1} color="#6366f1" />

        {/* Logistics Visualization */}
        <LogisticsVisualization quality={quality} />

        {/* Camera */}
        <PerspectiveCamera
          makeDefault
          position={[0, 15, 30]}
          fov={60}
          near={0.1}
          far={1000}
        />
      </Canvas>
    </div>
  );
};
