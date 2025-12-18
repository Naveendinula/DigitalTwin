import { useState, useCallback, useMemo, useRef } from 'react'
import * as THREE from 'three'

// Constants
const HIGHLIGHT_COLOR = 0x00D4FF // Bright cyan
const HIGHLIGHT_EMISSIVE = 0x0088AA // Emissive cyan

/**
 * Check if a string looks like an IFC GlobalId
 * IFC GlobalIds are 22 characters, base64-like encoded
 */
const isLikelyGlobalId = (str) => {
  if (!str || typeof str !== 'string') return false
  // GlobalIds are typically 22 chars and alphanumeric with $ and _
  // They don't contain "openings" or other descriptive text
  if (str.includes('-') || str.includes('openings')) return false
  if (str === 'Scene' || str === 'RootNode') return false
  // Most GlobalIds start with a digit or letter
  return str.length >= 20 && str.length <= 24
}

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
    
    console.log('Building mesh index...')
    const index = new Map()
    let count = 0
    
    scene.traverse((object) => {
      if (!object.isMesh) return
      
      // Keys to index this mesh by
      const keys = new Set()
      
      // 1. Exact name
      if (object.name) keys.add(object.name)
      
      // 2. userData.GlobalId
      if (object.userData?.GlobalId) keys.add(object.userData.GlobalId)
      
      // 3. Parent/Ancestor names (up to a limit)
      let ancestor = object.parent
      let depth = 0
      while (ancestor && depth < 5) {
        if (ancestor.name && isLikelyGlobalId(ancestor.name)) {
          keys.add(ancestor.name)
        }
        if (ancestor.userData?.GlobalId) {
          keys.add(ancestor.userData.GlobalId)
        }
        ancestor = ancestor.parent
        depth++
      }
      
      // Add to index
      keys.forEach(key => {
        if (!index.has(key)) {
          index.set(key, [])
        }
        index.get(key).push(object)
      })
      
      count++
    })
    
    meshIndex.current = index
    console.log(`Mesh index built: ${index.size} keys for ${count} meshes`)
  }, [])

  /**
   * Find GlobalId from a mesh or its parents
   * In GLTF files converted from IFC, the Node has the GlobalId, not the Mesh
   */
  const findGlobalId = useCallback((mesh) => {
    if (!mesh) return null
    
    // First check if mesh name itself is a GlobalId (unlikely but possible)
    if (isLikelyGlobalId(mesh.name)) {
      return mesh.name
    }
    
    // Check userData for GlobalId
    if (mesh.userData?.GlobalId) {
      return mesh.userData.GlobalId
    }
    
    // Walk up the hierarchy to find a parent with GlobalId as name
    // In GLTF, the Node (parent of Mesh) typically has the GlobalId
    let parent = mesh.parent
    let depth = 0
    while (parent && depth < 10) {
      // Check if parent name looks like a GlobalId
      if (isLikelyGlobalId(parent.name)) {
        return parent.name
      }
      
      // Check parent userData
      if (parent.userData?.GlobalId) {
        return parent.userData.GlobalId
      }
      
      parent = parent.parent
      depth++
    }
    
    // Fallback: return mesh name even if it doesn't look like a GlobalId
    if (mesh.name && mesh.name.length > 0) {
      return mesh.name
    }
    
    return null
  }, [])

  /**
   * Apply highlight to a mesh
   */
  const highlightMesh = useCallback((mesh) => {
    if (!mesh || !mesh.material) return

    // Store original material if not already stored
    if (!originalMaterials.current.has(mesh.uuid)) {
       // Prefer userData.originalMaterial if available (from X-Ray or other tools)
       const original = mesh.userData.originalMaterial || mesh.material
       originalMaterials.current.set(mesh.uuid, original)
    }

    // Create highlight material
    const baseMaterial = originalMaterials.current.get(mesh.uuid)
    const highlightMaterial = baseMaterial.clone()
    highlightMaterial.color.setHex(HIGHLIGHT_COLOR)
    highlightMaterial.transparent = true
    highlightMaterial.opacity = 1 // Solid highlight
    
    if (highlightMaterial.emissive) {
      highlightMaterial.emissive.setHex(HIGHLIGHT_EMISSIVE)
      highlightMaterial.emissiveIntensity = 0.5
    }
    
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
  const select = useCallback((meshes) => {
    const meshArray = Array.isArray(meshes) ? meshes : [meshes]
    const validMeshes = meshArray.filter(m => m && m.isMesh)
    
    if (validMeshes.length === 0) return

    // Deselect current
    selectedMeshes.forEach(m => restoreMesh(m))
    
    // Select new
    const newSet = new Set()
    validMeshes.forEach(m => {
        highlightMesh(m)
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
    console.log('Selection cleared')
  }, [selectedMeshes, restoreMesh])

  /**
   * Set the scene reference for mesh traversal
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    console.log('Selection hook: Scene reference set')
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
        return meshIndex.current.get(globalId)
    }
    
    // Fallback: try fuzzy search or just return empty
    return []
  }, [buildIndex])

  /**
   * Select element(s) by globalId - used for programmatic selection from tree
   * @param {string | string[]} globalIds - Single globalId or array of globalIds
   */
  const selectById = useCallback((globalIds) => {
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
    
    console.log('Selecting by ID:', ids)
    
    const meshesToSelect = []
    for (const id of ids) {
        const found = findMeshesByGlobalId(id)
        if (found && found.length > 0) {
            meshesToSelect.push(...found)
        }
    }
    
    if (meshesToSelect.length > 0) {
        console.log(`Found ${meshesToSelect.length} meshes for selection`)
        select(meshesToSelect)
    } else {
        console.warn('No meshes found for IDs')
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
    return findGlobalId(firstMesh)
  }, [selectedMeshes, findGlobalId])

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
