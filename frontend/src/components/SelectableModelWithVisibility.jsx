import React, { useRef, useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'

/**
 * SelectableModel Component with Visibility Support
 * 
 * Loads a GLB model, makes it selectable, and supports visibility control.
 * Registers the scene with the visibility controller.
 * 
 * NOTE: GLB/GLTF files typically use Y-up coordinate system.
 * We rotate the model -90° around X to convert to Z-up (BIM convention).
 * 
 * @param {string} url - Path to the GLB file
 * @param {function} onSelect - Callback when a mesh is clicked (normal selection mode)
 * @param {function} onSceneReady - Callback when scene is loaded, receives scene object
 * @param {boolean} sectionModeEnabled - Whether section mode is active
 * @param {boolean} sectionPlanePickingEnabled - Whether clicking can pick a new plane
 * @param {function} onSectionPick - Callback when a surface is clicked in section mode
 * @param {boolean} visible - Whether the model is visible (default true)
 * @param {object} props - Additional props passed to the group
 */
function SelectableModel({ 
  url, 
  onSelect, 
  onSceneReady, 
  sectionModeEnabled = false,
  sectionPlanePickingEnabled = false,
  onSectionPick,
  visible = true,
  ...props 
}) {
  const { scene } = useGLTF(url)
  const { scene: threeScene, camera, gl } = useThree()
  const groupRef = useRef()

  // Debug: Log scene structure on load
  useEffect(() => {
    if (scene) {
      console.log('=== GLB Scene Structure ===')
      console.log('Scene name:', scene.name)
      console.log('Scene children:', scene.children.length)
      
      // Log hierarchy for first few objects
      let count = 0
      scene.traverse((obj) => {
        if (count < 20) {
          const indent = '  '.repeat(getDepth(obj, scene))
          console.log(`${indent}${obj.type}: "${obj.name}" (parent: "${obj.parent?.name || 'none'}")`)
          count++
        }
      })
      
      // Count objects
      let meshCount = 0
      let globalIdCount = 0
      scene.traverse((obj) => {
        if (obj.isMesh) meshCount++
        // Count objects that look like they have GlobalIds
        if (obj.name && obj.name.length >= 20 && !obj.name.includes('-')) {
          globalIdCount++
        }
      })
      console.log(`Total meshes: ${meshCount}`)
      console.log(`Objects with GlobalId-like names: ${globalIdCount}`)
      console.log('===========================')
    }
  }, [scene])

  /**
   * Get depth of object in hierarchy
   */
  const getDepth = (obj, root) => {
    let depth = 0
    let current = obj
    while (current && current !== root && depth < 20) {
      current = current.parent
      depth++
    }
    return depth
  }

  // Notify parent when scene is ready - also pass camera and gl for section mode
  useEffect(() => {
    if (scene && onSceneReady) {
      // Small delay to ensure scene is fully mounted
      const timer = setTimeout(() => {
        onSceneReady(threeScene, camera, gl)
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [scene, threeScene, camera, gl, onSceneReady])

  /**
   * Handle pointer down on the model
   * 
   * In section mode:
   * - Only pick new plane if sectionPlanePickingEnabled OR Shift is held
   * - Otherwise, allow normal click behavior (orbit, etc.)
   */
  const handlePointerDown = (event) => {
    const clickedMesh = event.object

    if (!clickedMesh || !clickedMesh.isMesh) return

    // Ignore clicks on invisible objects (check self and ancestors)
    let current = clickedMesh
    let isVisible = true
    while (current) {
      if (current.visible === false) {
        isVisible = false
        break
      }
      // Stop if we reach the scene root
      if (current === scene) break
      current = current.parent
    }
    if (!isVisible) return

    event.stopPropagation()

    // Check if this is a Shift+Click (always allows section picking when in section mode)
    const isShiftClick = event.nativeEvent?.shiftKey || false

    console.log('=== Click Event ===')
    console.log('Section Mode:', sectionModeEnabled)
    console.log('Picking Enabled:', sectionPlanePickingEnabled)
    console.log('Shift Key:', isShiftClick)
    console.log('Clicked object type:', clickedMesh.type)
    console.log('Clicked object name:', clickedMesh.name)
    console.log('Parent name:', clickedMesh.parent?.name)
    
    // If section mode is enabled, check if we should pick a new plane
    if (sectionModeEnabled && onSectionPick) {
      // Only allow new plane when:
      // 1. sectionPlanePickingEnabled is true (first pick or "Change Plane" clicked), OR
      // 2. Shift key is held (override to allow re-picking any time)
      const wantsNewPlane = sectionPlanePickingEnabled || isShiftClick
      
      if (!wantsNewPlane) {
        // Section mode is on, but plane is locked and no Shift key
        // Allow the click to pass through for orbit controls / normal interaction
        console.log('Section plane locked - click passes through (Shift+Click to change)')
        console.log('==================')
        // Don't call onSelect here - let normal orbit controls work
        return
      }
      
      // Get the intersection data from the event
      const intersection = {
        point: event.point.clone(),
        face: event.face,
        object: clickedMesh,
        // The native event for canvas coordinate calculation
        nativeEvent: event.nativeEvent
      }
      
      console.log('Section pick intersection:', {
        point: `(${event.point.x.toFixed(2)}, ${event.point.y.toFixed(2)}, ${event.point.z.toFixed(2)})`,
        faceNormal: event.face ? `(${event.face.normal.x.toFixed(2)}, ${event.face.normal.y.toFixed(2)}, ${event.face.normal.z.toFixed(2)})` : 'N/A'
      })
      
      onSectionPick(intersection, clickedMesh)
      console.log('==================')
      return
    }
    
    // Normal selection mode
    console.log('==================')
    onSelect?.(clickedMesh)
  }

  return (
    <group rotation={[Math.PI / 2, 0, 0]} visible={visible}>
      {/* Rotate +90° around X axis to convert Y-up (GLB) to Z-up (BIM) */}
      <primitive
        ref={groupRef}
        object={scene}
        onPointerDown={handlePointerDown}
        {...props}
      />
    </group>
  )
}

SelectableModel.preload = (url) => useGLTF.preload(url)

export default SelectableModel
