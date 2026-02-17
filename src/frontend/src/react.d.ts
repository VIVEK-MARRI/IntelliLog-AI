/// <reference types="@react-three/fiber" />
import type React from 'react';
import type * as THREE from 'three';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      group: {
        ref?: React.Ref<THREE.Group>;
        position?: [number, number, number] | THREE.Vector3;
        rotation?: [number, number, number] | THREE.Euler;
        scale?: [number, number, number] | number | THREE.Vector3;
        children?: React.ReactNode;
        [key: string]: any;
      };
      mesh: {
        ref?: React.Ref<THREE.Mesh>;
        position?: [number, number, number] | THREE.Vector3;
        rotation?: [number, number, number] | THREE.Euler;
        scale?: [number, number, number] | number | THREE.Vector3;
        children?: React.ReactNode;
        [key: string]: any;
      };
      points: {
        ref?: React.Ref<THREE.Points>;
        position?: [number, number, number] | THREE.Vector3;
        children?: React.ReactNode;
        [key: string]: any;
      };
      line: {
        ref?: React.Ref<THREE.Line | any>;
        position?: [number, number, number] | THREE.Vector3;
        children?: React.ReactNode;
        [key: string]: any;
      };
      bufferGeometry: {
        ref?: React.Ref<THREE.BufferGeometry>;
        attach?: string;
        [key: string]: any;
      };
      icosahedronGeometry: {
        args?: Parameters<typeof THREE.IcosahedronGeometry>;
        [key: string]: any;
      };
      bufferAttribute: {
        attach?: string;
        array?: BufferSource;
        count?: number;
        itemSize?: number;
        [key: string]: any;
      };
      meshStandardMaterial: {
        attach?: string;
        color?: THREE.ColorRepresentation;
        emissive?: THREE.ColorRepresentation;
        emissiveIntensity?: number;
        wireframe?: boolean;
        metalness?: number;
        roughness?: number;
        [key: string]: any;
      };
      lineBasicMaterial: {
        attach?: string;
        color?: THREE.ColorRepresentation;
        linewidth?: number;
        opacity?: number;
        transparent?: boolean;
        blending?: number;
        [key: string]: any;
      };
      pointsMaterial: {
        size?: number;
        color?: THREE.ColorRepresentation;
        sizeAttenuation?: boolean;
        opacity?: number;
        transparent?: boolean;
        blending?: number;
        [key: string]: any;
      };
      shaderMaterial: {
        args?: any;
        attach?: string;
        [key: string]: any;
      };
      pointLight: {
        ref?: React.Ref<THREE.PointLight>;
        position?: [number, number, number] | THREE.Vector3;
        intensity?: number;
        distance?: number;
        color?: THREE.ColorRepresentation;
        [key: string]: any;
      };
      ambientLight: {
        ref?: React.Ref<THREE.AmbientLight>;
        intensity?: number;
        color?: THREE.ColorRepresentation;
        [key: string]: any;
      };
      directionalLight: {
        ref?: React.Ref<THREE.DirectionalLight>;
        position?: [number, number, number] | THREE.Vector3;
        intensity?: number;
        color?: THREE.ColorRepresentation;
        [key: string]: any;
      };
      gridHelper: {
        args?: [size: number, divisions: number];
        position?: [number, number, number] | THREE.Vector3;
        [key: string]: any;
      };
      primitive: {
        object: any;
        attach?: string;
        [key: string]: any;
      };
      color: {
        attach?: string;
        args?: [THREE.ColorRepresentation];
        [key: string]: any;
      };
    }
  }
}
