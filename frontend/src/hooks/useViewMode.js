import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import {
  VIEW_CONFIGS,
  computeSceneBounds,
  calculateViewTarget,
  animateCameraToTarget,
  getAvailableViewModes,
  applyViewMode
} from '../utils/cameraUtils'
import { debugLog, debugWarn } from '../utils/logger'

/**
 * View Mode Types
 * 
 * Defines the available camera view presets for the 3D viewer.
 * 
 * - free: User-controlled orbit view (default)
 * - top: Looking down from +Z axis
 * - bottom: Looking up from -Z axis  
 * - front: Looking from -Y axis (architectural front)
 * - back: Looking from +Y axis
 * - left: Looking from -X axis
 * - right: Looking from +X axis
 * 
 * @typedef {'free' | 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right'} ViewMode
 */

/**
 * @typedef {Object} FitOptions
 * @property {number} [paddingFactor=1.2] - Padding multiplier (1.2 = 20% padding)
 * @property {number} [minDistance=5] - Minimum camera distance
 */

/**
 * useViewMode Hook
 * 
 * Manages view mode state and provides camera positioning for preset views.
 * 
 * REUSES EXISTING UTILITIES:
 * - cameraUtils.js: computeSceneBounds, calculateViewTarget, animateCameraToTarget
 * - Same bounding box logic as useCameraFocus and useSectionMode
 * 
 * FEATURES:
 * - Cached bounding box to avoid recomputation on every view change
 * - Animated camera transitions between views
 * - Support for custom padding/fit options
 * - Free mode camera state preservation (restores when returning to free mode)
 * 
 * @param {FitOptions} defaultOptions - Default fit options for all view changes
 * @returns {object} View mode state and controls
 */
