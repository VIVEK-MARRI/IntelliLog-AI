import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createNoise2D } from 'simplex-noise';
import Lottie from 'lottie-react';

gsap.registerPlugin(ScrollTrigger);

type RouteTrack = {
  curve: THREE.CatmullRomCurve3;
  vehicle: THREE.Mesh;
  light: THREE.PointLight;
  t: number;
  speed: number;
};

type FeatureCard = {
  title: string;
  body: string;
  accent: string;
  kind: 'ml' | 'shap' | 'traffic' | 'gps' | 'confidence' | 'tenant';
};

const COLOR = {
  base: '#0A0A0F',
  navy: '#0F1F3D',
  teal: '#00D4AA',
  amber: '#F59E0B',
};

const lottiePulse = {
  v: '5.7.4',
  fr: 60,
  ip: 0,
  op: 180,
  w: 160,
  h: 160,
  nm: 'Pulse',
  ddd: 0,
  assets: [],
  layers: [
    {
      ddd: 0,
      ind: 1,
      ty: 4,
      nm: 'PulseRing',
      sr: 1,
      ks: {
        o: { a: 0, k: 100 },
        r: { a: 0, k: 0 },
        p: { a: 0, k: [80, 80, 0] },
        a: { a: 0, k: [0, 0, 0] },
        s: {
          a: 1,
          k: [
            { t: 0, s: [60, 60, 100] },
            { t: 90, s: [120, 120, 100] },
            { t: 180, s: [60, 60, 100] },
          ],
        },
      },
      ao: 0,
      shapes: [
        {
          ty: 'gr',
          it: [
            { ty: 'el', p: { a: 0, k: [0, 0] }, s: { a: 0, k: [80, 80] }, nm: 'Ellipse Path 1' },
            {
              ty: 'st',
              c: { a: 0, k: [0, 0.831, 0.667, 1] },
              o: {
                a: 1,
                k: [
                  { t: 0, s: [80] },
                  { t: 90, s: [20] },
                  { t: 180, s: [80] },
                ],
              },
              w: { a: 0, k: 6 },
              lc: 2,
              lj: 2,
            },
            { ty: 'tr', p: { a: 0, k: [0, 0] }, a: { a: 0, k: [0, 0] }, s: { a: 0, k: [100, 100] }, r: { a: 0, k: 0 }, o: { a: 0, k: 100 } },
          ],
          nm: 'Ellipse 1',
        },
      ],
      ip: 0,
      op: 180,
      st: 0,
      bm: 0,
    },
  ],
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = () => setReduced(media.matches);
    listener();
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return reduced;
}

function canUseWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2', { powerPreference: 'high-performance' }) ||
      canvas.getContext('webgl', { powerPreference: 'high-performance' });
    return !!gl;
  } catch {
    return false;
  }
}

