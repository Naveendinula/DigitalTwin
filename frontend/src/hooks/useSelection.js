import { useState, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildMeshIndex, findMeshGlobalId, isLikelyGlobalId } from '../utils/sceneIndex'
import { debugLog, debugWarn } from '../utils/logger'

// Constants
const HIGHLIGHT_COLOR = 0x00D4FF // Bright cyan
const HIGHLIGHT_EMISSIVE = 0x0088AA // Emissive cyan

/**
 * useSelection Hook
 * 
 * Manages selection state for 3D objects in the scene.
 * Tracks the selected mesh and its original material for restoration.
 * Supports both click selection and programmatic selection by globalId.
 * 
 * @returns {object} Selection state and handlers
 */
function useSelection() {
  // Track multiple selected meshes
  const [selectedMeshes, setSelectedMeshes] = useState(new Set())
  // Map of uuid -> originalMaterial for restoration
  const originalMaterials = useRef(new Map())
  
  // Index for fast lookup: GlobalId -> Mesh[]
  const meshIndex = useRef(new Map())
  
  // Reference to the scene for traversal
  const sceneRef = useRef(null)

  /**
   * Build index of meshes by GlobalId
   */
  const buildIndex = useCallback((scene) => {
    if (!scene) return
    
    debugLog('Building mesh index...')
    const { index, meshes } = buildMeshIndex(scene, {
      ancestorDepth: 5,
      filterAncestorNames: isLikelyGlobalId
    })
    meshIndex.current = index
    debugLog(`Mesh index built: ${index.size} keys for ${meshes.length} meshes`)
  }, [])

  /**
   * Apply highlight to a mesh
   */
  const highlightMesh = useCallback((mesh, options = {}) => {
    if (!mesh || !mesh.material) return

    // Store original material if not already stored
    if (!originalMaterials.current.has(mesh.uuid)) {
       // Prefer userData.originalMaterial if available (from X-Ray or other tools)
       const original = mesh.userData.originalMaterial || mesh.material
       originalMaterials.current.set(mesh.uuid, original)
    }

    // Create highlight material
    // Use MeshBasicMaterial to ensure visibility regardless of lighting
    const highlightMaterial = new THREE.MeshBasicMaterial({
      color: options.color || HIGHLIGHT_COLOR,
      side: THREE.DoubleSide
    })
    
    highlightMaterial.userData = { ...highlightMaterial.userData, isHighlight: true }
    mesh.material = highlightMaterial
  }, [])

  /**
   * Restore original material for a mesh
   */
  const restoreMesh = useCallback((mesh) => {
    if (!mesh) return
    
    if (originalMaterials.current.has(mesh.uuid)) {
      const original = originalMaterials.current.get(mesh.uuid)
      mesh.material = original
      originalMaterials.current.delete(mesh.uuid)
    } else if (mesh.userData?.originalMaterial) {
        // Fallback
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

    // Deselect current
    selectedMeshes.forEach(m => restoreMesh(m))
    
    // Select new
    const newSet = new Set()
    validMeshes.forEach(m => {
        highlightMesh(m, options)
        newSet.add(m)
    })
    
    setSelectedMeshes(newSet)
  }, [selectedMeshes, highlightMesh, restoreMesh])

  /**
   * Clear current selection and restore original material
   */
  const deselect = useCallback(() => {
    selectedMeshes.forEach(m => restoreMesh(m))
    setSelectedMeshes(new Set())
    originalMaterials.current.clear()
    debugLog('Selection cleared')
  }, [selectedMeshes, restoreMesh])

  /**
   * Set the scene reference for mesh traversal
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    debugLog('Selection hook: Scene reference set')
    buildIndex(scene)
  }, [buildIndex])

  /**
   * Find meshes by globalId using index
   */
  const findMeshesByGlobalId = useCallback((globalId) => {
    if (!meshIndex.current.size && sceneRef.current) {
        // Try building index if empty
        buildIndex(sceneRef.current)
    }
    
    if (meshIndex.current.has(globalId)) {
        return Array.from(meshIndex.current.get(globalId))
    }
    
    // Fallback: try fuzzy search or just return empty
    return []
  }, [buildIndex])

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
    if (selectedMeshes.has(mesh) && selectedMeshes.size === 1) {
        deselect()
        return
    }
    
    select(mesh)
  }, [selectedMeshes, select, deselect])

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
    setScene,
    selectById
  }
}

export default useSelection
