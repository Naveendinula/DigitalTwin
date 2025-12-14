import { useState, useCallback, useRef, useMemo } from 'react'
import * as THREE from 'three'

/**
 * useXRayMode Hook
 * 
 * Implements X-ray/ghost effect for non-selected elements.
 * When enabled, non-selected meshes become semi-transparent wireframes
 * while selected meshes remain solid with their original materials.
 * 
 * Performance optimizations:
 * - Cached X-ray material to avoid recreation
 * - Batched material updates
 * 
 * @returns {object} X-ray mode state and controls
 */
function useXRayMode() {
  const [xRayEnabled, setXRayEnabled] = useState(false)
  
  // Store original materials for restoration
  // Key: mesh UUID, Value: { mesh, material }
  const originalMaterialsRef = useRef(new Map())
  
  // Reference to the scene
  const sceneRef = useRef(null)
  
  // Currently selected IDs when X-ray is active
  const selectedIdsRef = useRef(new Set())
  
  // Cached X-ray material (shared instance for performance)
  const xRayMaterialRef = useRef(null)

  /**
   * Get or create cached X-ray material
   * Dark blue-gray wireframe, very translucent
   */
  const getXRayMaterial = useCallback(() => {
    if (!xRayMaterialRef.current) {
      xRayMaterialRef.current = new THREE.MeshBasicMaterial({
        color: 0x2a2a3e,        // Slightly lighter blue-gray
        wireframe: true,         // Wireframe mode
        transparent: true,
        opacity: 0.08,           // Much more translucent
        depthWrite: false,       // Render behind solid objects
        side: THREE.DoubleSide,  // Visible from both sides
      })
    }
    return xRayMaterialRef.current
  }, [])

  /**
   * Create a clone of X-ray material (for individual mesh assignment)
   * Cloning allows per-mesh material state if needed
   */
  const createXRayMaterial = useCallback(() => {
    return getXRayMaterial().clone()
  }, [getXRayMaterial])

  /**
   * Check if a mesh matches any of the selected globalIds
   * Checks mesh name, userData, and ancestor chain
   */
  const isMeshSelected = useCallback((mesh, selectedIds) => {
    if (!mesh || selectedIds.size === 0) return false
    
    // Check direct match on mesh name
    if (selectedIds.has(mesh.name)) return true
    
    // Check userData.GlobalId
    if (mesh.userData?.GlobalId && selectedIds.has(mesh.userData.GlobalId)) return true
    
    // Check ancestor chain (for nested elements like stairs)
    let ancestor = mesh.parent
    let depth = 0
    const maxDepth = 10
    
    while (ancestor && depth < maxDepth) {
      if (selectedIds.has(ancestor.name)) return true
      if (ancestor.userData?.GlobalId && selectedIds.has(ancestor.userData.GlobalId)) return true
      ancestor = ancestor.parent
      depth++
    }
    
    return false
  }, [])

  /**
   * Apply X-ray effect to a single mesh
   * @param {THREE.Mesh} mesh - The mesh to modify
   * @param {boolean} isSelected - Whether this mesh is selected
   */
  const setXRayForMesh = useCallback((mesh, isSelected) => {
    if (!mesh.isMesh || !mesh.material) return
    
    // Skip meshes that are part of helpers, grids, etc.
    if (mesh.type === 'GridHelper' || mesh.type === 'AxesHelper') return
    if (mesh.name?.includes('Helper') || mesh.name?.includes('Grid')) return
    
    // Store original material if not already stored
    if (!originalMaterialsRef.current.has(mesh.uuid)) {
      originalMaterialsRef.current.set(mesh.uuid, {
        mesh,
        material: mesh.material
      })
    }
    
    if (isSelected) {
      // Keep original material for selected meshes
      const stored = originalMaterialsRef.current.get(mesh.uuid)
      if (stored) {
        mesh.material = stored.material
      }
    } else {
      // Apply X-ray material for non-selected meshes
      mesh.material = createXRayMaterial()
    }
  }, [createXRayMaterial])

  /**
   * Set scene reference
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
  }, [])

  /**
   * Enable X-ray mode with selected elements
   * @param {string[]} selectedIds - Array of globalIds that should remain solid
   */
  const enableXRay = useCallback((selectedIds = []) => {
    if (!sceneRef.current) {
      console.warn('useXRayMode: Scene not set')
      return
    }
    
    const idsSet = new Set(selectedIds)
    selectedIdsRef.current = idsSet
    
    console.log('Enabling X-ray mode, selected IDs:', selectedIds)
    
    // Traverse scene and apply X-ray effect
    sceneRef.current.traverse((object) => {
      if (object.isMesh) {
        const isSelected = isMeshSelected(object, idsSet)
        setXRayForMesh(object, isSelected)
      }
    })
    
    setXRayEnabled(true)
  }, [isMeshSelected, setXRayForMesh])

  /**
   * Disable X-ray mode and restore all original materials
   */
  const disableXRay = useCallback(() => {
    console.log('Disabling X-ray mode, restoring', originalMaterialsRef.current.size, 'materials')
    
    // Restore all original materials
    originalMaterialsRef.current.forEach(({ mesh, material }) => {
      if (mesh && mesh.material) {
        // Dispose X-ray material if it's different
        if (mesh.material !== material && mesh.material.dispose) {
          mesh.material.dispose()
        }
        mesh.material = material
      }
    })
    
    // Clear the stored materials
    originalMaterialsRef.current.clear()
    selectedIdsRef.current.clear()
    
    setXRayEnabled(false)
  }, [])

  /**
   * Update X-ray selection without disabling/re-enabling
   * Useful when selection changes while X-ray is active
   * @param {string[]} selectedIds - New array of selected globalIds
   */
  const updateXRaySelection = useCallback((selectedIds = []) => {
    if (!xRayEnabled || !sceneRef.current) return
    
    const idsSet = new Set(selectedIds)
    selectedIdsRef.current = idsSet
    
    // Re-apply X-ray with new selection
    sceneRef.current.traverse((object) => {
      if (object.isMesh) {
        const isSelected = isMeshSelected(object, idsSet)
        
        // Get stored original material
        const stored = originalMaterialsRef.current.get(object.uuid)
        if (!stored) return
        
        if (isSelected) {
          // Restore original material
          if (object.material !== stored.material) {
            if (object.material.dispose) object.material.dispose()
            object.material = stored.material
          }
        } else {
          // Apply X-ray material
          if (!object.material.wireframe) {
            object.material = createXRayMaterial()
          }
        }
      }
    })
  }, [xRayEnabled, isMeshSelected, createXRayMaterial])

  /**
   * Toggle X-ray mode
   * @param {string[]} selectedIds - IDs to keep solid when enabling
   */
  const toggleXRay = useCallback((selectedIds = []) => {
    if (xRayEnabled) {
      disableXRay()
    } else {
      enableXRay(selectedIds)
    }
  }, [xRayEnabled, enableXRay, disableXRay])

  return {
    xRayEnabled,
    setScene,
    enableXRay,
    disableXRay,
    updateXRaySelection,
    toggleXRay,
    setXRayForMesh
  }
}

export default useXRayMode
