/*
  npm installs required:
  npm install lenis

  Note: Three.js r128 is loaded via CDN script at runtime in this file.
*/

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import { motion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import styles from './LandingV2.module.css';
import { apiClient } from '../api';

gsap.registerPlugin(ScrollTrigger, MotionPathPlugin);

declare global {
  interface Window {
    THREE?: any;
  }
}

type RouteConfig = {
  id: string;
  path: string;
};

type HeroNode = {
  id: string;
  name: string;
  x: number;
  y: number;
};

const TOKENS = {
  bg: '#080B10',
  surface: '#0D1117',
  elevated: '#161B22',
  borderSubtle: 'rgba(255,255,255,0.06)',
  borderStrong: 'rgba(255,255,255,0.12)',
  accent: '#2DD4BF',
  accentDim: 'rgba(45,212,191,0.12)',
  textPrimary: '#E6EDF3',
  textSecondary: '#7D8590',
  textTertiary: '#484F58',
  success: '#3FB950',
  warning: '#D29922',
  danger: '#F85149',
};

const HERO_POINTS: HeroNode[] = [
  { id: 'hitech', name: 'Hitech City', x: -0.78, y: 0.25 },
  { id: 'charminar', name: 'Charminar', x: -0.35, y: -0.62 },
  { id: 'banjara', name: 'Banjara Hills', x: -0.1, y: -0.05 },
  { id: 'secunderabad', name: 'Secunderabad', x: 0.15, y: 0.48 },
  { id: 'lbnagar', name: 'LB Nagar', x: 0.52, y: -0.52 },
  { id: 'gachibowli', name: 'Gachibowli', x: -0.62, y: -0.08 },
  { id: 'madhapur', name: 'Madhapur', x: -0.58, y: 0.12 },
  { id: 'kondapur', name: 'Kondapur', x: -0.48, y: 0.05 },
  { id: 'begumpet', name: 'Begumpet', x: 0.04, y: 0.22 },
  { id: 'jubilee', name: 'Jubilee Hills', x: -0.2, y: -0.18 },
  { id: 'medchal', name: 'Medchal', x: 0.55, y: 0.72 },
  { id: 'airport', name: 'Airport', x: 0.86, y: -0.2 },
];

const HERO_ROUTES: number[][] = [
  [0, 6, 5, 1],
  [3, 8, 2, 5],
  [10, 3, 8, 4],
  [11, 3, 2, 1],
  [0, 7, 2, 9, 1],
  [5, 2, 8, 3, 10],
  [6, 2, 4, 11],
  [10, 8, 4, 9],
];

const ARCH_CONNECTIONS: RouteConfig[] = [
  { id: 'a1', path: 'M 130 170 C 190 170, 210 170, 270 170' },
  { id: 'a2', path: 'M 350 170 C 410 170, 430 170, 490 170' },
  { id: 'a3', path: 'M 570 170 C 630 170, 650 170, 710 170' },
  { id: 'a4', path: 'M 350 240 C 350 290, 350 310, 350 350' },
  { id: 'a5', path: 'M 350 300 C 440 300, 520 290, 570 240' },
  { id: 'a6', path: 'M 430 240 C 430 290, 430 310, 430 350' },
  { id: 'a7', path: 'M 430 350 C 540 350, 640 310, 740 250' },
];

type MetricTarget = {
  key: 'etaAcc' | 'mae' | 'latency';
  to: number;
  suffix: string;
  prefix?: string;
};

const loadThreeFromCdn = (): Promise<any> => {
  if (window.THREE) {
    return Promise.resolve(window.THREE);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-three-r128="true"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve(window.THREE));
      existing.addEventListener('error', () => reject(new Error('Failed to load Three.js r128 script')));
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://unpkg.com/three@0.128.0/build/three.min.js';
    script.async = true;
    script.dataset.threeR128 = 'true';
    script.onload = () => resolve(window.THREE);
    script.onerror = () => reject(new Error('Failed to load Three.js r128 script'));
    document.head.appendChild(script);
  });
};

