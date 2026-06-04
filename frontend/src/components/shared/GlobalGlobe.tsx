'use client'

import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Sphere } from '@react-three/drei'
import * as THREE from 'three'

function latLngToPosition(lat: number, lng: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180)
  const theta = (lng + 180) * (Math.PI / 180)
  const x = -radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.cos(phi)
  const z = radius * Math.sin(phi) * Math.sin(theta)
  return [x, y, z]
}

const cities = [
  { name: 'NYC', lat: 40.7128, lng: -74.006 },
  { name: 'London', lat: 51.5074, lng: -0.1278 },
  { name: 'Tokyo', lat: 35.6762, lng: 139.6503 },
  { name: 'Singapore', lat: 1.3521, lng: 103.8198 },
  { name: 'Dubai', lat: 25.2048, lng: 55.2708 },
  { name: 'Sydney', lat: -33.8688, lng: 151.2093 },
  { name: 'Sao Paulo', lat: -23.5505, lng: -46.6333 },
]

const routes = [
  [0, 1], [0, 2], [0, 6],
  [1, 3], [1, 4],
  [2, 3], [2, 5],
  [3, 4], [3, 5],
  [4, 6],
]

function GlobeSphere() {
  const groupRef = useRef<THREE.Group>(null)

  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(
      'https://unpkg.com/three-globe@2.24.13/example/img/earth-blue-marble.jpg',
    )
    return t
  }, [])

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.08
    }
  })

  return (
    <group ref={groupRef}>
      <Sphere args={[2, 64, 64]}>
        <meshPhongMaterial
          map={texture}
          transparent
          opacity={0.95}
          specular={new THREE.Color(0x333333)}
          shininess={5}
        />
      </Sphere>
    </group>
  )
}

function Atmosphere() {
  return (
    <Sphere args={[2.08, 64, 64]}>
      <meshPhongMaterial
        color="#3B82F6"
        transparent
        opacity={0.08}
        side={THREE.BackSide}
      />
    </Sphere>
  )
}

function CityMarkers() {
  return (
    <group>
      {cities.map((city, i) => {
        const pos = latLngToPosition(city.lat, city.lng, 2.05)
        return (
          <mesh key={i} position={pos}>
            <sphereGeometry args={[0.04, 16, 16]} />
            <meshBasicMaterial color="#3B82F6" />
            <pointLight color="#3B82F6" intensity={0.5} distance={0.3} />
          </mesh>
        )
      })}
    </group>
  )
}

function ArcLine({ from, to }: { from: [number, number, number]; to: [number, number, number] }) {
  const mid = useMemo(() => {
    const a = new THREE.Vector3(...from)
    const b = new THREE.Vector3(...to)
    const c = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5)
    const dist = a.distanceTo(b)
    c.normalize().multiplyScalar(2 + dist * 0.15)
    return c
  }, [from, to])

  const curve = useMemo(() => {
    return new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(...from),
      mid,
      new THREE.Vector3(...to),
    )
  }, [from, mid, to])

  const points = useMemo(() => curve.getPoints(50), [curve])

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points)
    return geo
  }, [points])

  const line = useMemo(() => new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({ color: '#3B82F6', transparent: true, opacity: 0.15 })
  ), [geometry])

  return <primitive object={line} />
}

function Arcs() {
  return (
    <group>
      {routes.map(([i, j], k) => {
        const from = latLngToPosition(cities[i].lat, cities[i].lng, 2)
        const to = latLngToPosition(cities[j].lat, cities[j].lng, 2)
        return <ArcLine key={k} from={from} to={to} />
      })}
    </group>
  )
}

function Particles() {
  const count = 80
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.15 + Math.random() * 0.3
      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.cos(phi)
      pos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    return pos
  }, [count])

  const ref = useRef<THREE.Points>(null)

  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.03
    }
  })

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.01}
        color="#60A5FA"
        transparent
        opacity={0.4}
        sizeAttenuation
      />
    </points>
  )
}

function Stars() {
  const count = 1000
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count * 3; i++) {
      pos[i] = (Math.random() - 0.5) * 100
    }
    return pos
  }, [count])

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial size={0.05} color="#5A6B8A" sizeAttenuation transparent opacity={0.6} />
    </points>
  )
}

function Scene() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 3, 5]} intensity={0.6} />
      <directionalLight position={[-5, -1, -5]} intensity={0.2} />
      <GlobeSphere />
      <Atmosphere />
      <CityMarkers />
      <Arcs />
      <Particles />
      <Stars />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        rotateSpeed={0.3}
        maxPolarAngle={Math.PI / 2}
        minPolarAngle={Math.PI / 2}
      />
    </>
  )
}

export default function GlobalGlobe() {
  return (
    <div className="w-full h-full">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene />
      </Canvas>
    </div>
  )
}
