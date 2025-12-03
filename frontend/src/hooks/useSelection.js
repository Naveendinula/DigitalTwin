import { useState, useCallback, useMemo, useRef } from 'react'

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
  const [selectedObject, setSelectedObject] = useState(null)
  const [originalMaterial, setOriginalMaterial] = useState(null)
  
  // Reference to the scene for traversal
  const sceneRef = useRef(null)

  // Highlight color for selected objects
  const HIGHLIGHT_COLOR = 0x007AFF // Blue highlight

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
   * Find GlobalId from a mesh or its parents
   * In GLTF files converted from IFC, the Node has the GlobalId, not the Mesh
   */
  const findGlobalId = useCallback((mesh) => {
    if (!mesh) return null
    
    console.log('=== Finding GlobalId ===')
    console.log('Starting from mesh:', mesh.name, 'type:', mesh.type)
    
    // First check if mesh name itself is a GlobalId (unlikely but possible)
    if (isLikelyGlobalId(mesh.name)) {
      console.log('✓ Found GlobalId in mesh name:', mesh.name)
      return mesh.name
    }
    
    // Check userData for GlobalId
    if (mesh.userData?.GlobalId) {
      console.log('✓ Found GlobalId in userData:', mesh.userData.GlobalId)
      return mesh.userData.GlobalId
    }
    
    // Walk up the hierarchy to find a parent with GlobalId as name
    // In GLTF, the Node (parent of Mesh) typically has the GlobalId
    let parent = mesh.parent
    let depth = 0
    while (parent && depth < 10) {
      console.log(`  Parent at depth ${depth}: name="${parent.name}", type=${parent.type}`)
      
      // Check if parent name looks like a GlobalId
      if (isLikelyGlobalId(parent.name)) {
        console.log(`✓ Found GlobalId in parent (depth ${depth}):`, parent.name)
        return parent.name
      }
      
      // Check parent userData
      if (parent.userData?.GlobalId) {
        console.log('✓ Found GlobalId in parent userData:', parent.userData.GlobalId)
        return parent.userData.GlobalId
      }
      
      parent = parent.parent
      depth++
    }
    
    // Fallback: return mesh name even if it doesn't look like a GlobalId
    // This helps with debugging
    if (mesh.name && mesh.name.length > 0) {
      console.log('⚠ Using mesh name as fallback (not a GlobalId):', mesh.name)
      return mesh.name
    }
    
    console.log('✗ No GlobalId found for mesh')
    return null
  }, [])

  /**
   * Handle selection of a mesh
   */
  const select = useCallback((mesh) => {
    if (!mesh) return

    // Store original material for later restoration
    if (mesh.material) {
      setOriginalMaterial(mesh.material.clone())
    }
    setSelectedObject(mesh)

    // Apply highlight
    if (mesh.material) {
      mesh.material = mesh.material.clone()
      mesh.material.color.setHex(HIGHLIGHT_COLOR)
      if (mesh.material.emissive) {
        mesh.material.emissive.setHex(HIGHLIGHT_COLOR)
        mesh.material.emissiveIntensity = 0.3
      }
    }
  }, [])

  /**
   * Clear current selection and restore original material
   */
  const deselect = useCallback(() => {
    if (selectedObject && originalMaterial) {
      selectedObject.material = originalMaterial
    }
    setSelectedObject(null)
    setOriginalMaterial(null)
    console.log('Selection cleared')
  }, [selectedObject, originalMaterial])

  /**
   * Set the scene reference for mesh traversal
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
    console.log('Selection hook: Scene reference set')
  }, [])

  /**
   * Find mesh by globalId in the scene
   * Traverses the scene graph looking for matching object names, ancestor names, or userData.GlobalId
   * Handles nested hierarchies (e.g., stairs with stair flights)
   */
  const findMeshByGlobalId = useCallback((globalId) => {
    if (!sceneRef.current || !globalId) return null
    
    let foundMesh = null
    let foundByAncestor = null
    let foundByContains = null
    
    console.log('Searching for globalId:', globalId)
    
    sceneRef.current.traverse((object) => {
      if (foundMesh) return
      
      // Check if this object's name matches the globalId exactly
      if (object.name === globalId) {
        console.log('✓ Exact name match:', object.name, 'type:', object.type)
        if (object.isMesh) {
          foundMesh = object
        } else {
          object.traverse((child) => {
            if (!foundMesh && child.isMesh) {
              foundMesh = child
            }
          })
        }
        return
      }
      
      // Check userData.GlobalId
      if (object.userData?.GlobalId === globalId) {
        console.log('✓ userData.GlobalId match:', object.name)
        if (object.isMesh) {
          foundMesh = object
        } else {
          object.traverse((child) => {
            if (!foundMesh && child.isMesh) {
              foundMesh = child
            }
          })
        }
        return
      }
      
      // Check if object name contains the globalId
      if (!foundByContains && object.name && object.name.includes(globalId)) {
        if (object.isMesh) {
          foundByContains = object
        } else {
          object.traverse((child) => {
            if (!foundByContains && child.isMesh) {
              foundByContains = child
            }
          })
        }
      }
      
      // For meshes, check the ENTIRE ancestor chain
      if (!foundMesh && !foundByAncestor && object.isMesh) {
        let ancestor = object.parent
        let depth = 0
        const maxDepth = 10
        
        while (ancestor && depth < maxDepth) {
          if (ancestor.name === globalId) {
            console.log('✓ Ancestor name match at depth', depth, ':', ancestor.name)
            foundByAncestor = object
            break
          }
          if (ancestor.userData?.GlobalId === globalId) {
            foundByAncestor = object
            break
          }
          ancestor = ancestor.parent
          depth++
        }
      }
    })
    
    const result = foundMesh || foundByAncestor || foundByContains
    if (result) {
      console.log('Found mesh:', result.name, 'parent:', result.parent?.name)
    } else {
      console.warn('No mesh found for globalId:', globalId)
    }
    
    return result
  }, [])

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
    
    // Try to find a mesh for any of the IDs (useful when parent doesn't exist but children do)
    let mesh = null
    let matchedId = null
    
    for (const id of ids) {
      mesh = findMeshByGlobalId(id)
      if (mesh) {
        matchedId = id
        break
      }
    }
    
    if (mesh) {
      console.log('Found mesh for globalId:', matchedId, mesh.name)
      // Deselect previous before selecting new
      if (selectedObject && originalMaterial) {
        selectedObject.material = originalMaterial
      }
      select(mesh)
    } else {
      console.warn('No mesh found for any of the globalIds:', ids.slice(0, 3).join(', '), ids.length > 3 ? `... and ${ids.length - 3} more` : '')
    }
  }, [findMeshByGlobalId, selectedObject, originalMaterial, select, deselect])

  /**
   * Handle click - select new object or deselect if same/empty
   */
  const handleSelect = useCallback((mesh) => {
    // If clicking the same object, deselect
    if (mesh && selectedObject && mesh.uuid === selectedObject.uuid) {
      deselect()
      return
    }

    // Deselect previous before selecting new
    if (selectedObject && originalMaterial) {
      selectedObject.material = originalMaterial
    }

    if (mesh) {
      select(mesh)
    } else {
      deselect()
    }
  }, [selectedObject, originalMaterial, select, deselect])

  // Extract GlobalId from selected object - use useMemo for proper recalculation
  const selectedId = useMemo(() => {
    if (!selectedObject) return null
    const id = findGlobalId(selectedObject)
    console.log('=== Selected ID computed ===')
    console.log('selectedObject:', selectedObject?.name)
    console.log('selectedId:', id)
    return id
  }, [selectedObject, findGlobalId])

  return {
    selectedObject,
    selectedId,
    handleSelect,
    deselect,
    setScene,
    selectById
  }
}

export default useSelection
