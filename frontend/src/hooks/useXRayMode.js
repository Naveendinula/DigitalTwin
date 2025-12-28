import { useState, useCallback, useRef } from 'react'
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
  const meshIndexRef = useRef(new Map())
  const allMeshesRef = useRef([])
  const selectedMeshesRef = useRef(new Set())
  const xrayMeshesRef = useRef(new Set())

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
      // Mark as X-ray material
      xRayMaterialRef.current.userData = { isXRay: true }
    }
    return xRayMaterialRef.current
  }, [])

  const buildMeshIndex = useCallback((scene) => {
    if (!scene) return

    const index = new Map()
    const meshes = []

    scene.traverse((object) => {
      if (!object.isMesh) return
      meshes.push(object)

      const keys = new Set()
      if (object.name) keys.add(object.name)
      if (object.userData?.GlobalId) keys.add(object.userData.GlobalId)

      let ancestor = object.parent
      let depth = 0
      while (ancestor && depth < 5) {
        if (ancestor.name) keys.add(ancestor.name)
        if (ancestor.userData?.GlobalId) keys.add(ancestor.userData.GlobalId)
        ancestor = ancestor.parent
        depth++
      }

      keys.forEach((key) => {
        if (!index.has(key)) {
          index.set(key, new Set())
        }
        index.get(key).add(object)
      })
    })

    meshIndexRef.current = index
    allMeshesRef.current = meshes
  }, [])

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
    // Prefer userData.originalMaterial if available
    let originalMat = mesh.userData.originalMaterial
    
    if (!originalMat) {
        // If not in userData, check if current is safe to store
        if (!mesh.material.userData?.isXRay && !mesh.material.userData?.isHighlight) {
            originalMat = mesh.material
            mesh.userData.originalMaterial = originalMat
        }
    }

    if (!originalMaterialsRef.current.has(mesh.uuid) && originalMat) {
      originalMaterialsRef.current.set(mesh.uuid, {
        mesh,
        material: originalMat
      })
    }
    
    if (isSelected) {
      // Keep original material for selected meshes
      // If it's already highlighted, don't overwrite it
      if (mesh.material.userData?.isHighlight) {
        return
      }

      if (originalMat) {
        mesh.material = originalMat
      }
    } else {
      // Apply X-ray material for non-selected meshes
      mesh.material = getXRayMaterial()
    }
  }, [getXRayMaterial])

  /**
   * Set scene reference
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    buildMeshIndex(scene)
  }, [buildMeshIndex])

  const getMeshesForIds = useCallback((idsSet) => {
    const selectedMeshes = new Set()
    idsSet.forEach((id) => {
      const meshes = meshIndexRef.current.get(id)
      if (meshes) {
        meshes.forEach(mesh => selectedMeshes.add(mesh))
      }
    })
    return selectedMeshes
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
    
    if (!meshIndexRef.current.size || !allMeshesRef.current.length) {
      buildMeshIndex(sceneRef.current)
    }

    const selectedMeshes = getMeshesForIds(idsSet)
    selectedMeshesRef.current = new Set()
    xrayMeshesRef.current = new Set()

    allMeshesRef.current.forEach((mesh) => {
      const isSelected = selectedMeshes.has(mesh)
      setXRayForMesh(mesh, isSelected)
      if (isSelected) {
        selectedMeshesRef.current.add(mesh)
      } else {
        xrayMeshesRef.current.add(mesh)
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
      if (mesh) {
        // Prefer userData.originalMaterial
        const restoreMat = mesh.userData.originalMaterial || material
        
        if (mesh.material !== restoreMat) {
            // Dispose X-ray material if it's different and is actually an X-ray material
            if (mesh.material.userData?.isXRay && mesh.material.dispose) {
                // Don't dispose the shared cached material!
                // Only dispose if it's a clone
                if (mesh.material !== xRayMaterialRef.current) {
                    mesh.material.dispose()
                }
            }
            mesh.material = restoreMat
        }
      }
    })
    
    // Also iterate through scene to catch any stragglers that might be in X-ray mode 
    // but missed in the map (e.g. if added later)
    if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
            if (object.isMesh && object.material && object.material.userData?.isXRay) {
                if (object.userData.originalMaterial) {
                    object.material = object.userData.originalMaterial
                }
            }
        })
    }
    
    // Clear the stored materials
    originalMaterialsRef.current.clear()
    selectedIdsRef.current.clear()
    selectedMeshesRef.current.clear()
    xrayMeshesRef.current.clear()
    
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
    if (idsSet.size === selectedIdsRef.current.size) {
      let unchanged = true
      idsSet.forEach(id => {
        if (!selectedIdsRef.current.has(id)) {
          unchanged = false
        }
      })
      if (unchanged) return
    }
    selectedIdsRef.current = idsSet

    if (!meshIndexRef.current.size || !allMeshesRef.current.length) {
      buildMeshIndex(sceneRef.current)
    }

    let nextSelectedMeshes = getMeshesForIds(idsSet)
    if (selectedIds.length > 0 && nextSelectedMeshes.size === 0) {
      nextSelectedMeshes = new Set()
      allMeshesRef.current.forEach((mesh) => {
        if (isMeshSelected(mesh, idsSet)) {
          nextSelectedMeshes.add(mesh)
        }
      })
    }

    const prevSelected = selectedMeshesRef.current
    const prevSelectedArray = Array.from(prevSelected)
    prevSelectedArray.forEach((mesh) => {
      if (!nextSelectedMeshes.has(mesh)) {
        setXRayForMesh(mesh, false)
        prevSelected.delete(mesh)
        xrayMeshesRef.current.add(mesh)
      }
    })

    nextSelectedMeshes.forEach((mesh) => {
      if (!prevSelected.has(mesh)) {
        setXRayForMesh(mesh, true)
        prevSelected.add(mesh)
        xrayMeshesRef.current.delete(mesh)
      }
    })
  }, [xRayEnabled, isMeshSelected, setXRayForMesh, buildMeshIndex, getMeshesForIds])

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