function useWebGLAvailability() {
  const [mobile, setMobile] = useState(false);
  const [webgl, setWebgl] = useState(false);

  useEffect(() => {
    const onResize = () => {
      const isMobile = window.innerWidth < 768;
      setMobile(isMobile);
      setWebgl(!isMobile && canUseWebGL());
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return { mobile, webgl };
}

const CitySceneFallback: React.FC<{ subdued?: boolean }> = ({ subdued = false }) => (
  <div
    className="absolute inset-0 overflow-hidden"
    style={{
      background: `radial-gradient(circle at 20% 20%, rgba(15,31,61,0.8), ${COLOR.base} 45%), linear-gradient(135deg, rgba(0,212,170,0.08), rgba(15,31,61,0.45))`,
      opacity: subdued ? 0.35 : 1,
    }}
  >
    <div
      className="absolute inset-0"
      style={{
        backgroundImage:
          'linear-gradient(rgba(0,212,170,0.11) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,170,0.11) 1px, transparent 1px)',
        backgroundSize: '26px 26px',
        transform: 'perspective(800px) rotateX(57deg) scale(1.35)',
        transformOrigin: 'center',
        filter: 'blur(0.4px)',
      }}
    />
    <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-transparent to-[#0A0A0F]/45" />
  </div>
);

const HeroCityScene: React.FC<{ reducedMotion: boolean; subdued?: boolean }> = ({ reducedMotion, subdued = false }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const { webgl } = useWebGLAvailability();

  useEffect(() => {
    if (!mountRef.current || !webgl) return;

    const root = mountRef.current;
    const width = root.clientWidth;
    const height = root.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setSize(width, height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLOR.base);
    scene.fog = new THREE.FogExp2(0x0a0a0f, subdued ? 0.022 : 0.015);

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 400);
    camera.position.set(30, 42, 34);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableZoom = false;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.3;

    scene.add(new THREE.AmbientLight(0x335a93, subdued ? 0.8 : 0.95));
    const keyLight = new THREE.DirectionalLight(0x6bb7ff, subdued ? 0.55 : 0.75);
    keyLight.position.set(30, 60, 20);
    scene.add(keyLight);

    const noise2D = createNoise2D();
    const gridSize = 40;
    const spacing = 1.3;
    const count = gridSize * gridSize;
    const baseHeights = new Float32Array(count);

    const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    const boxMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR.navy),
      emissive: new THREE.Color(COLOR.teal),
      emissiveIntensity: subdued ? 0.05 : 0.12,
      metalness: 0.18,
      roughness: 0.64,
      transparent: true,
      opacity: subdued ? 0.24 : 0.98,
    });

    const city = new THREE.InstancedMesh(boxGeometry, boxMaterial, count);
    const matrix = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const q = new THREE.Quaternion();

    let idx = 0;
    for (let x = 0; x < gridSize; x += 1) {
      for (let z = 0; z < gridSize; z += 1) {
        const nx = (x - gridSize / 2) * spacing;
        const nz = (z - gridSize / 2) * spacing;
        const n = noise2D(x / 8, z / 8);
        const h = THREE.MathUtils.mapLinear(n, -1, 1, 0.4, 7.5);
        baseHeights[idx] = h;
        pos.set(nx, h / 2 - 2.5, nz);
        scale.set(1, h, 1);
        matrix.compose(pos, q, scale);
        city.setMatrixAt(idx, matrix);
        idx += 1;
      }
    }
    city.instanceMatrix.needsUpdate = true;
    scene.add(city);

    const routeGroup = new THREE.Group();
    const tracks: RouteTrack[] = [];

    const buildCurve = () => {
      const sx = THREE.MathUtils.randFloatSpread(28);
      const sz = THREE.MathUtils.randFloatSpread(28);
      const ex = THREE.MathUtils.randFloatSpread(28);
      const ez = THREE.MathUtils.randFloatSpread(28);
      return new THREE.CatmullRomCurve3([
        new THREE.Vector3(sx, 0.9, sz),
        new THREE.Vector3((sx + ex) / 2 + THREE.MathUtils.randFloatSpread(8), 1.4, THREE.MathUtils.randFloatSpread(24)),
        new THREE.Vector3(ex, 1.1, ez),
      ]);
    };

    for (let i = 0; i < 8; i += 1) {
      const curve = buildCurve();
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 80, 0.08, 8, false),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(COLOR.teal),
          emissive: new THREE.Color(COLOR.teal),
          emissiveIntensity: subdued ? 0.5 : 1.1,
          roughness: 0.18,
          metalness: 0.32,
          transparent: true,
          opacity: subdued ? 0.55 : 0.95,
        })
      );
      routeGroup.add(tube);

      const vehicle = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 16),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(COLOR.teal),
          emissive: new THREE.Color(COLOR.teal),
          emissiveIntensity: subdued ? 1.1 : 1.8,
        })
      );
      const light = new THREE.PointLight(0x00d4aa, subdued ? 0.4 : 0.95, 5.5);
      routeGroup.add(vehicle);
      routeGroup.add(light);

      tracks.push({ curve, vehicle, light, t: i / 8, speed: 0.0006 + i * 0.00007 });
    }

    scene.add(routeGroup);

    const pulse = new THREE.Vector3();
    const clock = new THREE.Clock();
    let rafId = 0;

    const animate = () => {
      rafId = window.requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      if (!reducedMotion) {
        let localIdx = 0;
        for (let x = 0; x < gridSize; x += 1) {
          for (let z = 0; z < gridSize; z += 1) {
            const h = Math.max(0.22, baseHeights[localIdx] + Math.sin(elapsed + x * 0.3 + z * 0.3) * 0.16);
            pulse.set((x - gridSize / 2) * spacing, h / 2 - 2.5, (z - gridSize / 2) * spacing);
            scale.set(1, h, 1);
            matrix.compose(pulse, q, scale);
            city.setMatrixAt(localIdx, matrix);
            localIdx += 1;
          }
        }
        city.instanceMatrix.needsUpdate = true;
      }

      tracks.forEach((track, ri) => {
        if (!reducedMotion) track.t = (track.t + track.speed) % 1;
        const p = track.curve.getPoint(track.t);
        track.vehicle.position.copy(p);
        track.light.position.copy(p);
        track.light.intensity = Math.max(0.22, (0.45 + Math.sin(elapsed * 2.4 + ri) * 0.2) * (subdued ? 0.45 : 1));
      });

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    const onResize = () => {
      const w = root.clientWidth;
      const h = root.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', onResize);
    return () => {
      // Performance safeguard: release GPU and scene resources on unmount.
      window.removeEventListener('resize', onResize);
      window.cancelAnimationFrame(rafId);
      controls.dispose();
      routeGroup.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          const mat = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }
      });
      boxGeometry.dispose();
      boxMaterial.dispose();
      renderer.dispose();
      scene.clear();
      root.removeChild(renderer.domElement);
    };
  }, [reducedMotion, subdued, webgl]);

  if (!webgl) return <CitySceneFallback subdued={subdued} />;
  return <div ref={mountRef} className="absolute inset-0" />;
};

