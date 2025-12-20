import React, { useCallback, useState, useRef, useMemo, useEffect } from 'react'
import * as THREE from 'three'
import Viewer from './components/Viewer'
import SelectableModel from './components/SelectableModelWithVisibility'
import PropertyPanel from './components/PropertyPanel'
import StructureTree from './components/StructureTree'
import UploadPanel from './components/UploadPanel'
import ViewerToolbar from './components/ViewerToolbar'
import AxisViewWidget from './components/AxisViewWidget'
import SectionModeHint from './components/SectionModeHint'
import SectionPlanePanel from './components/SectionPlanePanel'
import SectionPlaneHelper from './components/SectionPlaneHelper'
import KeyboardHints from './components/KeyboardHints'
import EcPanel from './components/EcPanel'
import { useToast } from './components/Toast'
import useSelection from './hooks/useSelection'
import useVisibility from './hooks/useVisibility'
import useSectionMode from './hooks/useSectionMode'
import useXRayMode from './hooks/useXRayMode'
import useCameraFocus from './hooks/useCameraFocus'
import useViewMode from './hooks/useViewMode'
import { getEcColor } from './utils/colorUtils'

/**
 * Main Application Component
 * 
 * Composes the Viewer, Model, PropertyPanel, and StructureTree components.
 * Supports element selection, property display, and visibility isolation.
 */
