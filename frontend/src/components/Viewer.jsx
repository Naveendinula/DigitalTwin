import React, { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'

/**
 * Viewer Component
 * 
 * Sets up the 3D canvas with lighting and camera controls.
 * Wraps children in Suspense for async model loading.
 * 
 * @param {React.ReactNode} children - 3D content to render (e.g., Model component)
 * @param {function} onMissed - Callback when user clicks empty space (no object hit)
 */
function Viewer({ children, onMissed }) {
  /**
   * Handle clicks that miss all objects (empty space)
   */
  const handlePointerMissed = () => {
    onMissed?.()
  }

  return (
    <Canvas
      camera={{ 
        position: [10, 10, 10], 
        fov: 50,
        near: 0.1,
        far: 1000
      }}
      style={{ 
        width: '100%', 
        height: '100%',
        background: '#1a1a2e'
      }}
      onPointerMissed={handlePointerMissed}
    >
      {/* Ambient light for overall scene illumination */}
      <ambientLight intensity={0.5} />
      
      {/* Directional light for shadows and depth */}
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={1} 
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      
      {/* Secondary directional light from opposite side */}
      <directionalLight 
        position={[-10, 10, -10]} 
        intensity={0.3} 
      />

      {/* Orbit controls for rotate, pan, and zoom */}
      <OrbitControls 
        enableDamping
        dampingFactor={0.05}
        minDistance={1}
        maxDistance={500}
        makeDefault
      />

      {/* Suspense boundary for async loading */}
      <Suspense fallback={<LoadingIndicator />}>
        {children}
      </Suspense>
    </Canvas>
  )
}

/**
 * Simple loading indicator shown while model loads
 */
function LoadingIndicator() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="hotpink" wireframe />
    </mesh>
  )
}

export default Viewer
