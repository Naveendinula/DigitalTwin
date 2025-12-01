import { useCallback, useRef } from 'react'
import * as THREE from 'three'

/**
 * useVisibility Hook
 * 
 * Manages visibility/isolation of objects in the Three.js scene.
 * Allows hiding/showing objects by their GlobalId (mesh name).
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
   * Store original visibility states
   */
  const storeOriginalState = useCallback(() => {
    if (!sceneRef.current) return
    
    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.name) {
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
      if (object.isMesh && object.name) {
        if (idsToShow.has(object.name)) {
          object.visible = true
          shownCount++
        } else {
          object.visible = false
          hiddenCount++
        }
      }
    })

    console.log(`Isolated ${shownCount} objects, hidden ${hiddenCount} objects`)
  }, [showAll, storeOriginalState])

  /**
   * Hide specific objects by GlobalId
   * 
   * @param {string[]} globalIds - Array of GlobalIds to hide
   */
  const hide = useCallback((globalIds) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) return

    storeOriginalState()
    const idsToHide = new Set(globalIds)

    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.name && idsToHide.has(object.name)) {
        object.visible = false
      }
    })
  }, [storeOriginalState])

  /**
   * Show specific objects by GlobalId
   * 
   * @param {string[]} globalIds - Array of GlobalIds to show
   */
  const show = useCallback((globalIds) => {
    if (!sceneRef.current) return
    if (!globalIds || globalIds.length === 0) return

    const idsToShow = new Set(globalIds)

    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.name && idsToShow.has(object.name)) {
        object.visible = true
      }
    })
  }, [])

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
      if (object.isMesh && object.name && idsToTransparent.has(object.name)) {
        if (object.material) {
          object.material = object.material.clone()
          object.material.transparent = true
          object.material.opacity = opacity
        }
      }
    })
  }, [])

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