function App() {
  // Model URLs - null until uploaded
  const [modelUrls, setModelUrls] = useState(null)
  const [jobId, setJobId] = useState(null)
  const [ecPanelOpen, setEcPanelOpen] = useState(false)
  // Panel stacking counter used to bring panels to front when focused
  const [panelZCounter, setPanelZCounter] = useState(1000)
  const [ecPanelZIndex, setEcPanelZIndex] = useState(1000)

  // Selection state management
  const { selectedId, handleSelect, deselect, setScene: setSelectionScene, selectById } = useSelection()
  
  // Visibility control
  const { setScene, isolate, showAll } = useVisibility()
  
  // Section mode control
  const {
    sectionModeEnabled,
    sectionPlanePickingEnabled,
    sectionPlane,
    activeSectionPlane,
    setScene: setSectionScene,
    setCamera: setSectionCamera,
    setRenderer: setSectionRenderer,
    setControls: setSectionControls,
    setSectionMode,
    toggleSectionMode,
    clearSectionPlane,
    createSectionPlane,
    enableSectionPicking,
    nudgeSectionPlane,
    resetPlaneOffset,
    alignCameraToSection,
    sectionPlaneVisible,
    toggleSectionPlaneVisibility,
    sectionPlaneSize,
    setSectionPlaneSize
  } = useSectionMode()
  
  // X-Ray mode for isolation effect
  const {
    xRayEnabled,
    setScene: setXRayScene,
    enableXRay,
    disableXRay,
    updateXRaySelection
  } = useXRayMode()
  
  // Camera focus for pan/zoom to selected elements
  const {
    setScene: setFocusScene,
    setCamera: setFocusCamera,
    setControls: setFocusControls,
    focusOnElements
  } = useCameraFocus()
  
  // View mode for preset camera positions (Top/Front/Side/Free)
  const {
    viewMode,
    setScene: setViewModeScene,
    setCamera: setViewModeCamera,
    setControls: setViewModeControls,
    setViewMode,
    getViewMode,
    resetView,
    fitToModel,
    getAvailableViews,
    invalidateBoundsCache
  } = useViewMode()
  
  // Toast notifications
  const { toasts, showToast, removeToast, ToastContainer } = useToast()
  
  // Track isolated IDs for X-ray
  const [isolatedIds, setIsolatedIds] = useState(null)
  // Lock focus to prevent accidental changes to isolation set
  const [focusLock, setFocusLock] = useState(true)

  // Viewer Mode: NORMAL | FOCUS | ISOLATE
  // Derived from state to ensure consistency and avoid duplication
  const mode = useMemo(() => {
    if (isolatedIds) return 'ISOLATE'
    if (selectedId) return 'FOCUS'
    return 'NORMAL'
  }, [isolatedIds, selectedId])

  // Log mode changes for debugging
  useEffect(() => {
    console.log('Viewer Mode:', mode)
  }, [mode])
  
  // Track last selected IDs for 'F' key focus
  const lastSelectedIdsRef = useRef(null)
  
  // Store references
  const cameraRef = useRef(null)
  const glRef = useRef(null)
  const controlsRef = useRef(null)

  /**
   * Handle model ready after upload
   */
  const handleModelReady = useCallback((urls) => {
    console.log('Model ready:', urls)
    setModelUrls(urls)
    setJobId(urls.jobId)
    // Reset section mode when loading a new model
    setSectionMode(false)
    // Invalidate bounds cache for new model
    invalidateBoundsCache()
  }, [setSectionMode, invalidateBoundsCache])

  /**
   * Handle scene ready - register with visibility controller, section mode, selection, X-ray, camera focus, and view mode
   */
  const handleSceneReady = useCallback((scene, camera, gl) => {
    setScene(scene)
    setSectionScene(scene)
    setSelectionScene(scene) // Register scene with selection hook for selectById
    setXRayScene(scene) // Register scene with X-ray mode
    setFocusScene(scene) // Register scene with camera focus
    setViewModeScene(scene) // Register scene with view mode
    if (camera) {
      setSectionCamera(camera)
      setFocusCamera(camera)
      setViewModeCamera(camera)
      cameraRef.current = camera
    }
    if (gl) {
      setSectionRenderer(gl)
      glRef.current = gl
    }
    console.log('Scene registered with visibility, section, selection, X-ray, focus, and view mode controllers')
  }, [setScene, setSectionScene, setSelectionScene, setXRayScene, setFocusScene, setViewModeScene, setSectionCamera, setFocusCamera, setViewModeCamera, setSectionRenderer])

  /**
   * Handle renderer ready from Viewer
   */
  const handleRendererReady = useCallback((gl, camera) => {
    if (gl) {
      setSectionRenderer(gl)
      glRef.current = gl
    }
    if (camera) {
      setSectionCamera(camera)
      cameraRef.current = camera
    }
    console.log('Renderer ready, clipping enabled')
  }, [setSectionRenderer, setSectionCamera])

  /**
   * Handle controls ready from Viewer
   */
  const handleControlsReady = useCallback((controls) => {
    setSectionControls(controls)
    setFocusControls(controls)
    setViewModeControls(controls)
    controlsRef.current = controls
    console.log('Orbit controls ready')
  }, [setSectionControls, setFocusControls, setViewModeControls])

  /**
   * Clear all selection and X-ray mode
   */
  const clearAll = useCallback(() => {
    deselect()
    disableXRay()
    showAll()
    setIsolatedIds(null)
    lastSelectedIdsRef.current = null
  }, [deselect, showAll, disableXRay])

  /**
   * Focus on current selection (for 'F' key shortcut)
   */
  const focusOnCurrentSelection = useCallback(() => {
    if (lastSelectedIdsRef.current && lastSelectedIdsRef.current.length > 0) {
      const result = focusOnElements(lastSelectedIdsRef.current)
      if (!result.found) {
        showToast('No geometry found for selected element(s)', 'warning')
      }
    } else if (selectedId) {
      const ids = Array.isArray(selectedId) ? selectedId : [selectedId]
      const result = focusOnElements(ids)
      if (!result.found) {
        showToast('No geometry found for selected element(s)', 'warning')
      }
    } else {
      showToast('No element selected. Select an element first.', 'info')
    }
  }, [focusOnElements, selectedId, showToast])

  /**
   * View mode keyboard shortcut mapping
   * Uses number keys 1-7 for quick view access
   */
  const viewModeShortcuts = useMemo(() => ({
    '1': 'free',
    '2': 'top',
    '3': 'front',
    '4': 'right',
    '5': 'left',
    '6': 'back',
    '7': 'bottom'
  }), [])

  /**
   * Keyboard shortcuts handler
   */
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Don't trigger shortcuts when typing in input fields
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
        return
      }
      
      // Check for view mode shortcuts (1-7)
      const viewMode = viewModeShortcuts[event.key]
      if (viewMode) {
        setViewMode(viewMode)
        const viewLabels = {
          'free': 'Free Orbit',
          'top': 'Top',
          'front': 'Front',
          'right': 'Right',
          'left': 'Left',
          'back': 'Back',
          'bottom': 'Bottom'
        }
        showToast(`${viewLabels[viewMode]} view`, 'info', 1500)
        return
      }
      
      switch (event.key) {
        case 'Escape':
          // Clear selection and X-ray
          clearAll()
          showToast('Selection cleared', 'info', 2000)
          break
        case 'f':
        case 'F':
          // Focus on selected element(s)
          focusOnCurrentSelection()
          break
        case 'c':
        case 'C':
          // DEBUG: Capture current camera state
          if (cameraRef.current && controlsRef.current) {
            const cam = cameraRef.current
            const ctrl = controlsRef.current
            console.log('=== CAMERA STATE ===')
            console.log(`Position: (${cam.position.x.toFixed(3)}, ${cam.position.y.toFixed(3)}, ${cam.position.z.toFixed(3)})`)
            console.log(`Target: (${ctrl.target.x.toFixed(3)}, ${ctrl.target.y.toFixed(3)}, ${ctrl.target.z.toFixed(3)})`)
            console.log(`Up: (${cam.up.x.toFixed(3)}, ${cam.up.y.toFixed(3)}, ${cam.up.z.toFixed(3)})`)
            // Calculate direction from target to camera
            const dir = cam.position.clone().sub(ctrl.target).normalize()
            console.log(`Direction (normalized): (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)})`)
            showToast('Camera state logged to console (press F12)', 'info', 3000)
          }
          break
        default:
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearAll, focusOnCurrentSelection, showToast, viewModeShortcuts, setViewMode])

  /**
   * Handle isolation from tree view - also enables X-ray effect
   * Supports 'FOCUS' (Ghost/X-Ray) and 'ISOLATE' (Hide others) modes
   */
  const handleIsolate = useCallback((globalIds, options = {}) => {
    const { behavior = 'FOCUS' } = options

    if (globalIds === null) {
      // Show all - disable X-ray and show all elements
      disableXRay()
      showAll()
      setIsolatedIds(null)
    } else {
      if (behavior === 'ISOLATE') {
        // Hide others
        disableXRay()
        isolate(globalIds)
      } else {
        // FOCUS: Ghost others (X-Ray)
        showAll() // Ensure everything is visible first
        enableXRay(globalIds)
      }
      setIsolatedIds(globalIds)
    }
  }, [isolate, showAll, enableXRay, disableXRay])

  /**
   * Handle selection from tree view - selects element(s) in the 3D model and focuses camera
   */
  const handleTreeSelect = useCallback((globalIdOrIds, ecData) => {
    console.log('Selected from tree:', globalIdOrIds, ecData)
    
    let options = {}
    const ids = Array.isArray(globalIdOrIds) ? globalIdOrIds : [globalIdOrIds]

    if (ecData) {
        const { ecValue, minEc, maxEc } = ecData
        const color = getEcColor(ecValue, minEc, maxEc)
        options = { color }
        
        // Enable X-ray to make others translucent
        enableXRay(ids)
    } else {
        disableXRay()
    }

    selectById(globalIdOrIds, options)
    
    // Track selected IDs for 'F' key focus
    lastSelectedIdsRef.current = ids
    
    // Focus camera on selected element(s) with feedback
    const result = focusOnElements(ids)
    
    if (!result.found) {
      showToast(`No geometry found for "${ids.length === 1 ? 'element' : ids.length + ' elements'}"`, 'warning')
    } else if (result.count > 1) {
      showToast(`Focused on ${result.count} elements`, 'info', 2000)
    }
  }, [selectById, focusOnElements, showToast, enableXRay, disableXRay])

  /**
   * Handle section pick from model click
   */
  const handleSectionPick = useCallback((intersection, mesh) => {
    if (!intersection || !intersection.point) return
    
    // Get hit point (already in world coordinates from R3F)
    const hitPointWorld = intersection.point.clone()
    
    // Get face normal and transform to world space
    let faceNormalWorld = new THREE.Vector3(0, 1, 0) // Default up
    
    if (intersection.face) {
      faceNormalWorld.copy(intersection.face.normal)
      
      // Transform normal to world space using the mesh's normal matrix
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld)
      faceNormalWorld.applyMatrix3(normalMatrix).normalize()
    }
    
    // Create the section plane
    createSectionPlane({
      point: hitPointWorld,
      normal: faceNormalWorld,
      mesh: mesh
    })
    
    console.log('Section plane created from pick:', {
      point: `(${hitPointWorld.x.toFixed(2)}, ${hitPointWorld.y.toFixed(2)}, ${hitPointWorld.z.toFixed(2)})`,
      normal: `(${faceNormalWorld.x.toFixed(2)}, ${faceNormalWorld.y.toFixed(2)}, ${faceNormalWorld.z.toFixed(2)})`
    })
  }, [createSectionPlane])

  // Sync X-Ray "solid set" with selection
  // If X-Ray is enabled, ensure selected elements are also solid
  useEffect(() => {
    if (!xRayEnabled) return

    // Combine isolated IDs and selected ID
    const solidIds = [...(isolatedIds || [])]
    if (selectedId) {
      if (Array.isArray(selectedId)) {
        solidIds.push(...selectedId)
      } else {
        solidIds.push(selectedId)
      }
    }

    // Update X-Ray selection
    updateXRaySelection(solidIds)
  }, [xRayEnabled, isolatedIds, selectedId, updateXRaySelection])

  // Auto-Focus behavior: If unlocked, selection replaces the focus set
  useEffect(() => {
    if (mode === 'FOCUS' && !focusLock && selectedId) {
      const newIds = Array.isArray(selectedId) ? selectedId : [selectedId]
      // Only update if different to avoid loops
      const currentIds = isolatedIds || []
      const isDifferent = newIds.length !== currentIds.length || 
                         !newIds.every(id => currentIds.includes(id))
      
      if (isDifferent) {
        setIsolatedIds(newIds)
      }
    }
  }, [mode, focusLock, selectedId, isolatedIds])

  // Show upload panel if no model loaded
  if (!modelUrls) {
    return <UploadPanel onModelReady={handleModelReady} hasModel={false} />
  }

  return (
    <div style={styles.appContainer}>
      {/* Navigation Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>DIGITAL TWIN</span>
        </div>

      </header>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Structure Tree - Left Panel */}
        <StructureTree 
          hierarchyUrl={modelUrls.hierarchyUrl}
          onIsolate={handleIsolate}
          onSelect={handleTreeSelect}
          selectedId={selectedId}
          focusLock={focusLock}
          onToggleFocusLock={() => setFocusLock(prev => !prev)}
        />

        {/* 3D Viewer - Center */}
        <div style={styles.viewerContainer}>
          {/* Viewer Toolbar */}
          <ViewerToolbar 
            sectionModeEnabled={sectionModeEnabled}
            onToggleSectionMode={toggleSectionMode}
            hasSectionPlane={!!activeSectionPlane}
            onClearSectionPlane={clearSectionPlane}
            onAlignCamera={alignCameraToSection}
            viewMode={viewMode}
            onSetViewMode={setViewMode}
            availableViews={getAvailableViews()}
            onResetView={resetView}
            onFitToModel={fitToModel}
            // Toggle panel open/close when Carbon button is clicked
            onOpenEcPanel={() => {
              // If panel is closed, open and bring to front
              if (!ecPanelOpen) {
                setEcPanelOpen(true)
                setPanelZCounter(prev => {
                  const next = prev + 1
                  setEcPanelZIndex(next)
                  return next
                })
                return
              }

              // If panel is open and already top-most, close it
              if (ecPanelZIndex === panelZCounter) {
                setEcPanelOpen(false)
                return
              }

              // Otherwise bring it to front
              setPanelZCounter(prev => {
                const next = prev + 1
                setEcPanelZIndex(next)
                return next
              })
            }}
            hasModel={!!modelUrls}
          />
          
          {/* Section Plane Controls Panel */}
          <SectionPlanePanel
            sectionModeEnabled={sectionModeEnabled}
            sectionPlanePickingEnabled={sectionPlanePickingEnabled}
            activeSectionPlane={activeSectionPlane}
            onToggleSectionMode={toggleSectionMode}
            onNudge={nudgeSectionPlane}
            onAlignCamera={alignCameraToSection}
            onReset={clearSectionPlane}
            onResetOffset={resetPlaneOffset}
            onChangePlane={enableSectionPicking}
            sectionPlaneVisible={sectionPlaneVisible}
            onTogglePlaneVisibility={toggleSectionPlaneVisibility}
            sectionPlaneSize={sectionPlaneSize}
            onSectionPlaneSizeChange={setSectionPlaneSize}
          />
          
          <Viewer 
            onMissed={deselect}
            onRendererReady={handleRendererReady}
            onControlsReady={handleControlsReady}
          >
            <SectionPlaneHelper 
              activeSectionPlane={activeSectionPlane}
              visible={sectionPlaneVisible}
              size={sectionPlaneSize}
            />
            <SelectableModel 
              url={modelUrls.glbUrl}
              onSelect={handleSelect}
              onSceneReady={handleSceneReady}
              sectionModeEnabled={sectionModeEnabled}
              sectionPlanePickingEnabled={sectionPlanePickingEnabled}
              onSectionPick={handleSectionPick}
              position={[0, 0, 0]}
              scale={1}
            />
          </Viewer>
          
          {/* Upload new model button */}
          <UploadPanel 
            onModelReady={handleModelReady} 
            hasModel={true} 
            onReset={() => {
              setModelUrls(null)
              setJobId(null)
              setEcPanelOpen(false)
              clearAll()
            }}
          />
          
          <EcPanel 
            isOpen={ecPanelOpen} 
            onClose={() => setEcPanelOpen(false)} 
            jobId={jobId} 
            selectedId={selectedId}
            onSelectContributor={handleTreeSelect}
            focusToken={ecPanelZIndex}
            zIndex={ecPanelZIndex}
          />

          {/* Keyboard shortcuts hints */}
          <KeyboardHints />
          
          {/* Axis View Widget - Bottom right corner */}
          <AxisViewWidget
            viewMode={viewMode}
            onSetViewMode={setViewMode}
          />
        </div>
        
        {/* Property Panel - Right Panel */}
        <PropertyPanel 
          selectedId={selectedId}
          metadataUrl={modelUrls.metadataUrl}
        />
      </div>
      
      {/* Toast notifications */}
      <ToastContainer />
    </div>
  )
}

const styles = {
  appContainer: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: '#f5f5f7',
  },
  header: {
    height: '60px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e5e7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    zIndex: 100,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '20px',
    color: '#1d1d1f',
  },
  logoText: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    color: '#1d1d1f',
  },

  mainContent: {
    flex: 1,
    display: 'flex',
    overflow: 'hidden',
    position: 'relative',
  },
  viewerContainer: {
    flex: 1,
    position: 'relative',
    margin: '16px',
    marginLeft: '0',
    marginRight: '0',
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#f0f0f2',
  },
}

export default App
