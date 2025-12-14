import * as THREE from 'three'

/**
 * Camera Utilities Module
 * 
 * Shared camera helper functions used across hooks.
 * Provides reusable logic for:
 * - Bounding box computation
 * - Camera fitting to bounds
 * - View mode application
 * - Camera animation
 * 
 * This module consolidates camera logic to avoid duplication between:
 * - useCameraFocus.js
 * - useViewMode.js
 * - useSectionMode.js
 */

/**
 * @typedef {'free' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'} ViewMode
 */

/**
 * @typedef {Object} FitOptions
 * @property {number} [paddingFactor=1.2] - Padding multiplier (1.2 = 20% padding around model)
 * @property {number} [minDistance=5] - Minimum camera distance
 */

/**
 * @typedef {Object} ViewConfig
 * @property {THREE.Vector3} direction - Unit vector: where camera looks FROM (relative to center)
 * @property {THREE.Vector3} up - Camera up vector
 * @property {string} label - Human-readable label
 */

/**
 * @typedef {Object} BoundsInfo
 * @property {THREE.Box3} box - The bounding box
 * @property {THREE.Vector3} center - Center of the bounding box
 * @property {THREE.Vector3} size - Size of the bounding box (width, depth, height)
 * @property {number} radius - Bounding sphere radius
 * @property {number} maxDimension - Largest dimension (max of x, y, z)
 */

/**
 * View Direction Configurations
 * 
 * Coordinate system (Z-up, after rotating Y-up model):
 *   - X: Left(-) / Right(+)
 *   - Y: Front(-) / Back(+)  
 *   - Z: Down(-) / Up(+)
 * 
 * The model is rotated -90° around X to convert from Y-up (GLB) to Z-up.
 */
export const VIEW_CONFIGS = {
  // Plan views (looking along Z axis)
  top: {
    direction: new THREE.Vector3(0, 0, 1),     // Camera above (+Z), looking down
    up: new THREE.Vector3(0, 1, 0),             // Y points up on screen
    label: 'Top'
  },
  bottom: {
    direction: new THREE.Vector3(0, 0, -1),    // Camera below (-Z), looking up
    up: new THREE.Vector3(0, -1, 0),            // -Y points up on screen
    label: 'Bottom'
  },
  
  // Elevation views (Z is always vertical up)
  front: {
    direction: new THREE.Vector3(0, -1, 0),    // Camera in front (-Y)
    up: new THREE.Vector3(0, 0, 1),             // Z is up
    label: 'Front'
  },
  back: {
    direction: new THREE.Vector3(0, 1, 0),     // Camera behind (+Y)
    up: new THREE.Vector3(0, 0, 1),             // Z is up
    label: 'Back'
  },
  left: {
    direction: new THREE.Vector3(-1, 0, 0),    // Camera on left (-X)
    up: new THREE.Vector3(0, 0, 1),             // Z is up
    label: 'Left'
  },
  right: {
    direction: new THREE.Vector3(1, 0, 0),     // Camera on right (+X)
    up: new THREE.Vector3(0, 0, 1),             // Z is up
    label: 'Right'
  }
}

/**
 * Default perspective view for "free" mode reset
 * Positioned at front-right, slightly elevated for a natural 3D perspective
 * Not too slanted - a comfortable viewing angle for architectural models
 */
export const DEFAULT_FREE_VIEW = {
  // Front-right position with slight elevation (like standing in front of a building)
  // More frontal than isometric for a natural "default" view
  directionFactors: { x: 0.4, y: -0.8, z: 0.35 },
  up: new THREE.Vector3(0, 0, 1),
  label: 'Free'
}

/**
 * Compute bounding box for all visible meshes in a scene
 * 
 * @param {THREE.Scene} scene - The Three.js scene
 * @returns {BoundsInfo | null} Bounding information or null if empty
 */
export function computeSceneBounds(scene) {
  if (!scene) return null
  
  const box = new THREE.Box3()
  
  scene.traverse((object) => {
    if (object.isMesh && object.visible) {
      box.expandByObject(object)
    }
  })
  
  if (box.isEmpty()) return null
  
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  
  return {
    box,
    center,
    size,
    radius: sphere.radius,
    maxDimension: Math.max(size.x, size.y, size.z)
  }
}

/**
 * Compute bounding box for a set of meshes
 * 
 * @param {THREE.Mesh[]} meshes - Array of meshes
 * @returns {BoundsInfo | null} Bounding information or null if empty
 */
export function computeMeshesBounds(meshes) {
  if (!meshes || meshes.length === 0) return null
  
  const box = new THREE.Box3()
  
  meshes.forEach(mesh => {
    box.expandByObject(mesh)
  })
  
  if (box.isEmpty()) return null
  
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const sphere = new THREE.Sphere()
  box.getBoundingSphere(sphere)
  
  return {
    box,
    center,
    size,
    radius: sphere.radius,
    maxDimension: Math.max(size.x, size.y, size.z)
  }
}

