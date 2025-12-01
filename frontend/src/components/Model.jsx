import React from 'react'
import { useGLTF } from '@react-three/drei'

/**
 * Model Component
 * 
 * Loads and displays a GLB/GLTF 3D model.
 * The model meshes are named after IFC GlobalIds when converted with --use-element-guids.
 * 
 * @param {string} url - Path to the GLB file (relative to public folder)
 * @param {object} props - Additional props passed to the primitive element
 */
function Model({ url, ...props }) {
  // useGLTF loads and caches the model
  const { scene } = useGLTF(url)

  return (
    <primitive 
      object={scene} 
      {...props}
    />
  )
}

// Preload helper - call this to start loading before component mounts
Model.preload = (url) => useGLTF.preload(url)

export default Model
