import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'
import { buildMeshIndex, getMeshesForIds, isLikelyGlobalId, isMeshMatchingIds } from '../utils/sceneIndex'
import { debugLog, debugWarn } from '../utils/logger'

/**
 * useXRayMode Hook
 * 
 * Implements X-ray/ghost effect for non-selected elements.
 * When enabled, non-selected meshes become semi-transparent wireframes
 * or ghosted solids while selected meshes remain solid with their original materials.
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
  
  // Cached X-ray materials (shared instances for performance)
  const xRayMaterialRef = useRef(null)
  const ghostMaterialRef = useRef(null)
  const xRayModeRef = useRef('wireframe')
  const meshIndexRef = useRef(new Map())
  const allMeshesRef = useRef([])
  const selectedMeshesRef = useRef(new Set())
  const xrayMeshesRef = useRef(new Set())

  /**
   * Get or create cached X-ray material
   * Dark wireframe or ghosted solid depending on mode
   */
  const getXRayMaterial = useCallback((mode = xRayModeRef.current) => {
    const resolvedMode = mode === 'ghost' ? 'ghost' : 'wireframe'
    if (resolvedMode === 'ghost') {
      if (!ghostMaterialRef.current) {
        ghostMaterialRef.current = new THREE.MeshBasicMaterial({
          color: 0x7f8799,        // Soft cool gray
          wireframe: false,
          transparent: true,
          opacity: 0.15,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
        ghostMaterialRef.current.userData = { isXRay: true, mode: 'ghost' }
      }
      return ghostMaterialRef.current
    }

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
      xRayMaterialRef.current.userData = { isXRay: true, mode: 'wireframe' }
    }
    return xRayMaterialRef.current
  }, [])

  const buildSceneIndex = useCallback((scene) => {
    if (!scene) return
    // Only index IFC-like meshes (by GlobalId/userData or GlobalId-like ancestor names).
    // This avoids applying X-ray materials to overlay text/auxiliary meshes (e.g. troika Text).
    const { index, meshes } = buildMeshIndex(scene, {
      ancestorDepth: 5,
      includeName: false,
      includeUserData: true,
      filterAncestorNames: isLikelyGlobalId
    })
    meshIndexRef.current = index
    const indexedMeshes = new Set()
    index.forEach((meshSet) => {
      meshSet.forEach((mesh) => indexedMeshes.add(mesh))
    })
    allMeshesRef.current = indexedMeshes.size > 0 ? Array.from(indexedMeshes) : meshes
  }, [])

  /**
   * Apply X-ray effect to a single mesh
   * @param {THREE.Mesh} mesh - The mesh to modify
   * @param {boolean} isSelected - Whether this mesh is selected
   */
  const setXRayForMesh = useCallback((mesh, isSelected, mode) => {
    if (!mesh.isMesh) return

    let currentMaterial = null
    try {
      currentMaterial = mesh.material
    } catch {
      // Some custom meshes (e.g. troika text internals) can throw on material access.
      return
    }
    if (!currentMaterial || Array.isArray(currentMaterial)) return
    
    // Skip meshes that are part of helpers, grids, etc.
    if (mesh.type === 'GridHelper' || mesh.type === 'AxesHelper') return
    if (mesh.name?.includes('Helper') || mesh.name?.includes('Grid')) return
    
    // Store original material if not already stored
    // Prefer userData.originalMaterial if available
    let originalMat = mesh.userData.originalMaterial
    
    if (!originalMat) {
        // If not in userData, check if current is safe to store
        if (!currentMaterial.userData?.isXRay && !currentMaterial.userData?.isHighlight) {
            originalMat = currentMaterial
            mesh.userData.originalMaterial = originalMat
        }
    }

    if (!originalMaterialsRef.current.has(mesh.uuid) && originalMat) {
      originalMaterialsRef.current.set(mesh.uuid, {
        mesh,
        material: originalMat
      })
    }
    
    if (!isSelected && currentMaterial.userData?.isHighlight) {
      // Preserve selection highlight even if ID matching fails while X-ray is active.
      return
    }

    if (isSelected) {
      // Keep original material for selected meshes
      // If it's already highlighted, don't overwrite it
      if (currentMaterial.userData?.isHighlight) {
        return
      }

      if (originalMat) {
        mesh.material = originalMat
      }
    } else {
      // Apply X-ray material for non-selected meshes
      const resolvedMode = mode || xRayModeRef.current
      mesh.material = getXRayMaterial(resolvedMode)
    }
  }, [getXRayMaterial])

  /**
   * Set scene reference
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    buildSceneIndex(scene)
  }, [buildSceneIndex])

  /**
   * Enable X-ray mode with selected elements
   * @param {string[]} selectedIds - Array of globalIds that should remain solid
   */
  const enableXRay = useCallback((selectedIds = [], options = {}) => {
    if (!sceneRef.current) {
      debugWarn('useXRayMode: Scene not set')
      return
    }

    const resolvedMode = options.mode === 'ghost' ? 'ghost' : 'wireframe'
    xRayModeRef.current = resolvedMode
    
    const idsSet = new Set(selectedIds)
    selectedIdsRef.current = idsSet
    
    debugLog('Enabling X-ray mode:', resolvedMode, 'selected IDs:', selectedIds)
    
    if (!meshIndexRef.current.size || !allMeshesRef.current.length) {
      buildSceneIndex(sceneRef.current)
    }

    const selectedMeshes = getMeshesForIds(idsSet, meshIndexRef.current)
    selectedMeshesRef.current = new Set()
    xrayMeshesRef.current = new Set()

    allMeshesRef.current.forEach((mesh) => {
      const isSelected = selectedMeshes.has(mesh)
      setXRayForMesh(mesh, isSelected, resolvedMode)
      if (isSelected) {
        selectedMeshesRef.current.add(mesh)
      } else {
        xrayMeshesRef.current.add(mesh)
      }
    })
    
    setXRayEnabled(true)
  }, [buildSceneIndex, setXRayForMesh])

  /**
   * Disable X-ray mode and restore all original materials
   */
  const disableXRay = useCallback(() => {
    debugLog('Disabling X-ray mode, restoring', originalMaterialsRef.current.size, 'materials')
    
    // Restore all original materials
    originalMaterialsRef.current.forEach(({ mesh, material }) => {
      if (mesh) {
        // Prefer userData.originalMaterial
        const restoreMat = mesh.userData.originalMaterial || material
        
         let meshMaterial = null
         try {
           meshMaterial = mesh.material
         } catch {
           return
         }

         if (meshMaterial !== restoreMat) {
             // Dispose X-ray material if it's different and is actually an X-ray material
            if (meshMaterial?.userData?.isXRay && meshMaterial.dispose) {
                // Don't dispose the shared cached material!
                // Only dispose if it's a clone
                if (meshMaterial !== xRayMaterialRef.current && meshMaterial !== ghostMaterialRef.current) {
                    meshMaterial.dispose()
                }
            }
            mesh.material = restoreMat
         }
      }
    })
    
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
  const updateXRaySelection = useCallback((selectedIds = [], options = {}) => {
    if (!xRayEnabled || !sceneRef.current) return

    const resolvedMode = options.mode === 'ghost' ? 'ghost' : options.mode === 'wireframe' ? 'wireframe' : xRayModeRef.current
    if (resolvedMode !== xRayModeRef.current) {
      xRayModeRef.current = resolvedMode
      xrayMeshesRef.current.forEach((mesh) => {
        if (mesh?.material?.userData?.isXRay) {
          mesh.material = getXRayMaterial(resolvedMode)
        }
      })
    }
    
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
      buildSceneIndex(sceneRef.current)
    }

    let nextSelectedMeshes = getMeshesForIds(idsSet, meshIndexRef.current)
    if (selectedIds.length > 0 && nextSelectedMeshes.size === 0) {
      nextSelectedMeshes = new Set()
      allMeshesRef.current.forEach((mesh) => {
        if (isMeshMatchingIds(mesh, idsSet)) {
          nextSelectedMeshes.add(mesh)
        }
      })
    }

    const prevSelected = selectedMeshesRef.current
    const prevSelectedArray = Array.from(prevSelected)
    prevSelectedArray.forEach((mesh) => {
      if (!nextSelectedMeshes.has(mesh)) {
        setXRayForMesh(mesh, false, resolvedMode)
        prevSelected.delete(mesh)
        xrayMeshesRef.current.add(mesh)
      }
    })

    nextSelectedMeshes.forEach((mesh) => {
      if (!prevSelected.has(mesh)) {
        setXRayForMesh(mesh, true, resolvedMode)
        prevSelected.add(mesh)
        xrayMeshesRef.current.delete(mesh)
      }
    })
  }, [xRayEnabled, setXRayForMesh, buildSceneIndex, getXRayMaterial])

  /**
   * Toggle X-ray mode
   * @param {string[]} selectedIds - IDs to keep solid when enabling
   */
  const toggleXRay = useCallback((selectedIds = [], options = {}) => {
    if (xRayEnabled) {
      disableXRay()
    } else {
      enableXRay(selectedIds, options)
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