const HeroSection: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const navigate = useNavigate();
  const [showHint, setShowHint] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setShowHint(true), 2000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <section className="relative min-h-screen overflow-hidden bg-[#0A0A0F]">
      <HeroCityScene reducedMotion={reducedMotion} />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(0,212,170,0.09),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(15,31,61,0.8),transparent_45%)]" />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-6 text-center md:px-10">
        <motion.h1
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: 'easeOut' }}
          className="bg-gradient-to-r from-white via-[#93f7e2] to-[#00D4AA] bg-clip-text text-5xl font-black tracking-tight text-transparent md:text-7xl"
          style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
        >
          Every delivery. Explained.
        </motion.h1>

        <motion.p
          initial={reducedMotion ? false : { opacity: 0, y: 24 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: 'easeOut' }}
          className="mt-6 max-w-3xl text-lg text-slate-300 md:text-xl"
        >
          IntelliLog-AI predicts exactly when your deliveries arrive and tells you exactly why.
        </motion.p>

        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 20 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: 'easeOut' }}
          className="mt-10 flex flex-wrap items-center justify-center gap-4"
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="rounded-xl border border-[rgba(0,212,170,0.35)] bg-[rgba(0,212,170,0.1)] px-7 py-3 text-sm font-semibold text-[#9ef8e8] backdrop-blur-xl transition-all hover:border-[rgba(0,212,170,0.9)] hover:shadow-[0_0_40px_rgba(0,212,170,0.25)]"
          >
            See it live →
          </button>
          <button
            onClick={() => navigate('/dashboard/orders')}
            className="rounded-xl border border-[rgba(0,212,170,0.3)] bg-[rgba(15,31,61,0.4)] px-7 py-3 text-sm font-semibold text-slate-100 backdrop-blur-xl transition-all hover:border-[rgba(0,212,170,0.8)] hover:shadow-[0_0_34px_rgba(0,212,170,0.2)]"
          >
            Watch demo
          </button>
        </motion.div>
      </div>

      {showHint && (
        <motion.div
          initial={reducedMotion ? false : { opacity: 0, y: 8 }}
          animate={reducedMotion ? undefined : { opacity: 1, y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-10 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2 text-xs uppercase tracking-[0.2em] text-slate-400"
        >
          <span>Scroll to explore</span>
          <span className="text-lg text-[#00D4AA]">⌄</span>
        </motion.div>
      )}
    </section>
  );
};

const TypewriterText: React.FC<{ text: string; active: boolean; reducedMotion: boolean }> = ({ text, active, reducedMotion }) => {
  const [value, setValue] = useState(reducedMotion ? text : '');

  useEffect(() => {
    if (!active) {
      setValue(reducedMotion ? text : '');
      return;
    }
    if (reducedMotion) {
      setValue(text);
      return;
    }
    let i = 0;
    const interval = window.setInterval(() => {
      i += 1;
      setValue(text.slice(0, i));
      if (i >= text.length) window.clearInterval(interval);
    }, 24);
    return () => window.clearInterval(interval);
  }, [active, reducedMotion, text]);

  return <span>{value}</span>;
};

