import React, { useCallback, useState, useRef, useMemo } from 'react'
import * as THREE from 'three'
import Viewer from './components/Viewer'
import SelectableModel from './components/SelectableModelWithVisibility'
import PropertyPanel from './components/PropertyPanel'
import StructureTree from './components/StructureTree'
import UploadPanel from './components/UploadPanel'
import ViewerToolbar from './components/ViewerToolbar'
import SectionModeHint from './components/SectionModeHint'
import SectionPlanePanel from './components/SectionPlanePanel'
import useSelection from './hooks/useSelection'
import useVisibility from './hooks/useVisibility'
import useSectionMode from './hooks/useSectionMode'
import useXRayMode from './hooks/useXRayMode'

/**
 * Main Application Component
 * 
 * Composes the Viewer, Model, PropertyPanel, and StructureTree components.
 * Supports element selection, property display, and visibility isolation.
 */
function App() {
  // Model URLs - null until uploaded
  const [modelUrls, setModelUrls] = useState(null)

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
    alignCameraToSection
  } = useSectionMode()
  
  // X-Ray mode for isolation effect
  const {
    xRayEnabled,
    setScene: setXRayScene,
    enableXRay,
    disableXRay,
    updateXRaySelection
  } = useXRayMode()
  
  // Track isolated IDs for X-ray
  const [isolatedIds, setIsolatedIds] = useState(null)
  
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
    // Reset section mode when loading a new model
    setSectionMode(false)
  }, [setSectionMode])

  /**
   * Handle scene ready - register with visibility controller, section mode, selection, and X-ray
   */
  const handleSceneReady = useCallback((scene, camera, gl) => {
    setScene(scene)
    setSectionScene(scene)
    setSelectionScene(scene) // Register scene with selection hook for selectById
    setXRayScene(scene) // Register scene with X-ray mode
    if (camera) {
      setSectionCamera(camera)
      cameraRef.current = camera
    }
    if (gl) {
      setSectionRenderer(gl)
      glRef.current = gl
    }
    console.log('Scene registered with visibility, section, selection, and X-ray controllers')
  }, [setScene, setSectionScene, setSelectionScene, setXRayScene, setSectionCamera, setSectionRenderer])

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
    controlsRef.current = controls
    console.log('Orbit controls ready')
  }, [setSectionControls])

  /**
   * Handle isolation from tree view - also enables X-ray effect
   */
  const handleIsolate = useCallback((globalIds) => {
    if (globalIds === null) {
      // Show all - disable X-ray and show all elements
      showAll()
      disableXRay()
      setIsolatedIds(null)
    } else {
      // Isolate - enable X-ray with selected IDs visible
      isolate(globalIds)
      enableXRay(globalIds)
      setIsolatedIds(globalIds)
    }
  }, [isolate, showAll, enableXRay, disableXRay])

  /**
   * Handle selection from tree view - selects element(s) in the 3D model
   */
  const handleTreeSelect = useCallback((globalIdOrIds) => {
    console.log('Selected from tree:', globalIdOrIds)
    selectById(globalIdOrIds)
  }, [selectById])

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
        <nav style={styles.nav}>
          <a href="#" style={styles.navLinkActive}>Overview</a>
          <a href="#" style={styles.navLink}>Details</a>
          <a href="#" style={styles.navLink}>Reports</a>
          <a href="#" style={styles.navLink}>Contact</a>
        </nav>
        <div style={styles.headerRight}>
          <a href="#" style={styles.loginLink}>Log in</a>
          <button style={styles.signUpBtn}>Sign up</button>
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
        />

        {/* 3D Viewer - Center */}
        <div style={styles.viewerContainer}>
          {/* Viewer Toolbar */}
          <ViewerToolbar
            sectionModeEnabled={sectionModeEnabled}
            onToggleSectionMode={toggleSectionMode}
            hasSectionPlane={!!sectionPlane}
            onClearSectionPlane={clearSectionPlane}
            onAlignCamera={alignCameraToSection}
          />
          
          {/* Section Mode Hint */}
          <SectionModeHint
            sectionModeEnabled={sectionModeEnabled}
            hasSectionPlane={!!sectionPlane}
            pickingEnabled={sectionPlanePickingEnabled}
            sourceLabel={activeSectionPlane?.sourceLabel}
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
          />
          
          <Viewer 
            onMissed={deselect}
            onRendererReady={handleRendererReady}
            onControlsReady={handleControlsReady}
          >
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
          <UploadPanel onModelReady={handleModelReady} hasModel={true} />
        </div>
        
        {/* Property Panel - Right Panel */}
        <PropertyPanel 
          selectedId={selectedId}
          metadataUrl={modelUrls.metadataUrl}
        />
      </div>
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
  nav: {
    display: 'flex',
    gap: '32px',
  },
  navLink: {
    fontSize: '14px',
    color: '#86868b',
    textDecoration: 'none',
    fontWeight: 500,
    transition: 'color 0.2s',
  },
  navLinkActive: {
    fontSize: '14px',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontWeight: 500,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  loginLink: {
    fontSize: '14px',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontWeight: 500,
  },
  signUpBtn: {
    padding: '8px 16px',
    background: '#1d1d1f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
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
