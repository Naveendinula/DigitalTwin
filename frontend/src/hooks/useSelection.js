import { useState, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { findMeshGlobalId } from '../utils/sceneIndex'
import { debugLog, debugWarn } from '../utils/logger'

// Constants
const HIGHLIGHT_COLOR = 0x00D4FF // Bright cyan

/**
 * useSelection Hook
 * 
 * Manages selection state for 3D objects in the scene.
 * Tracks the selected mesh and its original material for restoration.
 * Supports both click selection and programmatic selection by globalId.
 * 
 * Now accepts a shared scene-index via `sceneIndex` parameter
 * instead of building its own (eliminates a redundant full-scene traversal).
 *
 * @param {object} [options]
 * @param {object} [options.sceneIndex] - Shared index from useSceneIndex
 * @returns {object} Selection state and handlers
 */
function useSelection({ sceneIndex } = {}) {
  // Track multiple selected meshes
  const [selectedMeshes, setSelectedMeshes] = useState(new Set())
  // Mirror of selectedMeshes as a ref – readable synchronously (avoids stale closure)
  const selectedMeshesRef = useRef(new Set())
  // Map of uuid -> originalMaterial for restoration
  const originalMaterials = useRef(new Map())

  // Cached highlight material – single shared instance (perf: avoid alloc per mesh)
  const highlightMatRef = useRef(null)

  /** Update both state (for React renders) and ref (for synchronous reads). */
  const setSelectedMeshesSync = useCallback((newSet) => {
    selectedMeshesRef.current = newSet
    setSelectedMeshes(newSet)
  }, [])

  /**
   * Get or create the cached highlight material.
   * When a custom color is provided, a one-off material is created
   * (rare path – only EC heatmap uses this).
   */
  const getHighlightMaterial = useCallback((color) => {
    if (color != null) {
      // Custom color requested – create a disposable material
      const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide })
      mat.userData = { isHighlight: true }
      return mat
    }
    if (!highlightMatRef.current) {
      highlightMatRef.current = new THREE.MeshBasicMaterial({
        color: HIGHLIGHT_COLOR,
        side: THREE.DoubleSide,
      })
      highlightMatRef.current.userData = { isHighlight: true }
    }
    return highlightMatRef.current
  }, [])

  /**
   * Apply highlight to a mesh
   */
  const highlightMesh = useCallback((mesh, options = {}) => {
    if (!mesh || !mesh.material) return

    // Store the CURRENT material so restoreMesh returns the mesh to whatever
    // visual state it was in before the highlight (could be ghost/xray/original).
    if (!originalMaterials.current.has(mesh.uuid)) {
       originalMaterials.current.set(mesh.uuid, mesh.material)
    }

    mesh.material = getHighlightMaterial(options.color)
  }, [getHighlightMaterial])

  /**
   * Restore material for a mesh to whatever it was before highlight.
   * If X-ray/ghost was applied between highlight and restore, skip –
   * the X-ray system now owns this mesh's material.
   */
  const restoreMesh = useCallback((mesh) => {
    if (!mesh) return

    // If the mesh currently has an X-ray/ghost material it means enableXRay
    // already re-assigned it after selection.  Don't overwrite.
    let currentMat = null
    try { currentMat = mesh.material } catch { return }
    if (currentMat?.userData?.isXRay) {
      originalMaterials.current.delete(mesh.uuid)
      return
    }

    if (originalMaterials.current.has(mesh.uuid)) {
      mesh.material = originalMaterials.current.get(mesh.uuid)
      originalMaterials.current.delete(mesh.uuid)
    } else if (mesh.userData?.originalMaterial) {
      mesh.material = mesh.userData.originalMaterial
    }
  }, [])

  /**
   * Select meshes
   */
  const select = useCallback((meshes, options = {}) => {
    const meshArray = Array.isArray(meshes) ? meshes : [meshes]
    const validMeshes = meshArray.filter(m => m && m.isMesh)
    
    if (validMeshes.length === 0) return

    // Deselect current – read from ref to avoid stale-closure issues
    selectedMeshesRef.current.forEach(m => restoreMesh(m))
    
    // Select new
    const newSet = new Set()
    validMeshes.forEach(m => {
        highlightMesh(m, options)
        newSet.add(m)
    })
    
    setSelectedMeshesSync(newSet)
  }, [highlightMesh, restoreMesh, setSelectedMeshesSync])

  /**
   * Clear current selection and restore original material
   */
  const deselect = useCallback(() => {
    selectedMeshesRef.current.forEach(m => restoreMesh(m))
    setSelectedMeshesSync(new Set())
    originalMaterials.current.clear()
    debugLog('Selection cleared')
  }, [restoreMesh, setSelectedMeshesSync])

  /**
   * Find meshes by globalId using the shared index.
   */
  const findMeshesByGlobalId = useCallback((globalId) => {
    const index = sceneIndex?.indexRef?.current
    if (!index || !index.size) return []

    if (index.has(globalId)) {
      return Array.from(index.get(globalId))
    }
    return []
  }, [sceneIndex])

  /**
   * Select element(s) by globalId - used for programmatic selection from tree
   * @param {string | string[]} globalIds - Single globalId or array of globalIds
   * @param {object} options - Selection options (color, pulse)
   */
  const selectById = useCallback((globalIds, options = {}) => {
    if (!globalIds) {
      deselect()
      return
    }
    
    // Normalize to array
    const ids = Array.isArray(globalIds) ? globalIds : [globalIds]
    
    if (ids.length === 0) {
      deselect()
      return
    }
    
    debugLog('Selecting by ID:', ids)
    
    const meshesToSelect = []
    for (const id of ids) {
        const found = findMeshesByGlobalId(id)
        if (found && found.length > 0) {
            meshesToSelect.push(...found)
        }
    }
    
    if (meshesToSelect.length > 0) {
        debugLog(`Found ${meshesToSelect.length} meshes for selection`)
        select(meshesToSelect, options)
    } else {
        debugWarn('No meshes found for IDs')
        deselect()
    }
  }, [findMeshesByGlobalId, select, deselect])

  /**
   * Handle click - select new object or deselect if same/empty
   */
  const handleSelect = useCallback((mesh) => {
    if (!mesh) {
        deselect()
        return
    }
    
    // If clicking already selected, deselect
    if (selectedMeshesRef.current.has(mesh) && selectedMeshesRef.current.size === 1) {
        deselect()
        return
    }
    
    select(mesh)
  }, [select, deselect])

  // Extract GlobalId from selected object - use useMemo for proper recalculation
  const selectedId = useMemo(() => {
    if (selectedMeshes.size === 0) return null
    // Return the ID of the first mesh
    const firstMesh = selectedMeshes.values().next().value
    return findMeshGlobalId(firstMesh, { allowNameFallback: true })
  }, [selectedMeshes])

  return {
    selectedObject: selectedMeshes.size > 0 ? selectedMeshes.values().next().value : null,
    selectedId,
    handleSelect,
    deselect,
    selectById
  }
}

export default useSelection
