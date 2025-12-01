import React, { useRef, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'

/**
 * SelectableModel Component with Visibility Support
 * 
 * Loads a GLB model, makes it selectable, and supports visibility control.
 * Registers the scene with the visibility controller.
 * 
 * @param {string} url - Path to the GLB file
 * @param {function} onSelect - Callback when a mesh is clicked
 * @param {function} onSceneReady - Callback when scene is loaded, receives scene object
 * @param {object} props - Additional props passed to the group
 */
function SelectableModel({ url, onSelect, onSceneReady, ...props }) {
  const { scene } = useGLTF(url)
  const { scene: threeScene } = useThree()
  const groupRef = useRef()

  // Notify parent when scene is ready
  useEffect(() => {
    if (scene && onSceneReady) {
      // Small delay to ensure scene is fully mounted
      const timer = setTimeout(() => {
        onSceneReady(threeScene)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [scene, threeScene, onSceneReady])

  /**
   * Handle pointer down on the model
   */
  const handlePointerDown = (event) => {
    event.stopPropagation()
    const mesh = event.object

    if (mesh && mesh.isMesh) {
      onSelect?.(mesh)
    }
  }

  return (
    <primitive
      ref={groupRef}
      object={scene}
      onPointerDown={handlePointerDown}
      {...props}
    />
  )
}

SelectableModel.preload = (url) => useGLTF.preload(url)

export default SelectableModel