/**
 * Calculate optimal camera distance to fit bounds in view
 * 
 * Uses the bounding sphere radius and camera FOV to compute
 * the distance needed to see the entire model.
 * 
 * @param {number} radius - Bounding sphere radius
 * @param {THREE.PerspectiveCamera} camera - The camera (for FOV)
 * @param {FitOptions} options - Fit options
 * @returns {number} Optimal camera distance
 */
export function calculateFitDistance(radius, camera, options = {}) {
  const { paddingFactor = 1.2, minDistance = 5 } = options
  
  // For perspective camera, use FOV to calculate distance
  if (camera && camera.isPerspectiveCamera) {
    const fov = camera.fov * (Math.PI / 180) // Convert to radians
    const aspectRatio = camera.aspect || 1
    
    // Use the smaller FOV (horizontal or vertical) to ensure model fits
    const effectiveFov = Math.min(fov, fov * aspectRatio)
    
    // Distance = radius / sin(fov/2) to fit sphere in view
    const distance = (radius * paddingFactor) / Math.sin(effectiveFov / 2)
    
    return Math.max(distance, minDistance)
  }
  
  // Fallback for orthographic or unknown camera
  return Math.max(radius * 2.0 * paddingFactor, minDistance)
}

/**
 * Apply a view mode to camera and controls
 * 
 * Positions the camera at the correct location for the view mode,
 * sets the up vector, and updates controls target.
 * 
 * NOTE: This function sets camera state immediately (no animation).
 * For animated transitions, use animateCameraToView instead.
 * 
 * @param {ViewMode} mode - The view mode to apply
 * @param {THREE.Camera} camera - The camera to position
 * @param {OrbitControls} controls - The orbit controls
 * @param {THREE.Box3 | BoundsInfo} targetBounds - Model bounding box or BoundsInfo
 * @param {FitOptions} options - Fit options
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3 } | null}
 */
export function applyViewMode(mode, camera, controls, targetBounds, options = {}) {
  if (!camera || !controls) {
    console.warn('applyViewMode: Camera or controls not provided')
    return null
  }
  
  // Handle both Box3 and BoundsInfo input
  let bounds
  if (targetBounds instanceof THREE.Box3) {
    const center = targetBounds.getCenter(new THREE.Vector3())
    const size = targetBounds.getSize(new THREE.Vector3())
    const sphere = new THREE.Sphere()
    targetBounds.getBoundingSphere(sphere)
    bounds = {
      box: targetBounds,
      center,
      size,
      radius: sphere.radius,
      maxDimension: Math.max(size.x, size.y, size.z)
    }
  } else {
    bounds = targetBounds
  }
  
  if (!bounds || !bounds.center) {
    console.warn('applyViewMode: Invalid bounds provided')
    return null
  }
  
  const { center, radius } = bounds
  
  // Handle 'free' mode - use default isometric view
  if (mode === 'free') {
    const distance = calculateFitDistance(radius, camera, { ...options, paddingFactor: options.paddingFactor || 1.5 })
    const { directionFactors, up } = DEFAULT_FREE_VIEW
    
    const position = new THREE.Vector3(
      center.x + distance * directionFactors.x,
      center.y + distance * directionFactors.y,
      center.z + distance * directionFactors.z
    )
    
    // Apply to camera and controls
    camera.position.copy(position)
    camera.up.copy(up)
    controls.target.copy(center)
    camera.lookAt(center)
    controls.update()
    
    return { position, target: center.clone(), up: up.clone() }
  }
  
  // Get view configuration
  const config = VIEW_CONFIGS[mode]
  if (!config) {
    console.warn(`applyViewMode: Unknown view mode "${mode}"`)
    return null
  }
  
  // Calculate distance to fit model
  const distance = calculateFitDistance(radius, camera, options)
  
  // Calculate camera position: center + direction * distance
  const position = new THREE.Vector3()
  position.copy(config.direction).multiplyScalar(distance).add(center)
  
  // Apply to camera and controls
  camera.position.copy(position)
  camera.up.copy(config.up)
  controls.target.copy(center)
  camera.lookAt(center)
  controls.update()
  
  return {
    position: position.clone(),
    target: center.clone(),
    up: config.up.clone()
  }
}

/**
 * Calculate target camera state for a view mode (without applying)
 * 
 * Useful for animation - get the target state, then animate to it.
 * 
 * @param {ViewMode} mode - The view mode
 * @param {BoundsInfo} bounds - Model bounds
 * @param {THREE.Camera} camera - Camera (for FOV-based distance calculation)
 * @param {FitOptions} options - Fit options
 * @returns {{ position: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3 } | null}
 */
