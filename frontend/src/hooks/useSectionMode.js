import { useState, useCallback, useRef } from 'react'
import * as THREE from 'three'

/**
 * @typedef {Object} SectionPickResult
 * @property {THREE.Vector3} point - Hit position in world coordinates
 * @property {THREE.Vector3} normal - Face normal in world space (normalized)
 * @property {THREE.Mesh} [mesh] - The clicked mesh (optional)
 * @property {string} [globalId] - IFC element GlobalId if available (optional)
 */

/**
 * @typedef {Object} ActiveSectionPlaneState
 * @property {THREE.Plane} plane - The THREE.Plane object for clipping
 * @property {THREE.Vector3} origin - The origin point on the plane
 * @property {THREE.Vector3} normal - The plane normal (normalized, facing camera)
 * @property {number} offset - Extra distance along normal from origin
 * @property {string} [sourceLabel] - IFC type or element name if available
 */

/**
 * useSectionMode Hook
 * 
 * Manages section mode state for creating clipping planes from surface picks.
 * Handles raycasting to determine hit points and face normals.
 * Applies clipping planes to all materials in the scene.
 * 
 * Features:
 * - sectionModeEnabled: Whether section feature is active (UI visible, clipping applied)
 * - sectionPlanePickingEnabled: Whether clicking can define/change the plane
 * - Auto-locks plane after picking to prevent accidental changes
 * - Shift+Click always allows re-picking even when locked
 * 
 * @returns {object} Section mode state and controls
 */