const ProblemSection: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(sectionRef, { amount: 0.3, once: true });
  const bars = [84, 56, 95, 74, 67, 88, 79];

  return (
    <section ref={sectionRef} className="relative bg-[#0A0A0F] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-7xl">
        <h2 className="text-center text-3xl font-bold text-white md:text-5xl">Traditional Systems Are Blind</h2>

        <div className="mt-16 grid grid-cols-1 gap-12 md:grid-cols-[1fr_auto_1fr] md:items-stretch">
          <motion.div
            initial={reducedMotion ? false : { opacity: 0, x: -100 }}
            animate={inView && !reducedMotion ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="rounded-2xl border border-red-500/20 bg-[#130f12] p-6"
          >
            <h3 className="text-xl font-semibold text-red-300">Before IntelliLog</h3>
            <div className="mt-6 h-44 rounded-xl bg-black/30 p-4">
              <svg className="h-full w-full" viewBox="0 0 300 160" preserveAspectRatio="none">
                {bars.map((bar, i) => (
                  <motion.rect
                    key={i}
                    x={10 + i * 40}
                    width="24"
                    y={reducedMotion ? 150 - bar : 150}
                    height={reducedMotion ? bar : 0}
                    rx="5"
                    fill="url(#lateGradient)"
                    animate={inView ? { y: 150 - bar, height: bar } : { y: 150, height: 0 }}
                    transition={{ duration: 0.55, delay: i * 0.07 }}
                  />
                ))}
                <defs>
                  <linearGradient id="lateGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ef4444" />
                    <stop offset="100%" stopColor="#7f1d1d" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <p className="mt-5 text-sm text-slate-300">Your ETA was 24 minutes. It took 38 minutes. Nobody knew why.</p>
          </motion.div>

          <div className="relative mx-auto hidden w-[2px] overflow-hidden rounded-full bg-slate-800 md:block">
            <motion.div
              initial={{ clipPath: 'inset(0 0 100% 0)' }}
              animate={inView ? { clipPath: 'inset(0 0 0% 0)' } : { clipPath: 'inset(0 0 100% 0)' }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D4AA] to-[#0F1F3D]"
            />
          </div>

          <motion.div
            initial={reducedMotion ? false : { opacity: 0, x: 100 }}
            animate={inView && !reducedMotion ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="flex items-center justify-center"
          >
            <div className="relative w-full max-w-sm rounded-[2.5rem] border border-[#00D4AA]/35 bg-[#0f1525] p-3 shadow-[0_0_70px_rgba(0,212,170,0.15)]">
              <div className="rounded-[2rem] border border-white/10 bg-[#0a0f1a] p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h4 className="text-lg font-semibold text-white">ETA</h4>
                  <span className="rounded-full border border-amber-300/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-300">87% confident</span>
                </div>
                <p className="text-3xl font-black text-[#00D4AA]">24 minutes</p>

                <div className="mt-5 space-y-2">
                  {['Rush hour +8 min', 'Heavy traffic +6 min', '3.2 km distance +2 min'].map((pill, i) => (
                    <motion.div
                      key={pill}
                      initial={{ opacity: 0, x: 18 }}
                      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x: 18 }}
                      transition={{ duration: 0.45, delay: 0.25 + i * 0.14 }}
                      className="rounded-full border border-[#00D4AA]/30 bg-[#00D4AA]/10 px-3 py-1.5 text-sm text-[#9ef8e8]"
                    >
                      {pill}
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
                  transition={{ duration: 0.45, delay: 0.9 }}
                  className="mt-5 rounded-xl border border-[#00D4AA]/25 bg-[#00D4AA]/8 p-3 text-sm text-slate-200"
                >
                  <span className="font-semibold text-[#00D4AA]">What would help: </span>
                  <TypewriterText
                    active={inView}
                    reducedMotion={reducedMotion}
                    text="Assigning Ravi Kumar (Hitech City expert) would save approximately 5 minutes"
                  />
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

const DataFlowSection: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const nodeLabels = ['Delivery distance', 'Time of day', 'Traffic ratio', 'Weather', 'Driver zone'];

  useEffect(() => {
    if (!wrapperRef.current || !trackRef.current || reducedMotion) return;

    const ctx = gsap.context(() => {
      gsap.to(trackRef.current, {
        xPercent: -300,
        ease: 'none',
        scrollTrigger: {
          trigger: wrapperRef.current,
          start: 'top top',
          end: '+=3200',
          pin: true,
          scrub: 1,
        },
      });
    }, wrapperRef);

    return () => ctx.revert();
  }, [reducedMotion]);

  return (
    <section className="bg-[#090b12] py-8">
      <div ref={wrapperRef} className="relative overflow-hidden">
        <div ref={trackRef} className="flex w-[400vw]">
          <div className="relative flex h-screen w-screen items-center justify-center px-6 md:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(0,212,170,0.15),transparent_40%)]" />
            <svg className="absolute inset-0 h-full w-full opacity-35" viewBox="0 0 1200 700" preserveAspectRatio="none">
              <path d="M0 540 C240 480 360 620 560 500 C770 370 940 560 1200 430" stroke="#00D4AA" strokeWidth="3" fill="none" />
              <path d="M120 160 C320 240 460 120 680 230 C880 330 970 210 1180 280" stroke="#1f8cff" strokeWidth="2" fill="none" opacity="0.5" />
            </svg>
            <motion.div
              initial={reducedMotion ? false : { scale: 0.4, opacity: 0 }}
              whileInView={reducedMotion ? {} : { scale: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6 }}
              className="relative rounded-2xl border border-[#00D4AA]/35 bg-[#0f172a]/70 px-7 py-6"
            >
              <div className="mx-auto mb-4 h-4 w-4 rounded-full bg-[#00D4AA] shadow-[0_0_24px_rgba(0,212,170,0.9)]" />
              <p className="max-w-xl text-center text-2xl font-bold text-white md:text-4xl">An order arrives. In milliseconds, the system starts working.</p>
            </motion.div>
          </div>

          <div className="relative flex h-screen w-screen items-center justify-center px-6 md:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(15,31,61,0.8),transparent_45%)]" />
            <div className="relative w-full max-w-4xl rounded-3xl border border-[#00D4AA]/20 bg-[#0a1020]/70 p-8">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                {nodeLabels.map((label, i) => (
                  <motion.div
                    key={label}
                    initial={reducedMotion ? false : { opacity: 0, y: 20 }}
                    whileInView={reducedMotion ? {} : { opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.5 }}
                    transition={{ delay: i * 0.12, duration: 0.4 }}
                    className="relative rounded-xl border border-[#00D4AA]/25 bg-[#00D4AA]/8 px-3 py-4 text-center text-sm text-[#b6fff0]"
                  >
                    {label}
                    {i < nodeLabels.length - 1 && (
                      <span className="pointer-events-none absolute -right-3 top-1/2 hidden h-[2px] w-6 -translate-y-1/2 bg-gradient-to-r from-[#00D4AA] to-transparent md:block" />
                    )}
                  </motion.div>
                ))}
              </div>
              <p className="mt-8 text-center text-xl font-semibold text-white md:text-3xl">Traffic. Weather. Driver expertise. Time of day. All considered.</p>
            </div>
          </div>

          <div className="relative flex h-screen w-screen items-center justify-center px-6 md:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_75%,rgba(0,212,170,0.09),transparent_40%)]" />
            <div className="relative w-full max-w-5xl rounded-3xl border border-[#00D4AA]/15 bg-[#0d1220]/70 p-8">
              <svg viewBox="0 0 1000 420" className="h-60 w-full">
                {[180, 500, 820].map((x) =>
                  [70, 170, 270, 360].map((y, j) => (
                    <circle key={`${x}-${y}`} cx={x} cy={y} r={j === 3 && x === 820 ? 19 : 12} fill={j === 3 && x === 820 ? '#00D4AA' : '#1e3a8a'} />
                  ))
                )}
                {[180, 500].map((x1, layer) =>
                  [70, 170, 270, 360].flatMap((y1, a) =>
                    [70, 170, 270, 360].map((y2, b) => (
                      <line
                        key={`${layer}-${a}-${b}`}
                        x1={x1}
                        y1={y1}
                        x2={x1 + 320}
                        y2={y2}
                        stroke="#00D4AA"
                        strokeWidth="1.2"
                        strokeDasharray="9 9"
                        className="flow-line"
                        opacity="0.6"
                      />
                    ))
                  )
                )}
              </svg>
              <div className="mt-4 text-center">
                <p className="text-2xl font-semibold text-white">The model has learned from 10,000 real deliveries. It knows this route.</p>
                <p className="mt-3 text-lg font-bold text-[#00D4AA]">28 minutes — 87% confident</p>
              </div>
            </div>
          </div>

          <div className="relative flex h-screen w-screen items-center justify-center px-6 md:px-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(0,212,170,0.1),transparent_45%)]" />
            <div className="w-full max-w-5xl rounded-3xl border border-[#00D4AA]/25 bg-[#0d1426]/80 p-8">
              <svg viewBox="0 0 1000 430" className="h-60 w-full">
                <path d="M120 260 C280 120, 460 340, 860 190" stroke="#ef4444" strokeWidth="9" fill="none" opacity="0.75" />
                <path d="M120 300 C280 240, 520 150, 860 220" stroke="#00D4AA" strokeWidth="10" fill="none" />
                <circle cx="120" cy="300" r="9" fill="#fff" />
                <circle cx="860" cy="220" r="9" fill="#fff" />
              </svg>
              <p className="mt-2 text-2xl font-semibold text-white">Routes built on prediction, not assumption.</p>
              <p className="mt-3 text-sm text-slate-300">Static routing chose A. ML-informed routing chose B. Saved 9 minutes.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

const stats = [
  { value: 92, suffix: '%', label1: 'ETA accuracy', label2: 'within 5 min' },
  { value: 29, suffix: '%', label1: 'MAE reduction', label2: 'peak hours' },
  { value: 100, suffix: 'ms', label1: 'Prediction time', label2: '' },
  { value: 100, suffix: '%', label1: 'Self-improving', label2: 'with every delivery' },
  { value: 0, suffix: '', label1: 'Manual model', label2: 'updates needed' },
  { value: 61, suffix: '', label1: 'Tests passing', label2: '' },
];

const StatCounterCard: React.FC<{ target: number; suffix: string; label1: string; label2: string; run: boolean; reducedMotion: boolean }> = ({
  target,
  suffix,
  label1,
  label2,
  run,
  reducedMotion,
}) => {
  const [display, setDisplay] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!run) return;
    if (reducedMotion) {
      setDisplay(target);
      setDone(true);
      return;
    }
    setDone(false);
    const duration = 1300;
    const started = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased));
      if (progress < 1) raf = window.requestAnimationFrame(tick);
      else setDone(true);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [run, target, reducedMotion]);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d1425] p-6">
      <p className="text-4xl font-black text-[#00D4AA] md:text-5xl">{display}{suffix}</p>
      <p className="mt-3 text-sm text-slate-300">{label1}</p>
      {label2 ? <p className="text-sm text-slate-400">{label2}</p> : <p className="text-sm text-transparent">.</p>}
      <motion.div
        initial={{ scaleX: 0 }}
        animate={run ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="mt-4 h-[2px] origin-left bg-gradient-to-r from-[#00D4AA] to-transparent"
      />
      <motion.div
        initial={{ opacity: 0 }}
        animate={done ? { opacity: [0, 0.5, 0] } : { opacity: 0 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
        className="pointer-events-none absolute"
      />
    </div>
  );
};

const LiveNumbersSection: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const inView = useInView(ref, { amount: 0.35, once: true });

  return (
    <section ref={ref} className="bg-[#090d16] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-6xl">
        <h3 className="text-center text-3xl font-bold text-white md:text-5xl">Live Numbers</h3>
        <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-3">
          {stats.map((item) => (
            <StatCounterCard
              key={`${item.label1}-${item.value}`}
              target={item.value}
              suffix={item.suffix}
              label1={item.label1}
              label2={item.label2}
              run={inView}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

const MiniTrafficCanvas: React.FC = () => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { mobile, webgl } = useWebGLAvailability();

  useEffect(() => {
    if (!ref.current || !webgl || mobile) return;

    const root = ref.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(root.clientWidth, root.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    root.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, root.clientWidth / root.clientHeight, 0.1, 100);
    camera.position.set(8, 10, 9);
    scene.add(new THREE.GridHelper(16, 16, 0x00d4aa, 0x1f4a75));

    const lineGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-6, 0.05, -6),
      new THREE.Vector3(-1, 0.05, 1),
      new THREE.Vector3(6, 0.05, 4),
    ]);
    const line = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0x00d4aa, linewidth: 2 }));
    scene.add(line);

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 14), new THREE.MeshBasicMaterial({ color: 0x00d4aa }));
    scene.add(dot);

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-6, 0.05, -6),
      new THREE.Vector3(-1, 0.05, 1),
      new THREE.Vector3(6, 0.05, 4),
    ]);

    const clock = new THREE.Clock();
    let raf = 0;
    const animate = () => {
      raf = window.requestAnimationFrame(animate);
      dot.position.copy(curve.getPoint((clock.getElapsedTime() * 0.17) % 1));
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      renderer.setSize(root.clientWidth, root.clientHeight);
      camera.aspect = root.clientWidth / root.clientHeight;
      camera.updateProjectionMatrix();
    };

    window.addEventListener('resize', onResize);
    return () => {
      // Performance safeguard: dispose geometry/material/renderer and clear scene.
      window.removeEventListener('resize', onResize);
      window.cancelAnimationFrame(raf);
      lineGeometry.dispose();
      (line.material as THREE.Material).dispose();
      (dot.geometry as THREE.BufferGeometry).dispose();
      (dot.material as THREE.Material).dispose();
      renderer.dispose();
      scene.clear();
      root.removeChild(renderer.domElement);
    };
  }, [mobile, webgl]);

  if (mobile || !webgl) {
    return (
      <div className="h-36 rounded-xl border border-[#00D4AA]/20 bg-[linear-gradient(145deg,#0c1324,#0a0f1a)]">
        <div className="h-full w-full bg-[linear-gradient(rgba(0,212,170,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(0,212,170,0.1)_1px,transparent_1px)] bg-[size:14px_14px]" />
      </div>
    );
  }

  return <div ref={ref} className="h-36 rounded-xl" />;
};