function useViewMode(defaultOptions = {}) {
  // Current view mode
  const [viewMode, setViewModeState] = useState('free')
  
  // Scene reference for bounding box calculation
  const sceneRef = useRef(null)
  
  // Camera reference
  const cameraRef = useRef(null)
  
  // OrbitControls reference
  const controlsRef = useRef(null)
  
  // Animation frame reference
  const animationRef = useRef(null)
  
  // Cached bounding box - invalidated when model changes
  const cachedBoundsRef = useRef(null)
  
  // Saved free mode camera state - preserves user's orbit position
  const savedFreeModeState = useRef(null)
  
  // Default fit options
  const defaultFitOptions = {
    paddingFactor: 1.2,
    minDistance: 5,
    ...defaultOptions
  }

  /**
   * Set scene reference and invalidate bounds cache
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    // Invalidate cache when scene changes
    cachedBoundsRef.current = null
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
   * Invalidate the cached bounding box
   * Call this when the model changes
   */
  const invalidateBoundsCache = useCallback(() => {
    cachedBoundsRef.current = null
    // Also clear saved free mode state since the model changed
    savedFreeModeState.current = null
  }, [])

  /**
   * Get model bounding box, using cache if available
   * Uses computeSceneBounds from cameraUtils
   * 
   * @param {boolean} forceRecompute - Force recomputation even if cached
   * @returns {BoundsInfo | null}
   */
  const getModelBounds = useCallback((forceRecompute = false) => {
    // Return cached if available and not forcing recompute
    if (cachedBoundsRef.current && !forceRecompute) {
      return cachedBoundsRef.current
    }
    
    // Compute new bounds
    const bounds = computeSceneBounds(sceneRef.current)
    
    if (bounds) {
      cachedBoundsRef.current = bounds
    }
    
    return bounds
  }, [])

  /**
   * Save current camera state for free mode preservation
   * @private
   */
  const saveFreeModeState = useCallback(() => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    
    if (camera && controls) {
      savedFreeModeState.current = {
        position: camera.position.clone(),
        target: controls.target.clone(),
        up: camera.up.clone()
      }
    }
  }, [])

  /**
   * Apply a view mode with animation
   * 
   * Uses applyViewMode from cameraUtils for calculation,
   * then animates the transition.
   * 
   * Preserves free mode camera state when switching away,
   * and restores it when returning to free mode.
   * 
   * @param {ViewMode} mode - The view mode to apply
   * @param {FitOptions} options - Override fit options
   */
  const setViewMode = useCallback((mode, options = {}) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    const previousMode = viewMode
    
    if (!camera || !controls) {
      debugWarn('useViewMode: Camera or controls not set')
      return
    }
    
    // If already in free mode and pressing free again, do nothing
    // (don't reset the user's current orbit position)
    if (previousMode === 'free' && mode === 'free' && !options.forceReset) {
      debugLog('Already in free mode, keeping current view')
      return
    }
    
    // Save free mode state before switching away
    if (previousMode === 'free' && mode !== 'free') {
      saveFreeModeState()
    }
    
    // Update state
    setViewModeState(mode)
    
    // If returning to free mode and we have saved state, restore it
    if (mode === 'free' && savedFreeModeState.current) {
      const saved = savedFreeModeState.current
      
      animateCameraToTarget(
        camera,
        controls,
        saved.position,
        saved.target,
        saved.up,
        {
          duration: 600,
          animationRef
        }
      )
      
      debugLog('Restored free mode camera state')
      return
    }
    
    // Get model bounds (use cache if available)
    const bounds = getModelBounds()
    if (!bounds) {
      debugWarn('useViewMode: Cannot compute model bounds')
      return
    }
    
    // Merge options
    const fitOptions = { ...defaultFitOptions, ...options }
    
    // Calculate target camera state using shared utility
    const target = calculateViewTarget(mode, bounds, camera, fitOptions)
    
    if (!target) {
      debugWarn(`useViewMode: Failed to calculate view target for mode "${mode}"`)
      return
    }
    
    // Animate to target
    animateCameraToTarget(
      camera,
      controls,
      target.position,
      target.target,
      target.up,
      {
        duration: 600,
        animationRef
      }
    )
    
    debugLog(`View mode set to: ${mode}`, {
      center: `(${bounds.center.x.toFixed(2)}, ${bounds.center.y.toFixed(2)}, ${bounds.center.z.toFixed(2)})`,
      radius: bounds.radius.toFixed(2),
      cameraPos: `(${target.position.x.toFixed(2)}, ${target.position.y.toFixed(2)}, ${target.position.z.toFixed(2)})`
    })
  }, [viewMode, getModelBounds, defaultFitOptions, saveFreeModeState])

  /**
   * Apply view mode immediately without animation
   * Useful for initial setup or when animation is not desired
   * 
   * @param {ViewMode} mode - The view mode to apply
   * @param {FitOptions} options - Override fit options
   */
  const setViewModeImmediate = useCallback((mode, options = {}) => {
    // Update state
    setViewModeState(mode)
    
    const camera = cameraRef.current
    const controls = controlsRef.current
    
    if (!camera || !controls) {
      debugWarn('useViewMode: Camera or controls not set')
      return
    }
    
    // Get model bounds (use cache if available)
    const bounds = getModelBounds()
    if (!bounds) {
      debugWarn('useViewMode: Cannot compute model bounds')
      return
    }
    
    // Merge options
    const fitOptions = { ...defaultFitOptions, ...options }
    
    // Apply immediately using shared utility
    applyViewMode(mode, camera, controls, bounds, fitOptions)
    
    debugLog(`View mode set (immediate) to: ${mode}`)
  }, [getModelBounds, defaultFitOptions])

  /**
   * Get the current view mode
   * 
   * @returns {ViewMode} Current view mode
   */
  const getViewMode = useCallback(() => {
    return viewMode
  }, [viewMode])

  /**
   * Reset view to 'free' mode with a nice default perspective
   * Forces reset even if already in free mode
   * 
   * @param {FitOptions} options - Override fit options
   */
  const resetView = useCallback((options = {}) => {
    // Clear saved free mode state so we get the default perspective
    savedFreeModeState.current = null
    setViewMode('free', { paddingFactor: 1.5, forceReset: true, ...options })
    debugLog('View reset to default perspective')
  }, [setViewMode])

  /**
   * Fit camera to model bounds while keeping current view direction
   * Useful for "fit all" / "zoom to fit" functionality
   * 
   * @param {FitOptions} options - Fit options
   */
  const fitToModel = useCallback((options = {}) => {
    const camera = cameraRef.current
    const controls = controlsRef.current
    
    if (!camera || !controls) {
      debugWarn('useViewMode: Camera or controls not set')
      return
    }
    
    // Force recompute bounds for fit
    const bounds = getModelBounds(true)
    if (!bounds) {
      debugWarn('useViewMode: Cannot compute model bounds')
      return
    }
    
    // Keep current view direction
    const currentDirection = new THREE.Vector3()
    currentDirection.subVectors(camera.position, controls.target).normalize()
    
    // Calculate distance to fit
    const fitOptions = { paddingFactor: 1.3, ...defaultFitOptions, ...options }
    
    // Use FOV-based calculation for perspective camera
    let distance
    if (camera.isPerspectiveCamera) {
      const fov = camera.fov * (Math.PI / 180)
      distance = (bounds.radius * fitOptions.paddingFactor) / Math.sin(fov / 2)
    } else {
      distance = bounds.radius * 2.0 * fitOptions.paddingFactor
    }
    distance = Math.max(distance, fitOptions.minDistance)
    
    // Calculate new camera position
    const newPosition = new THREE.Vector3()
    newPosition.copy(currentDirection).multiplyScalar(distance).add(bounds.center)
    
    // Animate to new position
    animateCameraToTarget(
      camera,
      controls,
      newPosition,
      bounds.center,
      camera.up.clone(),
      {
        duration: 500,
        animationRef
      }
    )
    
    debugLog('Fit to model:', {
      center: `(${bounds.center.x.toFixed(2)}, ${bounds.center.y.toFixed(2)}, ${bounds.center.z.toFixed(2)})`,
      distance: distance.toFixed(2)
    })
  }, [getModelBounds, defaultFitOptions])

  /**
   * Cancel any ongoing animation
   */
  const cancelAnimation = useCallback(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
      animationRef.current = null
    }
  }, [])

  /**
   * Get available view modes with labels
   * Uses shared utility
   * 
   * @returns {Array<{mode: ViewMode, label: string}>}
   */
  const getAvailableViews = useCallback(() => {
    return getAvailableViewModes()
  }, [])

  return {
    // State
    viewMode,
    
    // Setup
    setScene,
    setCamera,
    setControls,
    
    // Actions
    setViewMode,
    setViewModeImmediate,
    getViewMode,
    resetView,
    fitToModel,
    cancelAnimation,
    
    // Utilities
    getAvailableViews,
    getModelBounds,
    invalidateBoundsCache
  }
}

export default useViewMode
