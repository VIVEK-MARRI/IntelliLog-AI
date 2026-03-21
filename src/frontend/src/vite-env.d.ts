/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_TENANT_ID: string;
  readonly VITE_ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace JSX {
  interface IntrinsicElements {
    group: any;
    mesh: any;
    points: any;
    line: any;
    bufferGeometry: any;
    icosahedronGeometry: any;
    bufferAttribute: any;
    meshStandardMaterial: any;
    lineBasicMaterial: any;
    pointsMaterial: any;
    shaderMaterial: any;
    pointLight: any;
    ambientLight: any;
    directionalLight: any;
    gridHelper: any;
    primitive: any;
    color: any;
  }
}