const LandingV2 = () => {
  const navigate = useNavigate();
  const lenisRef = useRef<Lenis | null>(null);
  const heroCanvasRef = useRef<HTMLDivElement | null>(null);
  const architectureSvgRef = useRef<SVGSVGElement | null>(null);
  const problemSectionRef = useRef<HTMLElement | null>(null);
  const section2Ref = useRef<HTMLElement | null>(null);
  const countMetricRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const loopCenterCountRef = useRef<HTMLDivElement | null>(null);
  const loopNodeRefs = useRef<Record<string, HTMLDivElement | null>>({
    top: null,
    right: null,
    bottom: null,
    left: null,
  });
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [serviceHealth, setServiceHealth] = useState({
    api: 'checking',
    db: 'checking',
    redis: 'checking',
    worker: 'checking',
  });
  const [liveKpis, setLiveKpis] = useState({
    activeDrivers: 4,
    deliveredOrders: 12,
    etaAccuracy: 91,
    maeReduction: 29,
    predictionLatencyP99: 100,
  });

  const metricTargets: MetricTarget[] = useMemo(
    () => [
      { key: 'etaAcc', to: Math.max(0, Math.round(liveKpis.etaAccuracy)), suffix: '%' },
      { key: 'mae', to: Math.max(0, Math.round(liveKpis.maeReduction)), suffix: '%' },
      { key: 'latency', to: Math.max(50, Math.round(liveKpis.predictionLatencyP99)), suffix: 'ms', prefix: '<' },
    ],
    [liveKpis]
  );

  const docsUrl = useMemo(() => `${apiClient.baseURL.replace(/\/api\/v1\/?$/, '')}/docs`, []);
  const isNarrow = viewportWidth <= 390;
  const isTablet = viewportWidth >= 768 && viewportWidth < 1100;

  const prefersReduced = useMemo(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    []
  );

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setIsMobile(window.innerWidth < 768);
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    let mounted = true;

    const loadLiveSignals = async () => {
      const [statusResult, metricsResult] = await Promise.allSettled([
        apiClient.getSystemStatus(),
        apiClient.getLogisticsMetrics(),
      ]);

      if (!mounted) return;

      if (statusResult.status === 'fulfilled') {
        const status = statusResult.value;
        setServiceHealth({
          api: status.api || (status.status === 'ok' || status.status === 'operational' ? 'healthy' : 'degraded'),
          db: status.db || 'degraded',
          redis: status.redis || 'degraded',
          worker: status.celery || 'degraded',
        });
      }

      if (metricsResult.status === 'fulfilled') {
        const metrics = metricsResult.value;
        const maeValue = Number(metrics.eta_prediction?.mae_minutes ?? NaN);
        const derivedMaeReduction = Number.isFinite(maeValue)
          ? Math.max(0, Math.min(60, Math.round(((12 - maeValue) / 12) * 100)))
          : undefined;

        setLiveKpis((prev) => ({
          activeDrivers: Number(metrics.fleet?.active_drivers ?? prev.activeDrivers),
          deliveredOrders: Number(metrics.orders?.delivered ?? prev.deliveredOrders),
          etaAccuracy: Number(metrics.delivery_success_rate_pct ?? prev.etaAccuracy),
          maeReduction: derivedMaeReduction ?? prev.maeReduction,
          predictionLatencyP99: prev.predictionLatencyP99,
        }));
      }
    };

    void loadLiveSignals();
    const interval = window.setInterval(() => {
      void loadLiveSignals();
    }, 20000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    });

    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.lagSmoothing(0);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  const initHeroThreeScene = useCallback(async () => {
    if (prefersReduced || isMobile || !heroCanvasRef.current) {
      return () => undefined;
    }

    const THREE = await loadThreeFromCdn();
    const mount = heroCanvasRef.current;
    if (!mount || !THREE) {
      return () => undefined;
    }

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.domElement.style.opacity = '0';
    renderer.domElement.style.transition = 'opacity 480ms ease';
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 100);
    camera.position.set(0, 0, 3);
    camera.lookAt(0, 0, 0);

    const group = new THREE.Group();
    group.rotation.x = -0.26;
    scene.add(group);

    const ambient = new THREE.AmbientLight(0xffffff, 0.15);
    scene.add(ambient);

    const nodeGeometry = new THREE.BoxGeometry(0.015, 0.015, 0.03);
    const nodeMaterial = new THREE.MeshStandardMaterial({
      color: TOKENS.accent,
      emissive: TOKENS.accent,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.94,
    });

    const nodeMesh = new THREE.InstancedMesh(nodeGeometry, nodeMaterial, HERO_POINTS.length);
    const baseTransforms: Array<{ x: number; y: number; z: number }> = [];
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();

    HERO_POINTS.forEach((p, i) => {
      const x = p.x;
      const y = p.y;
      const z = 0;
      baseTransforms.push({ x, y, z });
      position.set(x, y, z);
      scale.set(1, 1, 1);
      matrix.compose(position, quaternion, scale);
      nodeMesh.setMatrixAt(i, matrix);
    });

    group.add(nodeMesh);

    const routeMaterials: any[] = [];
    const routeGeometries: any[] = [];
    const curves: any[] = [];

    HERO_ROUTES.forEach((route) => {
      const routePoints = route.map((idx) => {
        const p = HERO_POINTS[idx];
        return new THREE.Vector3(p.x, p.y, 0.001);
      });
      const curve = new THREE.CatmullRomCurve3(routePoints);
      curves.push(curve);
      const tubeGeometry = new THREE.TubeGeometry(curve, 50, 0.002, 6, false);
      const tubeMaterial = new THREE.MeshBasicMaterial({
        color: TOKENS.accent,
        transparent: true,
        opacity: 0.4,
      });
      const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
      routeGeometries.push(tubeGeometry);
      routeMaterials.push(tubeMaterial);
      group.add(tube);
    });

    const deliveryGeometry = new THREE.SphereGeometry(0.012, 12, 12);
    const deliveryMaterial = new THREE.MeshStandardMaterial({
      color: TOKENS.accent,
      emissive: TOKENS.accent,
      emissiveIntensity: 0.5,
    });

    const activeDeliveries: Array<{
      mesh: any;
      light: any;
      routeIndex: number;
      t: number;
      speed: number;
    }> = [];

    for (let i = 0; i < 4; i += 1) {
      const mesh = new THREE.Mesh(deliveryGeometry, deliveryMaterial.clone());
      const light = new THREE.PointLight(TOKENS.accent, 0.3, 0.3);
      mesh.add(light);
      group.add(mesh);
      activeDeliveries.push({
        mesh,
        light,
        routeIndex: Math.floor(Math.random() * curves.length),
        t: Math.random(),
        speed: 0.0008 + Math.random() * 0.0014,
      });
    }

    let mounted = true;
    let rafId = 0;
    const clock = new THREE.Clock();

    const onResize = () => {
      if (!mount) return;
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      const aspect = h === 0 ? 1 : w / h;
      const frustum = 1.2;
      camera.left = -frustum * aspect;
      camera.right = frustum * aspect;
      camera.top = frustum;
      camera.bottom = -frustum;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    };

    window.addEventListener('resize', onResize);
    onResize();

    const animate = () => {
      if (!mounted) return;
      const elapsed = clock.getElapsedTime();

      const matrixTemp = new THREE.Matrix4();
      baseTransforms.forEach((t, i) => {
        const pulse = 1 + Math.sin(elapsed * 2 + i) * 0.28;
        position.set(t.x, t.y, 0);
        scale.set(1, 1, pulse);
        matrixTemp.compose(position, quaternion, scale);
        nodeMesh.setMatrixAt(i, matrixTemp);
      });
      nodeMesh.instanceMatrix.needsUpdate = true;

      activeDeliveries.forEach((delivery) => {
        const curve = curves[delivery.routeIndex];
        delivery.t += delivery.speed;
        if (delivery.t > 1) {
          delivery.t = 0;
          delivery.routeIndex = Math.floor(Math.random() * curves.length);
        }
        const point = curve.getPoint(delivery.t % 1);
        delivery.mesh.position.copy(point);
        delivery.mesh.updateMatrixWorld();
      });

      group.rotation.z += 0.0003;
      renderer.render(scene, camera);

      rafId = requestAnimationFrame(animate);
    };

    requestAnimationFrame(() => {
      renderer.domElement.style.opacity = '1';
    });

    animate();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);

      renderer.dispose();
      scene.traverse((obj: any) => {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m: any) => m.dispose?.());
          } else {
            obj.material.dispose?.();
          }
        }
      });

      routeGeometries.forEach((g) => g.dispose());
      routeMaterials.forEach((m) => m.dispose());
      deliveryGeometry.dispose();
      deliveryMaterial.dispose();

      scene.clear();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [isMobile, prefersReduced]);

  useEffect(() => {
    let cleanup: undefined | (() => void);
    initHeroThreeScene().then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      cleanup?.();
    };
  }, [initHeroThreeScene]);

  useEffect(() => {
    if (prefersReduced) {
      return () => undefined;
    }

    const contexts: gsap.Context[] = [];

    const heroCtx = gsap.context(() => {
      const tl = gsap.timeline();
      tl.fromTo('[data-hero-badge]', { opacity: 0, y: 4 }, { opacity: 1, y: 0, duration: 0.32, ease: 'power2.out' });
      tl.fromTo('[data-hero-line="1"]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.58, ease: 'power4.out' }, 0.1);
      tl.fromTo('[data-hero-line="2"]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.58, ease: 'power4.out' }, 0.2);
      tl.fromTo('[data-hero-subline]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.48, ease: 'power2.out' }, 0.52);
      tl.fromTo('[data-hero-buttons]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.48, ease: 'power2.out' }, 0.65);
      tl.fromTo('[data-hero-metrics]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.48, ease: 'power2.out' }, 0.75);

      metricTargets.forEach((m, idx) => {
        const el = countMetricRefs.current[idx];
        if (!el) return;
        const obj = { value: 0 };
        gsap.to(obj, {
          value: m.to,
          duration: 1.2,
          delay: 0.8,
          ease: 'power2.out',
          onUpdate: () => {
            const rounded = Math.round(obj.value);
            el.textContent = `${m.prefix ?? ''}${rounded}${m.suffix}`;
          },
        });
      });
    });
    contexts.push(heroCtx);

    const problemCardCtx = gsap.context(() => {
      const section = problemSectionRef.current;
      if (!section) return;

      ScrollTrigger.create({
        trigger: '#section-problem',
        pin: true,
        start: 'top top',
        end: '+=200%',
        scrub: 0.6,
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: '#section-problem',
          start: 'top top',
          end: '+=200%',
          scrub: 0.6,
        },
      });

      tl.fromTo('[data-problem-card="1"]', { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.3 }, 0)
        .to('[data-problem-eta]', { filter: 'blur(0px)', duration: 0.35 }, 0.35)
        .to('[data-problem-why]', { textContent: 'Rush hour traffic +8 min / Zone familiarity +4 min', duration: 0.35 }, 0.4)
        .fromTo('[data-problem-bars] [data-bar-fill]', { width: '0%' }, { width: (i: number) => ['84%', '56%', '42%', '4%'][i], duration: 0.4, stagger: 0.06 }, 0.45)
        .to('[data-problem-copy]', { opacity: 0, y: -8, duration: 0.16 }, 0.48)
        .to('[data-problem-copy]', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          onStart: () => {
            const copy = document.querySelector('[data-problem-copy]');
            if (copy) {
              copy.textContent = 'IntelliLog shows you the reason. Every factor. Every delivery. In milliseconds.';
            }
          },
        }, 0.58)
        .fromTo('[data-problem-card="2"]', { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.35 }, 0.7)
        .to('[data-problem-copy]', {
          opacity: 1,
          y: 0,
          duration: 0.3,
          onStart: () => {
            const copy = document.querySelector('[data-problem-copy]');
            if (copy) {
              copy.textContent = 'It does not just explain. It tells you what to do.';
            }
          },
        }, 0.85);
    });
    contexts.push(problemCardCtx);

    const architectureCtx = gsap.context(() => {
      const svg = architectureSvgRef.current;
      if (!svg) return;

      ARCH_CONNECTIONS.forEach((conn, index) => {
        const path = svg.querySelector(`#${conn.id}`) as SVGPathElement | null;
        const dot = svg.querySelector(`#${conn.id}-dot`) as SVGCircleElement | null;
        if (!path || !dot) return;

        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;

        gsap.to(path, {
          strokeDashoffset: 0,
          ease: 'none',
          scrollTrigger: {
            trigger: '#section-architecture',
            start: 'top 70%',
            end: 'bottom 40%',
            scrub: 0.6,
          },
          delay: index * 0.06,
        });

        gsap.to(dot, {
          motionPath: { path, align: path, alignOrigin: [0.5, 0.5] },
          duration: 2,
          repeat: -1,
          ease: 'none',
          delay: 0.6 + index * 0.08,
        });
      });
    });
    contexts.push(architectureCtx);

    const loopCtx = gsap.context(() => {
      const metricMap: Record<string, string> = {
        top: '+1 training sample',
        right: 'error_min = -1.2 min',
        bottom: 'MAE: 8.3 -> 8.1 min',
        left: '92% accuracy',
      };

      const loopDot = document.querySelector('#loop-dot');
      const path = document.querySelector('#loop-path');
      if (loopDot && path) {
        gsap.to(loopDot, {
          motionPath: {
            path: '#loop-path',
            align: '#loop-path',
            alignOrigin: [0.5, 0.5],
          },
          duration: 4,
          repeat: -1,
          ease: 'none',
          onUpdate: function onUpdate() {
            const progress = this.progress();
            const active =
              progress < 0.25 ? 'top' : progress < 0.5 ? 'right' : progress < 0.75 ? 'bottom' : 'left';

            (Object.keys(loopNodeRefs.current) as Array<keyof typeof loopNodeRefs.current>).forEach((key) => {
              const el = loopNodeRefs.current[key];
              if (!el) return;
              const metric = el.querySelector('[data-loop-metric]') as HTMLDivElement | null;
              if (key === active) {
                gsap.to(el, { opacity: 1, duration: 0.2 });
                gsap.to(el.querySelector('[data-loop-label]'), { fontWeight: 600, duration: 0.2 });
                if (metric) {
                  metric.textContent = metricMap[key];
                  gsap.fromTo(metric, { opacity: 0 }, { opacity: 1, duration: 0.2 });
                  gsap.to(metric, { opacity: 0, duration: 0.2, delay: 0.8 });
                }
              } else {
                gsap.to(el, { opacity: 0.5, duration: 0.2 });
                gsap.to(el.querySelector('[data-loop-label]'), { fontWeight: 500, duration: 0.2 });
              }
            });
          },
          scrollTrigger: {
            trigger: '#section-loop',
            start: 'top 70%',
            end: 'bottom 30%',
            scrub: 0.6,
          },
        });

        const centerCounter = { value: 10847 };
        if (loopCenterCountRef.current) {
          gsap.to(centerCounter, {
            value: 10920,
            duration: 40,
            repeat: -1,
            ease: 'none',
            onUpdate: () => {
              if (loopCenterCountRef.current) {
                loopCenterCountRef.current.textContent = Math.floor(centerCounter.value).toLocaleString();
              }
            },
            scrollTrigger: {
              trigger: '#section-loop',
              start: 'top 80%',
              end: 'bottom 20%',
              toggleActions: 'play pause play pause',
            },
          });
        }
      }
    });
    contexts.push(loopCtx);

    const metricWallCtx = gsap.context(() => {
      gsap.fromTo(
        '[data-metric-wall]',
        { opacity: 0, y: 24 },
        {
          opacity: 1,
          y: 0,
          duration: 0.5,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '#section-metrics',
            start: 'top 75%',
            end: 'top 45%',
            scrub: 0.6,
          },
        }
      );
    });
    contexts.push(metricWallCtx);

    const dispatchCtx = gsap.context(() => {
      if (!frameRef.current) return;

      gsap.fromTo(
        frameRef.current,
        { rotateY: -15, rotateX: 2 },
        {
          rotateY: -8,
          rotateX: 2,
          ease: 'none',
          transformPerspective: 1200,
          transformOrigin: 'center center',
          scrollTrigger: {
            trigger: '#section-dispatch',
            start: 'top 80%',
            end: 'bottom 30%',
            scrub: 0.6,
          },
        }
      );

      gsap.utils.toArray<SVGPathElement>('[data-callout-path]').forEach((path, i) => {
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
        gsap.to(path, {
          strokeDashoffset: 0,
          duration: 0.45,
          delay: i * 0.12,
          scrollTrigger: {
            trigger: '#section-dispatch',
            start: 'top 75%',
            end: 'top 45%',
            scrub: 0.6,
          },
        });
      });

      gsap.utils.toArray<HTMLElement>('[data-callout-card]').forEach((card, i) => {
        gsap.fromTo(
          card,
          { opacity: 0, y: 8 },
          {
            opacity: 1,
            y: 0,
            duration: 0.35,
            delay: 0.2 + i * 0.12,
            scrollTrigger: {
              trigger: '#section-dispatch',
              start: 'top 70%',
              end: 'top 40%',
              scrub: 0.6,
            },
          }
        );
      });
    });
    contexts.push(dispatchCtx);

    const profileCtx = gsap.context(() => {
      gsap.fromTo(
        '[data-profile-card]',
        { opacity: 0, y: 20 },
        {
          opacity: 1,
          y: 0,
          stagger: 0.2,
          duration: 0.45,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '#section-profiles',
            start: 'top 75%',
            end: 'top 40%',
            scrub: 0.6,
          },
        }
      );
    });
    contexts.push(profileCtx);

    const ctaCtx = gsap.context(() => {
      gsap.fromTo('[data-cta-title]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5, scrollTrigger: { trigger: '#section-cta', start: 'top 78%', end: 'top 48%', scrub: 0.6 } });
      gsap.fromTo('[data-cta-subtitle]', { opacity: 0, y: 14 }, { opacity: 1, y: 0, delay: 0.2, duration: 0.5, scrollTrigger: { trigger: '#section-cta', start: 'top 75%', end: 'top 45%', scrub: 0.6 } });
      gsap.fromTo('[data-cta-button]', { opacity: 0, y: 12 }, { opacity: 1, y: 0, delay: 0.3, duration: 0.5, scrollTrigger: { trigger: '#section-cta', start: 'top 72%', end: 'top 42%', scrub: 0.6 } });
    });
    contexts.push(ctaCtx);

    const revealCtx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('[data-reveal]').forEach((el, idx) => {
        gsap.fromTo(
          el,
          { opacity: 0, y: 16 },
          {
            opacity: 1,
            y: 0,
            duration: 0.55,
            ease: 'power3.out',
            delay: idx * 0.03,
            scrollTrigger: {
              trigger: el,
              start: 'top 86%',
              end: 'top 58%',
              scrub: 0.45,
            },
          }
        );
      });
    });
    contexts.push(revealCtx);

    return () => {
      contexts.forEach((ctx) => ctx.revert());
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, [prefersReduced]);

  const handleScrollToHow = () => {
    if (!section2Ref.current) return;
    lenisRef.current?.scrollTo(section2Ref.current, { duration: 1.2 });
  };

  const rootStyle: CSSProperties = {
    background: TOKENS.bg,
    color: TOKENS.textPrimary,
    fontFamily: 'Space Grotesk, Manrope, Segoe UI, sans-serif',
    minHeight: '100vh',
  };

  const monoStyle: CSSProperties = {
    fontFamily: 'JetBrains Mono, Fira Code, monospace',
    fontVariantNumeric: 'tabular-nums',
  };

  return (
    <div style={rootStyle} className={styles.pageRoot}>
      <section
        id="section-hero"
        style={{
          height: '100vh',
          position: 'relative',
          overflow: 'hidden',
          borderBottom: `1px solid ${TOKENS.borderSubtle}`,
        }}
      >
        <div className={styles.heroAura} />
        <div className={styles.heroVignette} />
        <div
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: 1320,
            margin: '0 auto',
            height: '100%',
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : isTablet ? '52% 48%' : '45% 55%',
            alignItems: 'center',
            padding: isMobile ? (isNarrow ? '76px 14px 24px' : '82px 18px 28px') : isTablet ? '84px 24px 40px' : '88px 32px 48px',
            gap: 20,
          }}
        >
          <div style={{ alignSelf: 'center', position: 'relative', zIndex: 5 }}>
            <div data-hero-badge className={styles.pill} style={{ opacity: prefersReduced ? 1 : 0 }}>
              <span style={{ color: TOKENS.accent, fontSize: 10 }}>●</span>
              <span>Live - {liveKpis.activeDrivers} active drivers operational</span>
            </div>

            <div className={styles.serviceRail}>
              {[
                ['API', serviceHealth.api],
                ['DB', serviceHealth.db],
                ['Redis', serviceHealth.redis],
                ['Worker', serviceHealth.worker],
              ].map(([name, state]) => {
                const tone = state === 'healthy' ? TOKENS.success : state === 'degraded' ? TOKENS.warning : TOKENS.danger;
                return (
                  <span key={name} className={styles.serviceChip}>
                    <i className={styles.serviceDot} style={{ background: tone }} />
                    <strong>{name}</strong>
                    <em>{state}</em>
                  </span>
                );
              })}
            </div>

            <h1
              data-reveal
              style={{
                marginTop: 26,
                marginBottom: 0,
                fontSize: isMobile ? (isNarrow ? 32 : 38) : isTablet ? 48 : 56,
                lineHeight: 1.04,
                letterSpacing: '-0.02em',
                fontWeight: 600,
                color: TOKENS.textPrimary,
              }}
            >
              <span data-hero-line="1" style={{ display: 'block', opacity: prefersReduced ? 1 : 0 }}>
                Delivery intelligence
              </span>
              <span data-hero-line="2" style={{ display: 'block', opacity: prefersReduced ? 1 : 0 }}>
                for the real world.
              </span>
            </h1>

            <p
              data-hero-subline
              style={{
                marginTop: 24,
                maxWidth: isMobile ? (isNarrow ? 290 : 330) : isTablet ? 390 : 420,
                lineHeight: 1.7,
                fontSize: isMobile ? (isNarrow ? 14.5 : 15.5) : 17,
                color: TOKENS.textSecondary,
                opacity: prefersReduced ? 1 : 0,
              }}
            >
              {isMobile
                ? 'IntelliLog-AI predicts delivery timing, explains every delay, and learns from every run.'
                : 'IntelliLog-AI predicts when every delivery arrives, explains exactly why, and gets smarter after each one.'}
            </p>

            <div data-hero-buttons style={{ marginTop: isMobile ? 24 : 30, display: 'flex', gap: isNarrow ? 10 : 12, flexWrap: 'wrap', opacity: prefersReduced ? 1 : 0 }}>
              <button className={styles.btnPrimary} onClick={() => navigate('/auth/signup')}>Request pilot access -&gt;</button>
              <button className={styles.btnSecondary} onClick={handleScrollToHow}>
                See how it works ↓
              </button>
              <button className={styles.btnSecondary} onClick={() => window.open(docsUrl, '_blank', 'noopener,noreferrer')}>
                Open live API docs
              </button>
            </div>

            <div
              data-hero-metrics
              style={{
                position: isMobile ? 'relative' : 'absolute',
                left: 0,
                bottom: isMobile ? 'auto' : 48,
                marginTop: isMobile ? 28 : 0,
                display: isMobile ? 'grid' : 'flex',
                gridTemplateColumns: isMobile ? (isNarrow ? '1fr' : 'repeat(2, minmax(0, auto))') : undefined,
                gap: isMobile ? (isNarrow ? 10 : 14) : 16,
                alignItems: 'center',
                opacity: prefersReduced ? 1 : 0,
              }}
            >
              {metricTargets.map((metric, idx) => (
                <div key={metric.key} style={{ display: 'flex', alignItems: 'center', gap: isNarrow ? 10 : 16 }}>
                  <div>
                    <div className={styles.metricNumber} style={{ ...monoStyle, fontSize: 18 }}>
                      <span ref={(el) => { countMetricRefs.current[idx] = el; }}>
                        {metric.prefix ?? ''}0{metric.suffix}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: TOKENS.textTertiary }}>
                      {idx === 0 ? 'ETA accuracy' : idx === 1 ? 'MAE reduction' : 'prediction'}
                    </div>
                  </div>
                  {!isNarrow && idx < metricTargets.length - 1 && (
                    <span style={{ width: 1, height: 24, background: TOKENS.borderStrong }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          <div style={{ position: 'relative', height: isMobile ? 280 : '100%' }}>
            {!isMobile && <div ref={heroCanvasRef} className={styles.canvas} />}
            {isMobile && (
              <svg
                viewBox="0 0 720 420"
                width="100%"
                height="100%"
                style={{ position: 'absolute', inset: 0 }}
              >
                <rect width="720" height="420" fill="transparent" />
                {HERO_ROUTES.map((r, idx) => {
                  const points = r
                    .map((p) => {
                      const node = HERO_POINTS[p];
                      const x = (node.x + 1) * 0.5 * 720;
                      const y = (node.y + 1) * 0.5 * 420;
                      return `${x},${y}`;
                    })
                    .join(' ');
                  return (
                    <polyline
                      key={`m-route-${idx}`}
                      points={points}
                      fill="none"
                      stroke={TOKENS.accent}
                      opacity={0.25}
                      strokeWidth={1}
                    />
                  );
                })}
                {HERO_POINTS.map((node) => {
                  const x = (node.x + 1) * 0.5 * 720;
                  const y = (node.y + 1) * 0.5 * 420;
                  return (
                    <rect
                      key={`m-node-${node.id}`}
                      x={x - 3}
                      y={y - 3}
                      width={6}
                      height={6}
                      fill={TOKENS.accent}
                      opacity={0.85}
                    />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </section>

      <section id="section-problem-wrap" ref={section2Ref} style={{ height: '300vh', position: 'relative' }}>
        <section
          id="section-problem"
          ref={problemSectionRef}
          style={{
            height: '100vh',
            display: 'grid',
            placeItems: 'center',
            borderBottom: `1px solid ${TOKENS.borderSubtle}`,
            background: TOKENS.bg,
          }}
        >
          <div style={{ width: 'min(880px, 92vw)', display: 'grid', gap: isMobile ? 14 : 18 }}>
            <div data-problem-card="1" className={styles.terminal} style={{ opacity: prefersReduced ? 1 : 0 }}>
              <div>┌─────────────────────────────────────────────────────┐</div>
              <div>│  Order #ORD-2024-4821                               │</div>
              <div>│  From: Hitech City MMTS, Hyderabad                  │</div>
              <div>│  To:   Microsoft Campus, Gachibowli                 │</div>
              <div>
                │  ETA:  <span data-problem-eta style={{ filter: 'blur(8px)' }}>24 minutes</span>                               │
              </div>
              <div>
                │  Why:  <span data-problem-why>???</span>                                          │
              </div>
              <div>└─────────────────────────────────────────────────────┘</div>

              <div data-problem-bars style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                {[
                  { k: 'Rush hour traffic', v: '+8 min' },
                  { k: 'Delivery distance', v: '+5 min' },
                  { k: 'Zone unfamiliarity', v: '+4 min' },
                  { k: 'Weather (clear)', v: '0 min' },
                ].map((row) => (
                  <div key={row.k} style={{ display: 'grid', gridTemplateColumns: '190px 80px 1fr', gap: 12, alignItems: 'center' }}>
                    <span>{row.k}</span>
                    <span>{row.v}</span>
                    <span style={{ height: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 4, overflow: 'hidden' }}>
                      <span
                        data-bar-fill
                        style={{
                          display: 'block',
                          width: 0,
                          height: '100%',
                          background: TOKENS.accent,
                          opacity: 0.65,
                        }}
                      />
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <p data-problem-copy style={{ textAlign: 'center', color: TOKENS.textSecondary, fontSize: 14 }}>
              Your current system gives you a number. It cannot tell you why.
            </p>

            <div data-problem-card="2" className={styles.terminal} style={{ opacity: 0 }}>
              <div>┌─────────────────────────────────────────────────────┐</div>
              <div>│  What would help                                    │</div>
              <div>│                                                     │</div>
              <div>│  Assigning Ravi Kumar (Hitech City expert)          │</div>
              <div>│  would save approximately 5 minutes.                │</div>
              <div>│                                                     │</div>
              <div>│  [Reassign →]                                       │</div>
              <div>└─────────────────────────────────────────────────────┘</div>
            </div>
          </div>
        </section>
      </section>

      <section id="section-architecture" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: isMobile ? (isNarrow ? '56px 12px' : '64px 16px') : '80px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div style={{ width: 'min(1100px, 96vw)' }}>
          <h2 data-reveal style={{ margin: 0, textAlign: 'center', fontSize: isMobile ? (isNarrow ? 27 : 30) : 36, letterSpacing: '-0.02em', fontWeight: 600 }}>
            Every prediction in under 100ms
          </h2>
          <p style={{ textAlign: 'center', color: TOKENS.textSecondary, fontSize: 14, marginTop: 10 }}>
            From order creation to optimized route - one seamless pipeline
          </p>

          <div style={{ position: 'relative', marginTop: 44, minHeight: 430 }}>
            <div
              style={{
                position: 'relative',
                display: 'grid',
                gridTemplateColumns: isMobile ? (isNarrow ? '1fr' : 'repeat(2, minmax(0, 1fr))') : 'repeat(4, minmax(150px, 1fr))',
                gap: 20,
                alignItems: 'center',
              }}
            >
              {[
                ['ORDER IN', 'Incoming payload'],
                ['FEATURE STORE', 'Traffic + weather vectors'],
                ['XGBOOST', 'ETA inference model'],
                ['OR-TOOLS', 'Route optimization pass'],
              ].map((node) => (
                <div
                  key={node[0]}
                  style={{
                    width: isMobile ? '100%' : 160,
                    height: 70,
                    justifySelf: 'center',
                    background: TOKENS.elevated,
                    border: `1px solid ${TOKENS.borderSubtle}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'grid',
                    alignContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{node[0]}</div>
                  <div style={{ fontSize: 11, color: TOKENS.textSecondary }}>{node[1]}</div>
                </div>
              ))}
            </div>

            <div
              style={{
                marginTop: 68,
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(150px, 1fr))',
                gap: 20,
                width: isMobile ? '100%' : '80%',
                marginLeft: isMobile ? 0 : '10%',
              }}
            >
              {[
                ['TRAFFIC API', 'Live congestion feed'],
                ['SHAP ENGINE', 'Feature attribution'],
                ['DISPATCHER', 'Actionable view'],
              ].map((node) => (
                <div
                  key={node[0]}
                  style={{
                    width: isMobile ? '100%' : 160,
                    height: 70,
                    justifySelf: 'center',
                    background: TOKENS.elevated,
                    border: `1px solid ${TOKENS.borderSubtle}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    display: 'grid',
                    alignContent: 'center',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{node[0]}</div>
                  <div style={{ fontSize: 11, color: TOKENS.textSecondary }}>{node[1]}</div>
                </div>
              ))}
            </div>

            <svg ref={architectureSvgRef} viewBox="0 0 860 420" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              {ARCH_CONNECTIONS.map((conn) => (
                <g key={conn.id}>
                  <path id={conn.id} d={conn.path} stroke={TOKENS.accent} strokeOpacity={0.4} strokeWidth={1} fill="none" />
                  <circle id={`${conn.id}-dot`} cx="0" cy="0" r="3" fill={TOKENS.accent} />
                </g>
              ))}
            </svg>
          </div>
        </div>
      </section>

      <section id="section-loop" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: isMobile ? '68px 16px' : '90px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div style={{ width: 'min(920px, 96vw)', textAlign: 'center' }}>
          <h2 data-reveal style={{ margin: 0, fontSize: isMobile ? 30 : 36, letterSpacing: '-0.02em', fontWeight: 600 }}>
            The system that gets smarter while you sleep.
          </h2>
          <p style={{ margin: '14px auto 0', maxWidth: 480, fontSize: 14, color: TOKENS.textSecondary, lineHeight: 1.65 }}>
            Every completed delivery feeds the model. Drift detection runs nightly. Better models promote automatically. Zero manual intervention.
          </p>

          <div style={{ marginTop: 34, display: 'grid', placeItems: 'center', position: 'relative' }}>
            <svg viewBox="0 0 760 430" style={{ width: 'min(760px, 96vw)', height: 'auto' }}>
              <path
                id="loop-path"
                d="M 180 215 C 180 115, 290 75, 380 75 C 470 75, 580 115, 580 215 C 580 315, 470 355, 380 355 C 290 355, 180 315, 180 215"
                stroke={TOKENS.accent}
                strokeOpacity={0.28}
                strokeWidth={2}
                fill="none"
              />
              <circle id="loop-dot" cx="180" cy="215" r="5" fill={TOKENS.accent} />
            </svg>

            <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none' }}>
              <div>
                <div ref={loopCenterCountRef} style={{ ...monoStyle, fontSize: isMobile ? 42 : 54, color: TOKENS.accent, lineHeight: 1 }}>
                  10,847
                </div>
                <div style={{ marginTop: 6, fontSize: 13, color: TOKENS.textSecondary }}>deliveries learned from</div>
              </div>
            </div>

            <div style={{ position: 'absolute', top: 54, left: '50%', transform: 'translateX(-50%)' }} ref={(el) => { loopNodeRefs.current.top = el; }}>
              <div style={{ opacity: 0.5, textAlign: 'center' }}>
                <div data-loop-label style={{ fontSize: 14, fontWeight: 500 }}>Order Completed</div>
                <div data-loop-metric style={{ ...monoStyle, marginTop: 6, fontSize: 12, color: TOKENS.accent, opacity: 0 }}>+1 training sample</div>
              </div>
            </div>
            <div style={{ position: 'absolute', right: 56, top: '50%', transform: 'translateY(-50%)' }} ref={(el) => { loopNodeRefs.current.right = el; }}>
              <div style={{ opacity: 0.5, textAlign: 'left' }}>
                <div data-loop-label style={{ fontSize: 14, fontWeight: 500 }}>Feedback Recorded</div>
                <div data-loop-metric style={{ ...monoStyle, marginTop: 6, fontSize: 12, color: TOKENS.accent, opacity: 0 }}>error_min = -1.2 min</div>
              </div>
            </div>
            <div style={{ position: 'absolute', bottom: 42, left: '50%', transform: 'translateX(-50%)' }} ref={(el) => { loopNodeRefs.current.bottom = el; }}>
              <div style={{ opacity: 0.5, textAlign: 'center' }}>
                <div data-loop-label style={{ fontSize: 14, fontWeight: 500 }}>Model Retrained</div>
                <div data-loop-metric style={{ ...monoStyle, marginTop: 6, fontSize: 12, color: TOKENS.accent, opacity: 0 }}>MAE: 8.3 -&gt; 8.1 min</div>
              </div>
            </div>
            <div style={{ position: 'absolute', left: 56, top: '50%', transform: 'translateY(-50%)' }} ref={(el) => { loopNodeRefs.current.left = el; }}>
              <div style={{ opacity: 0.5, textAlign: 'right' }}>
                <div data-loop-label style={{ fontSize: 14, fontWeight: 500 }}>Better Predictions</div>
                <div data-loop-metric style={{ ...monoStyle, marginTop: 6, fontSize: 12, color: TOKENS.accent, opacity: 0 }}>92% accuracy</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="section-metrics" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: isMobile ? '56px 16px' : '70px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div data-metric-wall style={{ width: 'min(1080px, 94vw)', opacity: prefersReduced ? 1 : 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
            {[
              [`${Math.round(liveKpis.etaAccuracy)}%`, 'ETA accuracy from live backend telemetry'],
              [`${Math.round(liveKpis.maeReduction)}%`, 'MAE reduction vs baseline'],
              [`<${Math.round(liveKpis.predictionLatencyP99)}ms`, 'Prediction latency (P99 target)'],
              [`${liveKpis.activeDrivers}`, 'Active drivers currently online'],
              [`${liveKpis.deliveredOrders}`, 'Deliveries completed today'],
              ['24/7', 'Automatic drift monitoring'],
            ].map(([num, label]) => (
              <div
                key={label}
                className={styles.metricTile}
                style={{
                  background: TOKENS.surface,
                  border: `1px solid ${TOKENS.borderSubtle}`,
                  borderRadius: 8,
                  padding: '28px 24px',
                }}
              >
                <div style={{ ...monoStyle, fontSize: isMobile ? 34 : 40, lineHeight: 1.1, color: TOKENS.accent }}>{num}</div>
                <div style={{ marginTop: 8, fontSize: 13, color: TOKENS.textSecondary }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="section-dispatch" style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: isMobile ? (isNarrow ? '56px 12px' : '64px 16px') : '90px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div style={{ width: 'min(1220px, 96vw)' }}>
          <h2 data-reveal style={{ margin: 0, textAlign: 'center', fontSize: isMobile ? (isNarrow ? 27 : 30) : 36, fontWeight: 600, letterSpacing: '-0.02em' }}>
            What a dispatcher sees.
          </h2>
          <p style={{ marginTop: 8, textAlign: 'center', fontSize: 14, color: TOKENS.textSecondary }}>Not just routes. Intelligence.</p>

          <div style={{ marginTop: 36, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? '240px 1fr' : '280px 1fr', gap: 24, alignItems: 'center' }}>
            <div style={{ position: 'relative', minHeight: 280 }}>
              <svg viewBox="0 0 300 320" style={{ width: '100%', height: '100%' }}>
                <path data-callout-path d="M 260 40 C 210 50, 170 58, 110 68" stroke={TOKENS.accent} strokeOpacity={0.5} strokeWidth={1.4} fill="none" />
                <path data-callout-path d="M 260 140 C 210 148, 165 158, 100 180" stroke={TOKENS.accent} strokeOpacity={0.5} strokeWidth={1.4} fill="none" />
                <path data-callout-path d="M 260 240 C 215 236, 165 240, 92 256" stroke={TOKENS.accent} strokeOpacity={0.5} strokeWidth={1.4} fill="none" />
              </svg>
              <div data-callout-card style={{ position: 'absolute', left: 0, top: 54, background: TOKENS.elevated, border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: TOKENS.textSecondary }}>
                Live GPS tracking - updates every 10 seconds
              </div>
              <div data-callout-card style={{ position: 'absolute', left: 0, top: 162, background: TOKENS.elevated, border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: TOKENS.textSecondary }}>
                SHAP explanation - factors visible on click
              </div>
              <div data-callout-card style={{ position: 'absolute', left: 0, top: 252, background: TOKENS.elevated, border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: 6, padding: '8px 10px', fontSize: 12, color: TOKENS.textSecondary }}>
                Confidence intervals - P10 / P50 / P90
              </div>
            </div>

            <div
              ref={frameRef}
              style={{
                position: 'relative',
                aspectRatio: '16 / 9',
                background: TOKENS.surface,
                border: `1px solid ${TOKENS.borderStrong}`,
                borderRadius: 10,
                overflow: 'hidden',
                transform: 'perspective(1200px) rotateY(-8deg) rotateX(2deg)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'radial-gradient(1200px 360px at 24% 18%, rgba(45,212,191,0.18), rgba(45,212,191,0) 52%), linear-gradient(160deg, #0B1119 0%, #0D1117 40%, #111827 100%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  inset: 18,
                  borderRadius: 8,
                  border: `1px solid ${TOKENS.borderSubtle}`,
                  overflow: 'hidden',
                }}
              >
                <div style={{ height: 34, borderBottom: `1px solid ${TOKENS.borderSubtle}`, display: 'flex', alignItems: 'center', padding: '0 12px', color: TOKENS.textTertiary, fontSize: 11 }}>
                  Dispatch Dashboard - Hyderabad Operations
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', height: 'calc(100% - 34px)' }}>
                  <div style={{ position: 'relative', borderRight: `1px solid ${TOKENS.borderSubtle}` }}>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, #0C141B 0%, #0A1118 100%)' }} />
                    <svg viewBox="0 0 640 340" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
                      <polyline points="34,58 122,96 188,80 220,142 290,162 360,124 412,178 488,196 566,168" fill="none" stroke={TOKENS.accent} strokeOpacity={0.6} strokeWidth={2} />
                      {[{ x: 122, y: 96 }, { x: 220, y: 142 }, { x: 360, y: 124 }, { x: 488, y: 196 }].map((m, i) => (
                        <circle key={`mk-${i}`} cx={m.x} cy={m.y} r={6} fill={TOKENS.accent} />
                      ))}
                    </svg>
                  </div>
                  <div style={{ padding: 12, display: 'grid', gap: 10, background: '#0F141C' }}>
                    <div style={{ border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: 6, padding: 10, fontSize: 12 }}>
                      <div style={{ color: TOKENS.textSecondary }}>ETA explanation</div>
                      <div style={{ ...monoStyle, marginTop: 6, color: TOKENS.textPrimary }}>Rush hour traffic +8</div>
                      <div style={{ ...monoStyle, marginTop: 2, color: TOKENS.textPrimary }}>Delivery distance +5</div>
                      <div style={{ ...monoStyle, marginTop: 2, color: TOKENS.textPrimary }}>Zone familiarity +4</div>
                    </div>
                    <div style={{ border: `1px solid ${TOKENS.borderSubtle}`, borderRadius: 6, padding: 10, fontSize: 12 }}>
                      <div style={{ color: TOKENS.textSecondary }}>Confidence</div>
                      <div style={{ ...monoStyle, marginTop: 6, color: TOKENS.accent }}>P10 19 / P50 24 / P90 31</div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  background:
                    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      <section id="section-profiles" style={{ minHeight: '80vh', display: 'grid', placeItems: 'center', padding: isMobile ? (isNarrow ? '56px 12px' : '62px 16px') : '80px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div style={{ width: 'min(1200px, 96vw)', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 18 }}>
          {[
            {
              title: '20 to 200 drivers',
              body:
                'Too big for spreadsheets. Too small for Oracle. IntelliLog gives you enterprise-grade dispatch intelligence at a fraction of the cost.',
            },
            {
              title: 'On-demand, all day',
              body:
                "Rush hour, rain, unfamiliar zones - the model learns your city's patterns and adjusts automatically. ETAs that get more accurate week over week.",
            },
            {
              title: 'Not just food',
              body:
                "HVAC, plumbing, pharmaceutical - any operation where 'your technician is 20 minutes away' needs to be true. Not estimated. Predicted.",
            },
          ].map((card) => (
            <motion.article
              key={card.title}
              data-profile-card
              initial={prefersReduced ? false : { opacity: 0, y: 20 }}
              whileHover={{ borderColor: TOKENS.borderStrong }}
              transition={{ duration: 0.2 }}
              style={{
                background: TOKENS.surface,
                border: `1px solid ${TOKENS.borderSubtle}`,
                borderRadius: 8,
                padding: isMobile ? 24 : 32,
              }}
              className={styles.profileCard}
            >
              <h3 style={{ margin: 0, fontSize: isMobile ? 21 : 24, fontWeight: 600, letterSpacing: '-0.01em' }}>{card.title}</h3>
              <div style={{ marginTop: 12, width: 40, height: 1, background: TOKENS.accent }} />
              <p style={{ margin: '16px 0 0', color: TOKENS.textSecondary, fontSize: isMobile ? 13.5 : 14, lineHeight: 1.7 }}>{card.body}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section id="section-cta" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: isMobile ? (isNarrow ? '56px 12px' : '64px 16px') : '90px 20px', borderBottom: `1px solid ${TOKENS.borderSubtle}` }}>
        <div style={{ textAlign: 'center', width: 'min(900px, 94vw)' }}>
          <h2 data-cta-title style={{ margin: 0, fontSize: isMobile ? (isNarrow ? 28 : 32) : 44, lineHeight: isMobile ? 1.12 : 1.08, fontWeight: 600, letterSpacing: '-0.02em' }}>
            The only platform that explains every delivery.
          </h2>
          <p data-cta-subtitle style={{ margin: '16px auto 0', maxWidth: isMobile ? 320 : 680, fontSize: isMobile ? 15 : 17, color: TOKENS.textSecondary, lineHeight: 1.6 }}>
            See how IntelliLog-AI handles your specific routes and fleet.
          </p>
          <div data-cta-button style={{ marginTop: 22 }}>
            <button className={styles.btnPrimary} onClick={() => navigate('/auth/signup')}>Request a pilot -&gt;</button>
          </div>

          <div style={{ marginTop: 38, display: 'flex', justifyContent: 'center', gap: 18, color: TOKENS.textTertiary, fontSize: 11 }}>
            {[
              { label: 'GitHub', href: 'https://github.com' },
              { label: 'Documentation', href: '#section-architecture' },
              { label: 'API Reference', href: docsUrl },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                className={styles.subtleLink}
                target={item.href.startsWith('http') ? '_blank' : undefined}
                rel={item.href.startsWith('http') ? 'noopener noreferrer' : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer style={{ padding: isMobile ? '24px 16px' : '32px 20px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: isMobile ? 11 : 12, color: TOKENS.textTertiary }}>IntelliLog-AI - Intelligent Logistics Platform</span>
          <span style={{ fontSize: isMobile ? 11 : 12, color: TOKENS.textTertiary }}>Built by Vivek Marri</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingV2;