const FeatureCardDeck: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const cards: FeatureCard[] = useMemo(
    () => [
      {
        title: 'Learns From Every Delivery',
        body: 'Each completed delivery feeds the model. It retrains nightly. Detects drift. Promotes better versions automatically.',
        accent: 'from-[#0F1F3D] to-[#00D4AA]',
        kind: 'ml',
      },
      {
        title: 'Every ETA Explained',
        body: 'Dispatchers see exactly why. Traffic. Zone unfamiliarity. Package weight. Not a black box, a reason.',
        accent: 'from-[#111827] to-[#0F1F3D]',
        kind: 'shap',
      },
      {
        title: 'Routes Built on Reality',
        body: 'Google Maps and HERE Traffic feed real conditions into OR-Tools. The same 5km route takes 15 min at 10 AM, 25 min at 5 PM.',
        accent: 'from-[#091425] to-[#0F1F3D]',
        kind: 'traffic',
      },
      {
        title: 'Live Fleet Intelligence',
        body: 'Every driver tracked. Deviations detected at 400m. Re-routing triggered automatically. Dashboard updates via WebSocket.',
        accent: 'from-[#0f172a] to-[#10233f]',
        kind: 'gps',
      },
      {
        title: 'Not Just a Number, A Range',
        body: 'P10: 20 min. P50: 28 min. P90: 36 min. Calibrated probabilities tell you exactly how certain the system is.',
        accent: 'from-[#0e1628] to-[#11244a]',
        kind: 'confidence',
      },
      {
        title: 'Built for Many, Isolated for Each',
        body: 'Complete data isolation per tenant. JWT-secured. Rate-limited. One platform powering multiple logistics operations.',
        accent: 'from-[#0b1020] to-[#0f1f3d]',
        kind: 'tenant',
      },
    ],
    []
  );

  const [active, setActive] = useState(0);
  const wrapIndex = useCallback(
    (value: number) => {
      if (value < 0) return cards.length - 1;
      if (value >= cards.length) return 0;
      return value;
    },
    [cards.length]
  );

  return (
    <section className="bg-[#080b14] px-6 py-24 md:px-10">
      <div className="mx-auto max-w-6xl">
        <h3 className="text-center text-3xl font-bold text-white md:text-5xl">Feature Showcase</h3>

        <div className="mt-12 flex items-center justify-center gap-4">
          <button onClick={() => setActive((p) => wrapIndex(p - 1))} className="rounded-full border border-[#00D4AA]/35 px-4 py-2 text-[#9ef8e8] transition hover:bg-[#00D4AA]/10">←</button>
          <button onClick={() => setActive((p) => wrapIndex(p + 1))} className="rounded-full border border-[#00D4AA]/35 px-4 py-2 text-[#9ef8e8] transition hover:bg-[#00D4AA]/10">→</button>
        </div>

        <motion.div
          drag={reducedMotion ? false : 'x'}
          dragElastic={0.1}
          onDragEnd={(_, info) => {
            if (info.offset.x > 60) setActive((p) => wrapIndex(p - 1));
            if (info.offset.x < -60) setActive((p) => wrapIndex(p + 1));
          }}
          className="relative mt-10 h-[500px] perspective-[1500px]"
        >
          {cards.map((card, idx) => {
            const distance = Math.max(-2, Math.min(2, idx - active));
            const abs = Math.abs(distance);

            return (
              <motion.article
                key={card.title}
                onClick={() => setActive(idx)}
                animate={{ opacity: abs === 0 ? 1 : abs === 1 ? 0.6 : 0.3, x: distance * 180, rotateY: distance * 25, z: -abs * 100, scale: abs === 0 ? 1 : 0.9 }}
                transition={{ duration: reducedMotion ? 0 : 0.5, ease: 'easeOut' }}
                className={`absolute left-1/2 top-0 h-full w-[min(90vw,530px)] -translate-x-1/2 cursor-pointer rounded-3xl border border-white/10 bg-gradient-to-br ${card.accent} p-6 shadow-[0_20px_70px_rgba(0,0,0,0.4)]`}
                style={{ zIndex: 50 - abs }}
              >
                <div className="h-full rounded-2xl border border-white/10 bg-[#0a0f1b]/80 p-6">
                  <div className="mb-5 h-36 rounded-xl border border-[#00D4AA]/20 bg-[#0c1428] p-3">
                    {card.kind === 'ml' && (
                      <div className="relative h-full">
                        <Lottie animationData={lottiePulse as unknown as object} loop autoplay className="h-full w-full" />
                        <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold uppercase tracking-wider text-[#9ef8e8]">Nightly retrain</div>
                      </div>
                    )}
                    {card.kind === 'shap' && (
                      <svg viewBox="0 0 320 130" className="h-full w-full">
                        {[40, 76, 112, 148, 184].map((x, i) => (
                          <motion.rect
                            key={x}
                            x={x}
                            y={90 - i * 8}
                            width="20"
                            height={35 + i * 10}
                            fill="#00D4AA"
                            initial={{ height: 0, y: 120 }}
                            whileInView={{ height: 35 + i * 10, y: 90 - i * 8 }}
                            viewport={{ once: true }}
                            transition={{ delay: i * 0.08 }}
                            rx="3"
                          />
                        ))}
                      </svg>
                    )}
                    {card.kind === 'traffic' && <MiniTrafficCanvas />}
                    {card.kind === 'gps' && <div className="h-full rounded-xl bg-[conic-gradient(from_0deg,rgba(0,212,170,0.05),rgba(0,212,170,0.9),rgba(0,212,170,0.05))] [mask-image:radial-gradient(circle,transparent_30%,black_32%)] animate-spin-slow" />}
                    {card.kind === 'confidence' && (
                      <svg viewBox="0 0 300 120" className="h-full w-full">
                        <path d="M0 70 Q50 20 100 60 T200 55 T300 62" className="confidence-wave" stroke="#00D4AA" strokeWidth="3" fill="none" />
                      </svg>
                    )}
                    {card.kind === 'tenant' && (
                      <svg viewBox="0 0 320 130" className="h-full w-full opacity-80">
                        {Array.from({ length: 6 }).map((_, row) =>
                          Array.from({ length: 8 }).map((__, col) => (
                            <polygon
                              key={`${row}-${col}`}
                              points={`${18 + col * 38},${14 + row * 20} ${28 + col * 38},${20 + row * 20} ${28 + col * 38},${32 + row * 20} ${18 + col * 38},${38 + row * 20} ${8 + col * 38},${32 + row * 20} ${8 + col * 38},${20 + row * 20}`}
                              stroke="rgba(0,212,170,0.4)"
                              fill="transparent"
                            />
                          ))
                        )}
                      </svg>
                    )}
                  </div>
                  <h4 className="text-2xl font-bold text-white">{card.title}</h4>
                  <p className="mt-4 text-sm leading-relaxed text-slate-300">{card.body}</p>
                </div>
              </motion.article>
            );
          })}
        </motion.div>

        <div className="mt-8 flex justify-center gap-2">
          {cards.map((_, i) => (
            <button key={i} onClick={() => setActive(i)} className={`h-2.5 rounded-full transition-all ${i === active ? 'w-8 bg-[#00D4AA]' : 'w-2.5 bg-slate-600'}`} />
          ))}
        </div>
      </div>
    </section>
  );
};

