import React, { Suspense, useRef, useEffect } from 'react'
import { Canvas, useThree } from '@react-three/fiber'
import { OrbitControls, Environment } from '@react-three/drei'

/**
 * RendererSetup Component
 * 
 * Internal component to configure the WebGL renderer and expose refs.
 * Must be inside Canvas to access useThree.
 */
function RendererSetup({ onRendererReady, onControlsReady }) {
  const { gl, camera } = useThree()
  const controlsRef = useRef()

  // Enable local clipping on renderer
  useEffect(() => {
    if (gl) {
      gl.localClippingEnabled = true
      console.log('Renderer local clipping enabled')
      onRendererReady?.(gl, camera)
    }
  }, [gl, camera, onRendererReady])

  return (
    <OrbitControls 
      ref={(controls) => {
        controlsRef.current = controls
        if (controls) {
          onControlsReady?.(controls)
        }
      }}
      enableDamping
      dampingFactor={0.05}
      minDistance={1}
      maxDistance={500}
      makeDefault
    />
  )
}

/**
 * Viewer Component
 * 
 * Sets up the 3D canvas with lighting and camera controls.
 * Wraps children in Suspense for async model loading.
 * 
 * @param {React.ReactNode} children - 3D content to render (e.g., Model component)
 * @param {function} onMissed - Callback when user clicks empty space (no object hit)
 * @param {function} onRendererReady - Callback when renderer is ready, receives (gl, camera)
 * @param {function} onControlsReady - Callback when orbit controls are ready
 */
function Viewer({ children, onMissed, onRendererReady, onControlsReady }) {
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
        far: 1000,
        up: [0, 0, 1]  // Z-up for BIM/architectural models
      }}
      style={{ 
        width: '100%', 
        height: '100%',
        background: 'linear-gradient(180deg, #f0f0f2 0%, #e8e8ed 100%)'
      }}
      onPointerMissed={handlePointerMissed}
      gl={{ 
        localClippingEnabled: true,
        logarithmicDepthBuffer: true
      }}
    >
      {/* Renderer setup and controls */}
      <RendererSetup 
        onRendererReady={onRendererReady}
        onControlsReady={onControlsReady}
      />

      {/* Ambient light for overall scene illumination */}
      <ambientLight intensity={0.6} />
      
      {/* Main directional light */}
      <directionalLight 
        position={[10, 20, 10]} 
        intensity={0.8} 
        castShadow
        shadow-mapSize={[2048, 2048]}
      />
      
      {/* Secondary directional light from opposite side */}
      <directionalLight 
        position={[-10, 10, -10]} 
        intensity={0.4} 
      />

      {/* Fill light from below */}
      <directionalLight 
        position={[0, -10, 0]} 
        intensity={0.2} 
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
      <meshStandardMaterial color="#d1d1d6" wireframe />
    </mesh>
  )
}

export default Viewer
