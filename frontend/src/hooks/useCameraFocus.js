import { useCallback, useRef, useMemo } from 'react'
import * as THREE from 'three'

/**
 * useCameraFocus Hook
 * 
 * Provides smooth camera pan and zoom to focus on selected elements.
 * Uses requestAnimationFrame with lerp for smooth animation.
 * 
 * @returns {object} Camera focus controls
 */
function useCameraFocus() {
  // Store references
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  
  // Animation state
  const animationRef = useRef(null)

  /**
   * Easing function for smooth animation
   * @param {number} t - Progress from 0 to 1
   * @returns {number} Eased value
   */
  const easeInOutCubic = useCallback((t) => {
    return t < 0.5 
      ? 4 * t * t * t 
      : 1 - Math.pow(-2 * t + 2, 3) / 2
  }, [])

  /**
   * Check if a mesh matches any of the globalIds
   * Checks mesh name, userData, and ancestor chain (same as useXRayMode)
   */
  const isMeshMatchingId = useCallback((mesh, idsSet) => {
    if (!mesh || idsSet.size === 0) return false
    
    // Check direct match on mesh name
    if (idsSet.has(mesh.name)) return true
    
    // Check userData.GlobalId
    if (mesh.userData?.GlobalId && idsSet.has(mesh.userData.GlobalId)) return true
    
    // Check ancestor chain (for nested elements like stairs)
    let ancestor = mesh.parent
    let depth = 0
    const maxDepth = 10
    
    while (ancestor && depth < maxDepth) {
      if (idsSet.has(ancestor.name)) return true
      if (ancestor.userData?.GlobalId && idsSet.has(ancestor.userData.GlobalId)) return true
      ancestor = ancestor.parent
      depth++
    }
    
    return false
  }, [])

  /**
   * Find all meshes matching the given globalIds
   * @param {string[]} globalIds - Array of element GlobalIds
   * @returns {THREE.Mesh[]} Array of matching meshes
   */
  const findMeshesByGlobalIds = useCallback((globalIds) => {
    if (!sceneRef.current || !globalIds || globalIds.length === 0) {
      return []
    }

    const idsSet = new Set(globalIds)
    const matchingMeshes = []

    sceneRef.current.traverse((object) => {
      if (object.isMesh && isMeshMatchingId(object, idsSet)) {
        matchingMeshes.push(object)
      }
    })

    return matchingMeshes
  }, [isMeshMatchingId])

  /**
   * Compute bounding box for all selected meshes
   * @param {THREE.Mesh[]} meshes - Array of meshes
   * @returns {THREE.Box3} Bounding box encompassing all meshes
   */
  const computeBoundingBox = useCallback((meshes) => {
    const boundingBox = new THREE.Box3()
    
    meshes.forEach(mesh => {
      boundingBox.expandByObject(mesh)
    })
    
    return boundingBox
  }, [])

  /**
   * Animate camera to new position with smooth interpolation
   * @param {THREE.Vector3} startPos - Starting camera position
   * @param {THREE.Vector3} endPos - Target camera position
   * @param {THREE.Vector3} startTarget - Starting orbit target
   * @param {THREE.Vector3} endTarget - Target orbit target
   * @param {number} duration - Animation duration in ms
   */
  const animateCamera = useCallback((startPos, endPos, startTarget, endTarget, duration = 800) => {
    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }

    const camera = cameraRef.current
    const controls = controlsRef.current
    
    if (!camera || !controls) {
      console.warn('useCameraFocus: Camera or controls not set')
      return
    }

    const startTime = performance.now()
    
    const animate = () => {
      const elapsed = performance.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = easeInOutCubic(progress)
      
      // Interpolate camera position
      camera.position.lerpVectors(startPos, endPos, eased)
      
      // Interpolate orbit target
      controls.target.lerpVectors(startTarget, endTarget, eased)
      controls.update()
      
      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate)
      } else {
        animationRef.current = null
      }
    }
    
    animate()
  }, [])

  /**
   * Focus camera on elements with given globalIds
   * @param {string[]} globalIds - Array of element GlobalIds to focus on
   * @param {function} onResult - Optional callback with result info: { found: boolean, count: number }
   * @returns {object} Result info: { found: boolean, count: number }
   */
  const focusOnElements = useCallback((globalIds, onResult) => {
    const result = { found: false, count: 0 }
    
    if (!sceneRef.current || !cameraRef.current || !controlsRef.current) {
      console.warn('useCameraFocus: Scene, camera, or controls not set')
      onResult?.(result)
      return result
    }

    if (!globalIds || globalIds.length === 0) {
      console.log('useCameraFocus: No globalIds provided')
      onResult?.(result)
      return result
    }

    // Ensure globalIds is an array
    const ids = Array.isArray(globalIds) ? globalIds : [globalIds]
    
    // Find matching meshes
    const meshes = findMeshesByGlobalIds(ids)
    
    result.count = meshes.length
    
    if (meshes.length === 0) {
      console.log('useCameraFocus: No meshes found for globalIds:', ids)
      onResult?.(result)
      return result
    }

    result.found = true
    console.log(`useCameraFocus: Focusing on ${meshes.length} mesh(es)`)

    // Compute bounding box
    const boundingBox = computeBoundingBox(meshes)
    
    if (boundingBox.isEmpty()) {
      console.log('useCameraFocus: Bounding box is empty')
      result.found = false
      onResult?.(result)
      return result
    }

    // Get center and size
    const center = boundingBox.getCenter(new THREE.Vector3())
    const size = boundingBox.getSize(new THREE.Vector3())
    
    // Calculate optimal distance based on largest dimension
    const maxDim = Math.max(size.x, size.y, size.z)
    const distance = Math.max(maxDim * 2, 5) // Minimum distance of 5 units
    
    // Calculate camera position offset
    // Position camera at an angle for better 3D view
    const camera = cameraRef.current
    const controls = controlsRef.current
    
    // Get current camera direction to maintain similar viewing angle
    const currentDirection = new THREE.Vector3()
    currentDirection.subVectors(camera.position, controls.target).normalize()
    
    // If direction is too vertical, use a default angle
    if (Math.abs(currentDirection.y) > 0.95) {
      currentDirection.set(1, 0.5, 1).normalize()
    }
    
    // Calculate new camera position
    const newCameraPos = new THREE.Vector3()
    newCameraPos.copy(center).add(currentDirection.multiplyScalar(distance))
    
    // Ensure camera is above the target
    if (newCameraPos.y < center.y + distance * 0.3) {
      newCameraPos.y = center.y + distance * 0.3
    }
    
    // Store starting positions
    const startPos = camera.position.clone()
    const startTarget = controls.target.clone()
    
    // Animate to new position
    animateCamera(startPos, newCameraPos, startTarget, center, 800)
    
    console.log('Camera focus animation started:', {
      center: `(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)})`,
      size: `(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`,
      distance: distance.toFixed(2)
    })
    
    onResult?.(result)
    return result
  }, [findMeshesByGlobalIds, computeBoundingBox, animateCamera])

  /**
   * Set scene reference
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
  }, [])

  /**
   * Set camera reference
   */
  const setCamera = useCallback((camera) => {
    cameraRef.current = camera
  }, [])

  /**
   * Set controls reference
   */
  const setControls = useCallback((controls) => {
    controlsRef.current = controls
  }, [])

  /**
   * Cancel any ongoing animation
   */
  const cancelAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  return {
    setScene,
    setCamera,
    setControls,
    focusOnElements,
    cancelAnimation
  }
}

export default useCameraFocus
