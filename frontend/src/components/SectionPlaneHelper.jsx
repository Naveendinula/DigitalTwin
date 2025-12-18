import React, { useRef, useLayoutEffect } from 'react'
import * as THREE from 'three'
import { Edges } from '@react-three/drei'

/**
 * SectionPlaneHelper Component
 * 
 * Renders a translucent plane to visualize the active section plane.
 * 
 * @param {object} activeSectionPlane - The active section plane state
 * @param {boolean} visible - Whether the helper is visible
 * @param {number} size - Size of the plane visualization
 * @param {string} color - Color of the plane (default: yellow)
 */
function SectionPlaneHelper({ 
  activeSectionPlane, 
  visible = true, 
  size = 100,
  color = '#ffff00'
}) {
  const meshRef = useRef()

  // Update position and orientation when plane changes
  useLayoutEffect(() => {
    if (!meshRef.current || !activeSectionPlane) return

    const { origin, normal, offset } = activeSectionPlane
    
    // Calculate actual position: origin + (normal * offset)
    const position = origin.clone().addScaledVector(normal, offset)
    
    // Update mesh position
    meshRef.current.position.copy(position)
    
    // Orient mesh to face the normal using quaternions to avoid lookAt singularities
    // Plane geometry faces +Z by default
    const defaultNormal = new THREE.Vector3(0, 0, 1)
    const quaternion = new THREE.Quaternion()
    
    // Ensure normal is a Vector3
    const safeNormal = normal instanceof THREE.Vector3 ? normal : new THREE.Vector3(normal.x, normal.y, normal.z)
    
    quaternion.setFromUnitVectors(defaultNormal, safeNormal)
    meshRef.current.setRotationFromQuaternion(quaternion)
    
    // Force update matrix
    meshRef.current.updateMatrix()
    
  }, [activeSectionPlane, visible])

  if (!visible || !activeSectionPlane) return null

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial 
        color={color} 
        transparent 
        opacity={0.1} 
        side={THREE.DoubleSide} 
        depthWrite={false}
        polygonOffset={true}
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
      <Edges color={color} threshold={15} />
    </mesh>
  )
}

export default SectionPlaneHelper
