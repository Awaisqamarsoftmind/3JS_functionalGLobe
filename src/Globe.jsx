import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import * as d3 from "d3-geo";
// import worldGeoJSON from "./world-110m.geo.json"; // Download from https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson




function DotGlobe({ autoRotate }) {
    const groupRef = useRef();
    const { camera } = useThree();
    const [cameraDistance, setCameraDistance] = useState(4);
    const [landMask, setLandMask] = useState(null);
    const radius = 1.5;
  
    useEffect(() => {
      fetch("/land-mask.json")
        .then((res) => res.json())
        .then(setLandMask);
    }, []);
  
    const texture = useMemo(() => new THREE.TextureLoader().load("/bg.png"), []);
  
    useFrame(() => {
      if (autoRotate && groupRef.current) {
        groupRef.current.rotation.y += 0.0015;
      }
      setCameraDistance(camera.position?.length());
    });
  
    const { landGeometry, waterGeometry } = useMemo(() => {
      if (!landMask) return {};
  
      const landDots = [];
      const waterDots = [];
  
      const zoomThreshold = 2.0;
      const zoomedIn = cameraDistance < zoomThreshold;
      const zoomLevel = cameraDistance < 2.0
      ? "close"
      : cameraDistance < 2.5
      ? "medium"
      : "far";
const latSteps =
  zoomLevel === "close" ? 600 : zoomLevel === "medium" ? 180 : 90;

const lonSteps =
  zoomLevel === "close" ? 600 : zoomLevel === "medium" ? 240 : 180;
  
      for (let i = 0; i <= latSteps; i++) {
        const lat = (i / latSteps) * 180 - 90;
        for (let j = 0; j <= lonSteps; j++) {
          const lon = (j / lonSteps) * 360 - 180;
  
          const latIndex = Math.floor(((lat + 90) / 180) * landMask?.length);
          const lonIndex = Math.floor(((lon + 180) / 360) * landMask?.[0]?.length);
          const isLand = landMask?.[latIndex]?.[lonIndex] === 1;
  
          const latRad = THREE.MathUtils.degToRad(90 - lat);
          const lonRad = THREE.MathUtils.degToRad(lon);
  
          const x = radius * Math.sin(latRad) * Math.cos(lonRad);
          const y = radius * Math.cos(latRad);
          const z = radius * Math.sin(latRad) * Math.sin(lonRad);
  
          const point = [x, y, z];
  
          // optional custom zone coloring if needed
          // let color = "#D927C2";
          // if (zoomedIn && lat > 25 && lat < 27 && lon > -81 && lon < -79) color = "green";
  
          if (isLand) landDots.push(...point);
          else waterDots.push(...point);
        }
      }
  
      const landGeometry = new THREE.BufferGeometry();
      landGeometry.setAttribute("position", new THREE.Float32BufferAttribute(landDots, 3));
  
      const waterGeometry = new THREE.BufferGeometry();
      waterGeometry.setAttribute("position", new THREE.Float32BufferAttribute(waterDots, 3));
  
      return { landGeometry, waterGeometry };
    }, [landMask, cameraDistance]);
    
    const vertexShader = `
    uniform float uScale;
    void main() {
        gl_PointSize = SIZE;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
        `;
        
        const fragmentShader = `
        void main() {
            float r = length(gl_PointCoord - vec2(0.5));
            if (r > 0.5) discard;
            gl_FragColor = vec4(COLOR, 1.0);
            }
            `;
            
            const zoomedIn = cameraDistance < 2.5;
            const zoomLevel = cameraDistance < 2.0
            ? "close"
            : cameraDistance < 2.5
            ? "medium"
            : "far";
            console.log("🚀 ~ DotGlobe ~ zoomLevel:", {zoomLevel, cameraDistance})

            const landSize =
  zoomLevel === "close" ? "3.25" : zoomLevel === "medium" ? '4.25' : '4.25';

const waterSize =
  zoomLevel === "close" ? "1.0" : zoomLevel === "medium" ? "1.0" : "1.0";
  
    const landMaterial = useMemo(
        () =>
          new THREE.ShaderMaterial({
            vertexShader: vertexShader.replace("SIZE", landSize),
            fragmentShader: fragmentShader.replace("COLOR", "0.85, 0.16, 0.76"),
            transparent: true,
            depthWrite: false,
          }),
        [cameraDistance]
      );
  
    const waterMaterial = useMemo(
      () =>
        new THREE.ShaderMaterial({
          vertexShader: vertexShader.replace("SIZE", waterSize),
          fragmentShader: fragmentShader.replace("COLOR", "0.43, 0.81, 0.96"),
          uniforms: { uScale: { value: cameraDistance } },
          transparent: true,
          depthWrite: false,
        }),
      [cameraDistance]
    );
  
    if (!landMask) {
      return (
        <Html center>
          <div style={{ color: "white", fontSize: "1.5rem" }}>🌍 Loading Globe...</div>
        </Html>
      );
    }
  
    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[radius, 64, 64]} />
          <meshStandardMaterial map={texture} />
        </mesh>
  
        <points geometry={landGeometry} material={landMaterial} />
        <points geometry={waterGeometry} material={waterMaterial} />
      </group>
    );
  }

  

function GlobeControls({ autoRotate, setAutoRotate, resetZoom }) {
  return (
    <div style={{ position: "absolute", top: 20, left: 20, color: "white", zIndex: 10 }}>
      <button onClick={() => setAutoRotate(!autoRotate)} style={{ marginRight: 10 }}>
        {autoRotate ? "Pause Rotation" : "Auto-Rotate"}
      </button>
      <button onClick={resetZoom}>Reset Zoom</button>
    </div>
  );
}

export default function GlobeScene() {
  const [autoRotate, setAutoRotate] = useState(true);
  const orbitRef = useRef();

  const resetZoom = () => {
    if (orbitRef.current) {
      orbitRef.current.reset();
    }
  };

  return (
    <div style={{ height: "100vh", width: "100vw", background: "#0d001c" }}>
      <Canvas camera={{ position: [0, 0, 4] }}>
        <ambientLight color={'#140F30'} intensity={0.3} />
        <pointLight  position={[5, 5, 5]} color={'#140F30'} intensity={1.2} />
        <DotGlobe  autoRotate={autoRotate} />
        <OrbitControls
  ref={orbitRef}
  enableZoom
  enablePan={false}
  zoomSpeed={0.6}
  rotateSpeed={0.5}
  minDistance={1.6}
  maxDistance={10}
  minPolarAngle={0}
  maxPolarAngle={Math.PI}  
/>

      </Canvas>
      <GlobeControls autoRotate={autoRotate} setAutoRotate={setAutoRotate} resetZoom={resetZoom} />
    </div>
  );
}