function useSectionMode() {
  // Section mode enabled state (feature on/off)
  const [sectionModeEnabled, setSectionModeEnabledState] = useState(false)
  
  // Section plane picking enabled (can click to define/change plane)
  const [sectionPlanePickingEnabled, setSectionPlanePickingEnabledState] = useState(false)
  
  // Active section plane state (full state object)
  const [activeSectionPlane, setActiveSectionPlaneState] = useState(null)
  
  // Reference to the Three.js scene
  const sceneRef = useRef(null)
  
  // Reference to the camera
  const cameraRef = useRef(null)
  
  // Reference to the WebGL renderer
  const rendererRef = useRef(null)
  
  // Reference to OrbitControls
  const controlsRef = useRef(null)
  
  // Raycaster for picking
  const raycasterRef = useRef(new THREE.Raycaster())
  
  // Store original material clipping planes for restoration
  const originalClippingPlanesRef = useRef(new Map())

  /**
   * Set the scene reference for raycasting
   */
  const setScene = useCallback((scene) => {
    sceneRef.current = scene
  }, [])

  /**
   * Set the camera reference for raycasting
   */
  const setCamera = useCallback((camera) => {
    cameraRef.current = camera
  }, [])

  /**
   * Set the renderer reference for clipping
   */
  const setRenderer = useCallback((renderer) => {
    rendererRef.current = renderer
    // Enable local clipping on the renderer
    if (renderer) {
      renderer.localClippingEnabled = true
      console.log('Renderer local clipping enabled')
    }
  }, [])

  /**
   * Set the OrbitControls reference for camera alignment
   */
  const setControls = useCallback((controls) => {
    controlsRef.current = controls
  }, [])

  /**
   * Apply clipping plane to all materials in the scene
   * 
   * @param {THREE.Plane | null} plane - The clipping plane, or null to clear
   */
  const applyClippingPlaneToMaterials = useCallback((plane) => {
    if (!sceneRef.current) return

    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.material) {
        const materials = Array.isArray(object.material) 
          ? object.material 
          : [object.material]
        
        materials.forEach((material) => {
          // Store original clipping planes and polygon offset if not already stored
          if (!originalClippingPlanesRef.current.has(material.uuid)) {
            originalClippingPlanesRef.current.set(
              material.uuid, 
              {
                clippingPlanes: material.clippingPlanes ? [...material.clippingPlanes] : null,
                polygonOffset: material.polygonOffset,
                polygonOffsetFactor: material.polygonOffsetFactor,
                polygonOffsetUnits: material.polygonOffsetUnits
              }
            )
          }

          if (plane) {
            // Apply the clipping plane
            material.clippingPlanes = [plane]
            material.clipShadows = true
            // Enable polygon offset to prevent Z-fighting at cut edges
            material.polygonOffset = true
            material.polygonOffsetFactor = 1
            material.polygonOffsetUnits = 1
            material.needsUpdate = true
          } else {
            // Restore original or clear
            const original = originalClippingPlanesRef.current.get(material.uuid)
            if (original) {
              material.clippingPlanes = original.clippingPlanes
              material.polygonOffset = original.polygonOffset || false
              material.polygonOffsetFactor = original.polygonOffsetFactor || 0
              material.polygonOffsetUnits = original.polygonOffsetUnits || 0
            } else {
              material.clippingPlanes = null
              material.polygonOffset = false
            }
            material.clipShadows = false
            material.needsUpdate = true
          }
        })
      }
    })

    console.log(`Clipping plane ${plane ? 'applied' : 'cleared'} on all materials`)
  }, [])

  /**
   * Set the active section plane state and apply clipping
   * 
   * @param {ActiveSectionPlaneState | null} state - The new state, or null to clear
   */
  const setActiveSectionPlane = useCallback((state) => {
    setActiveSectionPlaneState(state)

    if (state === null) {
      // Clear clipping planes from materials
      applyClippingPlaneToMaterials(null)
      console.log('Active section plane cleared')
    } else {
      // Apply the clipping plane to all materials
      applyClippingPlaneToMaterials(state.plane)
      console.log('Active section plane set:', {
        origin: `(${state.origin.x.toFixed(2)}, ${state.origin.y.toFixed(2)}, ${state.origin.z.toFixed(2)})`,
        normal: `(${state.normal.x.toFixed(2)}, ${state.normal.y.toFixed(2)}, ${state.normal.z.toFixed(2)})`,
        offset: state.offset,
        sourceLabel: state.sourceLabel
      })
    }
  }, [applyClippingPlaneToMaterials])

  /**
   * Update the plane offset (distance along normal)
   * 
   * @param {number} newOffset - The new offset value
   */
  const updatePlaneOffset = useCallback((newOffset) => {
    if (!activeSectionPlane) return

    const { origin, normal } = activeSectionPlane
    
    // Create new plane with offset
    const offsetPoint = origin.clone().addScaledVector(normal, newOffset)
    const newPlane = new THREE.Plane()
    newPlane.setFromNormalAndCoplanarPoint(normal, offsetPoint)

    const newState = {
      ...activeSectionPlane,
      plane: newPlane,
      offset: newOffset
    }

    setActiveSectionPlane(newState)
  }, [activeSectionPlane, setActiveSectionPlane])

  /**
   * Nudge the plane by a delta amount along its normal
   * Positive delta moves the plane forward (in normal direction)
   * Negative delta moves it backward
   * 
   * @param {number} delta - The amount to nudge (can be positive or negative)
   */
  const nudgeSectionPlane = useCallback((delta) => {
    if (!activeSectionPlane) return

    const newOffset = activeSectionPlane.offset + delta
    updatePlaneOffset(newOffset)
    
    console.log(`Section plane nudged by ${delta.toFixed(2)}, new offset: ${newOffset.toFixed(2)}`)
  }, [activeSectionPlane, updatePlaneOffset])

  /**
   * Reset the plane offset back to 0 (original position)
   */
  const resetPlaneOffset = useCallback(() => {
    if (!activeSectionPlane) return
    updatePlaneOffset(0)
    console.log('Section plane offset reset to 0')
  }, [activeSectionPlane, updatePlaneOffset])

  /**
   * Calculate model bounding sphere radius for camera distance calculation
   */
  const getModelBoundingSphereRadius = useCallback(() => {
    if (!sceneRef.current) return 10 // Default fallback
    
    const box = new THREE.Box3()
    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.visible) {
        box.expandByObject(object)
      }
    })
    
    if (box.isEmpty()) return 10
    
    const sphere = new THREE.Sphere()
    box.getBoundingSphere(sphere)
    return sphere.radius
  }, [])

  /**
   * Get the default nudge step based on model scale
   */
  const getNudgeStep = useCallback(() => {
    const radius = getModelBoundingSphereRadius()
    // Use 2% of model radius as default step, with min/max bounds
    const step = Math.max(0.1, Math.min(radius * 0.02, 5))
    return step
  }, [getModelBoundingSphereRadius])

  /**
   * Enable or disable section mode
   * When enabled, also enables picking for the first plane
   * When disabled, also clears any active section plane and disables picking
   * 
   * @param {boolean} enabled - Whether section mode should be enabled
   */
  const setSectionMode = useCallback((enabled) => {
    setSectionModeEnabledState(enabled)
    
    if (!enabled) {
      // Clear active section plane and disable picking when disabling
      setSectionPlanePickingEnabledState(false)
      setActiveSectionPlane(null)
    } else {
      // Enable picking when turning on section mode (for first plane)
      setSectionPlanePickingEnabledState(true)
    }
    
    console.log(`Section mode ${enabled ? 'enabled' : 'disabled'}`)
  }, [setActiveSectionPlane])

  /**
   * Toggle section mode on/off
   */
  const toggleSectionMode = useCallback(() => {
    setSectionMode(!sectionModeEnabled)
  }, [sectionModeEnabled, setSectionMode])

  /**
   * Enable picking mode to allow selecting a new section plane
   * Used by "Change Plane" button
   */
  const enableSectionPicking = useCallback(() => {
    if (!sectionModeEnabled) return
    setSectionPlanePickingEnabledState(true)
    console.log('Section plane picking enabled')
  }, [sectionModeEnabled])

  /**
   * Disable picking mode (lock the current plane)
   */
  const disableSectionPicking = useCallback(() => {
    setSectionPlanePickingEnabledState(false)
    console.log('Section plane picking disabled (locked)')
  }, [])

  /**
   * Clear the current section plane without disabling section mode
   * Re-enables picking so user can pick a new plane
   */
  const clearSectionPlane = useCallback(() => {
    setActiveSectionPlane(null)
    setSectionPlanePickingEnabledState(true) // Allow picking new plane after clear
    console.log('Section plane cleared, picking re-enabled')
  }, [setActiveSectionPlane])

  /**
   * Find GlobalId and source label from a mesh or its parents
   */
  const findMeshInfo = useCallback((mesh) => {
    if (!mesh) return { globalId: null, sourceLabel: null }
    
    const isLikelyGlobalId = (str) => {
      if (!str || typeof str !== 'string') return false
      if (str.includes('-') || str.includes('openings')) return false
      if (str === 'Scene' || str === 'RootNode') return false
      return str.length >= 20 && str.length <= 24
    }
    
    let globalId = null
    let sourceLabel = null
    
    // Check mesh itself
    if (isLikelyGlobalId(mesh.name)) {
      globalId = mesh.name
    }
    if (mesh.userData?.GlobalId) {
      globalId = mesh.userData.GlobalId
    }
    if (mesh.userData?.type) {
      sourceLabel = mesh.userData.type
    }
    if (mesh.userData?.name && !sourceLabel) {
      sourceLabel = mesh.userData.name
    }
    
    // Walk up hierarchy
    let parent = mesh.parent
    let depth = 0
    while (parent && depth < 10) {
      if (!globalId && isLikelyGlobalId(parent.name)) {
        globalId = parent.name
      }
      if (!globalId && parent.userData?.GlobalId) {
        globalId = parent.userData.GlobalId
      }
      if (!sourceLabel && parent.userData?.type) {
        sourceLabel = parent.userData.type
      }
      if (!sourceLabel && parent.userData?.name) {
        sourceLabel = parent.userData.name
      }
      parent = parent.parent
      depth++
    }
    
    // Use mesh name as fallback for source label
    if (!sourceLabel && mesh.name && mesh.name.length > 0) {
      sourceLabel = mesh.name
    }
    
    return { globalId, sourceLabel }
  }, [])

  /**
   * Create a section plane from a pick result
   * Ensures normal is oriented toward camera
   * 
   * @param {SectionPickResult} pickResult - The pick result
   */
  const createSectionPlane = useCallback((pickResult) => {
    if (!pickResult) return
    if (!cameraRef.current) {
      console.warn('Camera not set, cannot orient section plane')
      return
    }

    const { point, normal: rawNormal, mesh } = pickResult
    
    // Clone and normalize
    const origin = point.clone()
    const normal = rawNormal.clone().normalize()
    
    // Ensure normal is oriented toward the camera
    // If the normal points away from the camera, flip it
    const cameraDir = new THREE.Vector3()
    cameraRef.current.getWorldDirection(cameraDir)
    
    if (normal.dot(cameraDir) > 0) {
      normal.multiplyScalar(-1)
      console.log('Flipped normal to face camera')
    }
    
    // Add a small offset to prevent Z-fighting when the plane is exactly on a surface
    // This moves the clipping plane slightly inward (along the normal direction)
    const zFightingOffset = 0.001
    const offsetOrigin = origin.clone().addScaledVector(normal, zFightingOffset)
    
    // Create THREE.Plane with the offset origin
    const plane = new THREE.Plane()
    plane.setFromNormalAndCoplanarPoint(normal, offsetOrigin)
    
    // Get source label from mesh info
    const { globalId, sourceLabel } = findMeshInfo(mesh)
    
    // Build the active state
    const newState = {
      plane,
      origin,
      normal,
      offset: 0,
      sourceLabel: sourceLabel || 'Surface'
    }
    
    setActiveSectionPlane(newState)
    
    // Auto-lock: disable picking after successfully creating a plane
    // This prevents accidental clicks from changing the plane
    setSectionPlanePickingEnabledState(false)
    
    console.log('Section plane created and locked:', {
      origin: `(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`,
      normal: `(${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)})`,
      constant: plane.constant.toFixed(2),
      sourceLabel: newState.sourceLabel,
      globalId
    })
  }, [findMeshInfo, setActiveSectionPlane])

  /**
   * Align camera to view the section plane head-on
   * Positions camera along the plane normal, looking at the plane origin
   */
  const alignCameraToSection = useCallback(() => {
    if (!activeSectionPlane) {
      console.log('No active section plane to align to')
      return
    }
    if (!cameraRef.current) {
      console.warn('Camera not set, cannot align')
      return
    }

    const { origin, normal } = activeSectionPlane
    
    // Calculate appropriate distance based on model size
    const modelRadius = getModelBoundingSphereRadius()
    const distance = modelRadius * 1.5 // Position camera at 1.5x the model radius
    
    // Position camera at origin - normal * distance
    // (looking from the "cut" side toward the remaining geometry)
    const cameraPosition = origin.clone().addScaledVector(normal, -distance)
    
    // Set camera position
    cameraRef.current.position.copy(cameraPosition)
    
    // Set camera up vector to world +Z (or +Y depending on your convention)
    // Using +Z as up for architectural/BIM models
    cameraRef.current.up.set(0, 0, 1)
    
    // Look at the origin point
    cameraRef.current.lookAt(origin)
    
    // Update orbit controls target if available
    if (controlsRef.current) {
      controlsRef.current.target.copy(origin)
      controlsRef.current.update()
    }
    
    console.log('Camera aligned to section:', {
      position: `(${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)})`,
      target: `(${origin.x.toFixed(2)}, ${origin.y.toFixed(2)}, ${origin.z.toFixed(2)})`,
      distance: distance.toFixed(2)
    })
  }, [activeSectionPlane, getModelBoundingSphereRadius])

  /**
   * Handle a click event in section mode
   * 
   * @param {MouseEvent} event - The mouse click event
   * @param {HTMLElement} domElement - The canvas DOM element
   * @returns {boolean} - True if a section plane was created
   */
  const handleSectionClick = useCallback((event, domElement) => {
    if (!sectionModeEnabled) return false
    if (!sceneRef.current || !cameraRef.current || !domElement) return false

    // Calculate normalized device coordinates
    const rect = domElement.getBoundingClientRect()
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    )

    // Set up raycaster
    raycasterRef.current.setFromCamera(mouse, cameraRef.current)

    // Collect all meshes from the scene
    const meshes = []
    sceneRef.current.traverse((object) => {
      if (object.isMesh && object.visible) {
        meshes.push(object)
      }
    })

    // Perform raycast
    const intersects = raycasterRef.current.intersectObjects(meshes, false)

    if (intersects.length === 0) {
      console.log('Section pick: No intersection')
      return false
    }

    const hit = intersects[0]
    const hitMesh = hit.object

    // Get hit point in world coordinates
    const hitPointWorld = hit.point.clone()

    // Get face normal in world space
    let faceNormalWorld = new THREE.Vector3()
    
    if (hit.face) {
      faceNormalWorld.copy(hit.face.normal)
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(hitMesh.matrixWorld)
      faceNormalWorld.applyMatrix3(normalMatrix).normalize()
    } else {
      faceNormalWorld.subVectors(cameraRef.current.position, hitPointWorld).normalize()
    }

    // Get mesh info
    const { globalId } = findMeshInfo(hitMesh)

    const pickResult = {
      point: hitPointWorld,
      normal: faceNormalWorld,
      mesh: hitMesh,
      globalId
    }

    createSectionPlane(pickResult)
    return true
  }, [sectionModeEnabled, findMeshInfo, createSectionPlane])

  // Legacy getter for backward compatibility
  const sectionPlane = activeSectionPlane

  return {
    // State
    sectionModeEnabled,
    sectionPlanePickingEnabled,
    sectionPlane,
    activeSectionPlane,
    
    // Setup
    setScene,
    setCamera,
    setRenderer,
    setControls,
    
    // Controls
    setSectionMode,
    toggleSectionMode,
    clearSectionPlane,
    setActiveSectionPlane,
    enableSectionPicking,
    disableSectionPicking,
    updatePlaneOffset,
    nudgeSectionPlane,
    resetPlaneOffset,
    getNudgeStep,
    
    // Actions
    createSectionPlane,
    handleSectionClick,
    alignCameraToSection,
    getModelBoundingSphereRadius
  }
}

export default useSectionMode