const TestimonialSection: React.FC = () => (
  <section className="bg-[#0a0f1a] px-6 py-24 md:px-10">
    <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[inset_0_0_0_1px_rgba(0,212,170,0.08)]">
        <p className="text-4xl text-[#00D4AA]">“</p>
        <p className="mt-2 text-lg text-slate-200">I showed my dispatcher the SHAP explanation for a late delivery. He pointed at the screen and said yes, that road is always like that at 5 PM. That was the moment.</p>
        <p className="mt-5 text-sm font-semibold text-slate-400">— Vivek M., IntelliLog-AI</p>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl shadow-[inset_0_0_0_1px_rgba(0,212,170,0.08)]">
        <p className="text-4xl text-[#00D4AA]">“</p>
        <p className="mt-2 text-lg text-slate-200">The system detected model drift before our accuracy dropped. Triggered retraining automatically. We did not have to touch it.</p>
        <p className="mt-5 text-sm font-semibold text-slate-400">— ML Pipeline, automated</p>
      </div>
    </div>
  </section>
);

const FooterCTA: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => (
  <footer className="relative overflow-hidden bg-[#0A0A0F] px-6 py-20 md:px-10">
    <HeroCityScene reducedMotion={reducedMotion} subdued />
    <div className="pointer-events-none absolute inset-0 bg-[#0A0A0F]/70" />
    <div className="relative z-10 mx-auto max-w-6xl text-center">
      <h3 className="text-3xl font-bold text-white md:text-5xl">Your city is a living system. Your deliveries should be too.</h3>
      <button className="mt-8 rounded-xl border border-[#00D4AA]/40 bg-[#00D4AA]/10 px-8 py-3 font-semibold text-[#9ef8e8] backdrop-blur-xl transition-all hover:border-[#00D4AA] hover:shadow-[0_0_36px_rgba(0,212,170,0.25)]">Request a Pilot →</button>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-slate-300">
        <a href="#" className="hover:text-[#00D4AA]">GitHub</a>
        <a href="#" className="hover:text-[#00D4AA]">Documentation</a>
        <a href="#" className="hover:text-[#00D4AA]">API Reference</a>
        <a href="#" className="hover:text-[#00D4AA]">Contact</a>
      </div>
    </div>
  </footer>
);