export function calculateViewTarget(mode, bounds, camera, options = {}) {
  if (!bounds || !bounds.center) {
    return null
  }
  
  const { center, radius } = bounds
  
  // Handle 'free' mode
  if (mode === 'free') {
    const distance = calculateFitDistance(radius, camera, { ...options, paddingFactor: options.paddingFactor || 1.5 })
    const { directionFactors, up } = DEFAULT_FREE_VIEW
    
    const position = new THREE.Vector3(
      center.x + distance * directionFactors.x,
      center.y + distance * directionFactors.y,
      center.z + distance * directionFactors.z
    )
    
    return { position, target: center.clone(), up: up.clone() }
  }
  
  // Get view configuration
  const config = VIEW_CONFIGS[mode]
  if (!config) {
    return null
  }
  
  const distance = calculateFitDistance(radius, camera, options)
  
  const position = new THREE.Vector3()
  position.copy(config.direction).multiplyScalar(distance).add(center)
  
  return {
    position,
    target: center.clone(),
    up: config.up.clone()
  }
}

/**
 * Easing function for smooth camera animation
 * Cubic ease-in-out for natural-feeling motion
 * 
 * @param {number} t - Progress from 0 to 1
 * @returns {number} Eased value
 */
export function easeInOutCubic(t) {
  return t < 0.5 
    ? 4 * t * t * t 
    : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Animate camera to a target state
 * 
 * Uses direct position/target interpolation with proper up vector handling.
 * The key is to set camera.up BEFORE calling lookAt.
 * 
 * @param {THREE.Camera} camera - The camera
 * @param {OrbitControls} controls - Orbit controls
 * @param {THREE.Vector3} endPosition - Target camera position
 * @param {THREE.Vector3} endTarget - Target orbit target
 * @param {THREE.Vector3} endUp - Target up vector
 * @param {Object} animOptions - Animation options
 * @param {number} [animOptions.duration=600] - Animation duration in ms
 * @param {function} [animOptions.onComplete] - Callback when animation completes
 * @param {React.MutableRefObject} [animOptions.animationRef] - Ref to store animation frame ID
 * @returns {number} Animation frame ID
 */
export function animateCameraToTarget(
  camera, 
  controls, 
  endPosition, 
  endTarget, 
  endUp,
  animOptions = {}
) {
  const { duration = 600, onComplete, animationRef } = animOptions
  
  if (!camera || !controls) {
    console.warn('animateCameraToTarget: Camera or controls not provided')
    return null
  }
  
  // Cancel any existing animation
  if (animationRef?.current) {
    cancelAnimationFrame(animationRef.current)
  }
  
  const startPosition = camera.position.clone()
  const startTarget = controls.target.clone()
  const startUp = camera.up.clone()
  const startTime = performance.now()
  
  const animate = () => {
    const elapsed = performance.now() - startTime
    const progress = Math.min(elapsed / duration, 1)
    const eased = easeInOutCubic(progress)
    
    // Interpolate position and target
    camera.position.lerpVectors(startPosition, endPosition, eased)
    controls.target.lerpVectors(startTarget, endTarget, eased)
    
    // Interpolate up vector using slerp-like behavior
    // We use a temporary vector and normalize
    const currentUp = new THREE.Vector3().lerpVectors(startUp, endUp, eased).normalize()
    camera.up.copy(currentUp)
    
    // CRITICAL: Set up BEFORE lookAt for correct orientation
    camera.lookAt(controls.target)
    controls.update()
    
    if (progress < 1) {
      const frameId = requestAnimationFrame(animate)
      if (animationRef) {
        animationRef.current = frameId
      }
      return frameId
    } else {
      // Ensure final state is exact
      camera.position.copy(endPosition)
      camera.up.copy(endUp)
      controls.target.copy(endTarget)
      camera.lookAt(endTarget)
      controls.update()
      
      if (animationRef) {
        animationRef.current = null
      }
      
      onComplete?.()
      return null
    }
  }
  
  const frameId = requestAnimationFrame(animate)
  if (animationRef) {
    animationRef.current = frameId
  }
  return frameId
}

/**
 * Get list of all available view modes with labels
 * @returns {Array<{mode: ViewMode, label: string}>}
 */
export function getAvailableViewModes() {
  return [
    { mode: 'free', label: 'Free' },
    { mode: 'top', label: 'Top' },
    { mode: 'bottom', label: 'Bottom' },
    { mode: 'front', label: 'Front' },
    { mode: 'back', label: 'Back' },
    { mode: 'left', label: 'Left' },
    { mode: 'right', label: 'Right' }
  ]
}
