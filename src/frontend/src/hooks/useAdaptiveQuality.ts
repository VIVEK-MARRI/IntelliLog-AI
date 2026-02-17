import { useEffect, useState } from 'react';

export type QualityLevel = 'low' | 'medium' | 'high';

export const useAdaptiveQuality = (): QualityLevel => {
  const [quality, setQuality] = useState<QualityLevel>('high');

  useEffect(() => {
    // Detect device capabilities
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');

    if (!gl) {
      setQuality('low');
      return;
    }

    // Check for WebGL2 support
    const hasWebGL2 = !!canvas.getContext('webgl2');

    // Detect GPU memory and capabilities
    // const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    // const gpuInfo = debugInfo
    //   ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    //   : 'Unknown';

    // Check device type
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /mobile|android|iphone|ipad|tablet/.test(userAgent);

    // Check available memory
    const memory = (navigator as any).deviceMemory || 8;

    // Determine quality based on capabilities
    if (isMobile) {
      // Mobile devices - lower quality
      setQuality('low');
    } else if (memory >= 8 && hasWebGL2) {
      // Desktop with good specs
      setQuality('high');
    } else {
      // Mid-range devices
      setQuality('medium');
    }

    // Monitor performance and adapt
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > 16.67) {
          // Frame took longer than 16.67ms (60 FPS)
          setQuality((prev) =>
            prev === 'high' ? 'medium' : prev === 'medium' ? 'low' : 'low'
          );
        }
      }
    });

    observer.observe({ entryTypes: ['measure'] });

    return () => observer.disconnect();
  }, []);

  return quality;
};