export const LandingPage: React.FC = () => {
  const reducedMotion = useReducedMotion();
  const navigate = useNavigate();

  return (
    <main className="min-h-screen bg-[#0A0A0F] text-white" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{`
        @keyframes dashFlow {
          from { stroke-dashoffset: 220; }
          to { stroke-dashoffset: 0; }
        }
        @keyframes confidenceWave {
          0% { stroke-dashoffset: 160; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes spinSlow {
          to { transform: rotate(360deg); }
        }
        .flow-line { stroke-dasharray: 10 12; animation: dashFlow 2.4s linear infinite; }
        .confidence-wave { stroke-dasharray: 160; animation: confidenceWave 2s linear infinite; }
        .animate-spin-slow { animation: spinSlow 5s linear infinite; }
      `}</style>

      <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/5 bg-[#0A0A0F]/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6 md:px-10">
          <button onClick={() => navigate('/')} className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-[#00D4AA] to-[#0F1F3D]" />
            <span className="text-sm font-semibold tracking-[0.2em] text-slate-100">INTELLILOG-AI</span>
          </button>
          <button onClick={() => navigate('/auth/login')} className="rounded-lg border border-[#00D4AA]/40 px-4 py-2 text-sm font-semibold text-[#9ef8e8] transition hover:bg-[#00D4AA]/10">Sign In</button>
        </div>
      </header>

      <div className="pt-16">
        <HeroSection reducedMotion={reducedMotion} />
        <ProblemSection reducedMotion={reducedMotion} />
        <DataFlowSection reducedMotion={reducedMotion} />
        <LiveNumbersSection reducedMotion={reducedMotion} />
        <FeatureCardDeck reducedMotion={reducedMotion} />
        <TestimonialSection />
        <FooterCTA reducedMotion={reducedMotion} />
      </div>
    </main>
  );
};

export default LandingPage;
