import React, { useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { ThreeEvent } from '@react-three/fiber'

/**
 * SelectableModel Component
 * 
 * Loads a GLB model and makes it selectable.
 * Handles click events on meshes and reports them to the parent.
 * 
 * @param {string} url - Path to the GLB file
 * @param {function} onSelect - Callback when a mesh is clicked, receives the mesh object
 * @param {object} props - Additional props passed to the group
 */
function SelectableModel({ url, onSelect, ...props }) {
  const { scene } = useGLTF(url)
  const groupRef = useRef()

  /**
   * Handle pointer down on the model
   * Finds the clicked mesh and calls onSelect
   */
  const handlePointerDown = (event) => {
    // Stop propagation to prevent canvas click handler
    event.stopPropagation()

    // Get the intersected object (the actual mesh that was clicked)
    const mesh = event.object

    if (mesh && mesh.isMesh) {
      // Call the selection handler with the clicked mesh
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
