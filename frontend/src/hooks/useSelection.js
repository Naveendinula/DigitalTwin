import { useState, useCallback } from 'react'

/**
 * useSelection Hook
 * 
 * Manages selection state for 3D objects in the scene.
 * Tracks the selected mesh and its original material for restoration.
 * 
 * @returns {object} Selection state and handlers
 */
function useSelection() {
  const [selectedObject, setSelectedObject] = useState(null)
  const [originalMaterial, setOriginalMaterial] = useState(null)

  // Highlight color for selected objects
  const HIGHLIGHT_COLOR = 0xffff00 // Bright yellow

  /**
   * Handle selection of a mesh
   */
  const select = useCallback((mesh) => {
    if (!mesh) return

    // Store original material for later restoration
    setOriginalMaterial(mesh.material.clone())
    setSelectedObject(mesh)

    // Apply highlight
    if (mesh.material) {
      mesh.material = mesh.material.clone()
      mesh.material.color.setHex(HIGHLIGHT_COLOR)
      mesh.material.emissive?.setHex(HIGHLIGHT_COLOR)
      mesh.material.emissiveIntensity = 0.3
    }

    // Log the GlobalId (mesh name)
    console.log('Selected object GlobalId:', mesh.name)
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

  return {
    selectedObject,
    selectedId: selectedObject?.name || null,
    handleSelect,
    deselect
  }
}

export default useSelection
