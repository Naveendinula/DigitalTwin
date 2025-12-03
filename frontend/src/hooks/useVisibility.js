import { useCallback, useRef } from 'react'
import * as THREE from 'three'

/**
 * useVisibility Hook
 * 
 * Manages visibility/isolation of objects in the Three.js scene.
 * Allows hiding/showing objects by their GlobalId (mesh name or ancestor name).
 * 
 * @param {THREE.Scene} scene - The Three.js scene reference
 * @returns {object} Visibility control functions
 */
function useVisibility() {
  // Store original visibility state for restoration
  const originalVisibility = useRef(new Map())
  const sceneRef = useRef(null)

  /**
   * Set the scene reference
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
  }, [])

  /**
   * Check if a mesh matches any of the selected globalIds
   * Checks mesh name, userData, and ancestor chain (up to 10 levels)
   */
  const isMeshMatchingIds = useCallback((mesh, idsSet) => {
    if (!mesh || idsSet.size === 0) return false
    
    // Check direct match on mesh name
    if (mesh.name && idsSet.has(mesh.name)) return true
    
    // Check userData.GlobalId
    if (mesh.userData?.GlobalId && idsSet.has(mesh.userData.GlobalId)) return true
    
    // Check ancestor chain (for nested elements like windows, stairs, etc.)
    let ancestor = mesh.parent
    let depth = 0
    const maxDepth = 10
    
    while (ancestor && depth < maxDepth) {
      if (ancestor.name && idsSet.has(ancestor.name)) return true
      if (ancestor.userData?.GlobalId && idsSet.has(ancestor.userData.GlobalId)) return true
      ancestor = ancestor.parent
      depth++
    }
    
    return false
  }, [])

  /**
   * Store original visibility states
   */
  const storeOriginalState = useCallback(() => {
    if (!sceneRef.current) return
    
    sceneRef.current.traverse((object) => {
      if (object.isMesh) {
        if (!originalVisibility.current.has(object.uuid)) {
          originalVisibility.current.set(object.uuid, object.visible)
        }
      }
    })
  }, [])

  /**
   * Show all objects (reset isolation)
   */
  const showAll = useCallback(() => {
    if (!sceneRef.current) return

    sceneRef.current.traverse((object) => {
      if (object.isMesh) {
        // Restore original visibility or default to true
        const original = originalVisibility.current.get(object.uuid)
        object.visible = original !== undefined ? original : true
      }
    })

    console.log('Visibility reset: showing all objects')
  }, [])

  /**
   * Isolate specific objects by GlobalId (show only these, hide others)
   * Checks mesh name, userData.GlobalId, and ancestor chain
   * 
   * @param {string[]} globalIds - Array of GlobalIds to show
   */
  const isolate = useCallback((globalIds) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) {
      showAll()
      return
    }

    // Store original state before modifying
    storeOriginalState()

    // Create a Set for fast lookup
    const idsToShow = new Set(globalIds)
    let hiddenCount = 0
    let shownCount = 0

    sceneRef.current.traverse((object) => {
      if (object.isMesh) {
        // Check if mesh matches any of the IDs (including ancestor chain)
        if (isMeshMatchingIds(object, idsToShow)) {
          object.visible = true
          shownCount++
        } else {
          object.visible = false
          hiddenCount++
        }
      }
    })

    console.log(`Isolated ${shownCount} objects, hidden ${hiddenCount} objects`)
  }, [showAll, storeOriginalState, isMeshMatchingIds])

  /**
   * Hide specific objects by GlobalId
   * Checks mesh name, userData.GlobalId, and ancestor chain
   * 
   * @param {string[]} globalIds - Array of GlobalIds to hide
   */
  const hide = useCallback((globalIds) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) return

    storeOriginalState()
    const idsToHide = new Set(globalIds)

    sceneRef.current.traverse((object) => {
      if (object.isMesh && isMeshMatchingIds(object, idsToHide)) {
        object.visible = false
      }
    })
  }, [storeOriginalState, isMeshMatchingIds])

  /**
   * Show specific objects by GlobalId
   * Checks mesh name, userData.GlobalId, and ancestor chain
   * 
   * @param {string[]} globalIds - Array of GlobalIds to show
   */
  const show = useCallback((globalIds) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) return

    const idsToShow = new Set(globalIds)

    sceneRef.current.traverse((object) => {
      if (object.isMesh && isMeshMatchingIds(object, idsToShow)) {
        object.visible = true
      }
    })
  }, [isMeshMatchingIds])

  /**
   * Set transparency for specific objects
   * 
   * @param {string[]} globalIds - Array of GlobalIds to make transparent
   * @param {number} opacity - Opacity value (0-1)
   */
  const setTransparency = useCallback((globalIds, opacity = 0.3) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) return

    const idsToTransparent = new Set(globalIds)

    sceneRef.current.traverse((object) => {
      if (object.isMesh && isMeshMatchingIds(object, idsToTransparent)) {
        if (object.material) {
          object.material = object.material.clone()
          object.material.transparent = true
          object.material.opacity = opacity
        }
      }
    })
  }, [isMeshMatchingIds])

  /**
   * Get all GlobalIds in the scene
   */
  const getAllIds = useCallback(() => {
    if (!sceneRef.current) return []
    
    const ids = []
    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.name) {
        ids.push(object.name)
      }
    })
    return ids
  }, [])

  return {
    setScene,
    showAll,
    isolate,
    hide,
    show,
    setTransparency,
    getAllIds
  }
}

export default useVisibility
