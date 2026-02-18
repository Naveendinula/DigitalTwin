import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import AppHeader from './components/AppHeader'
import PropertyPanel from './components/PropertyPanel'
import StructureTree from './components/StructureTree'
import UploadPanel from './components/UploadPanel'
import ViewerShell from './components/ViewerShell'
import { useToast } from './components/Toast'
import useKeyboardShortcuts from './hooks/useKeyboardShortcuts'
import useFloatingPanels from './hooks/useFloatingPanels'
import useSelection from './hooks/useSelection'
import useVisibility from './hooks/useVisibility'
import useSectionMode from './hooks/useSectionMode'
import useSectionPick from './hooks/useSectionPick'
import useViewerSelection from './hooks/useViewerSelection'
import useXRayMode from './hooks/useXRayMode'
import useCameraFocus from './hooks/useCameraFocus'
import useViewMode from './hooks/useViewMode'
import useSpaceOverlay from './hooks/useSpaceOverlay'
import useOccupancy from './hooks/useOccupancy'
import useViewerScene from './hooks/useViewerScene'
import { useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import appStyles from './constants/appStyles'
import { debugLog } from './utils/logger'

/**
 * Main Application Component
 * 
 * Composes the Viewer, Model, PropertyPanel, and StructureTree components.
 * Supports element selection, property display, and visibility isolation.
 */
function ViewerApp() {
  const { user, logout } = useAuth()

  // Model URLs - null until uploaded
  const [modelUrls, setModelUrls] = useState(null)
  const [jobId, setJobId] = useState(null)

  // Panel visibility state
  const [structureTreeVisible, setStructureTreeVisible] = useState(true)
  const [propertiesPanelVisible, setPropertiesPanelVisible] = useState(true)
  const [structurePanelWidth, setStructurePanelWidth] = useState(280)
  const [propertiesPanelWidth, setPropertiesPanelWidth] = useState(320)
  const dragStateRef = useRef(null)

  const selection = useSelection()
  const visibility = useVisibility()
  const sectionMode = useSectionMode()
  const xRayMode = useXRayMode()
  const cameraFocus = useCameraFocus()
  const viewModeState = useViewMode()
  
  // Toast notifications
  const { showToast, ToastContainer } = useToast()

  const floatingPanels = useFloatingPanels(xRayMode.disableXRay)
  const spaceOverlay = useSpaceOverlay({ jobId, showToast })
  const occupancy = useOccupancy({ jobId, pollInterval: 2000, showToast })

  // Occupancy panel state
  const [occupancyPanelOpen, setOccupancyPanelOpen] = useState(false)
  const [geometryHidden, setGeometryHidden] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)

  const {
    focusLock,
    setFocusLock,
    handleClearAll,
    handleIsolate,
    handleTreeSelect,
    handleHvacSelectDetail,
    focusOnCurrentSelection
  } = useViewerSelection({
    selectedId: selection.selectedId,
    selectById: selection.selectById,
    deselect: selection.deselect,
    isolate: visibility.isolate,
    showAll: visibility.showAll,
    enableXRay: xRayMode.enableXRay,
    disableXRay: xRayMode.disableXRay,
    xRayEnabled: xRayMode.xRayEnabled,
    updateXRaySelection: xRayMode.updateXRaySelection,
    focusOnElements: cameraFocus.focusOnElements,
    showToast,
    enableSpaceOverlayForSpaces: spaceOverlay.enableSpaceOverlayForSpaces
  })

  const {
    cameraRef,
    controlsRef,
    requestFitToModel,
    handleSceneReady,
    handleRendererReady,
    handleControlsReady
  } = useViewerScene({
    setScene: visibility.setScene,
    setSectionScene: sectionMode.setScene,
    setSelectionScene: selection.setScene,
    setXRayScene: xRayMode.setScene,
    setFocusScene: cameraFocus.setScene,
    setViewModeScene: viewModeState.setScene,
    setSectionCamera: sectionMode.setCamera,
    setFocusCamera: cameraFocus.setCamera,
    setViewModeCamera: viewModeState.setCamera,
    setSectionRenderer: sectionMode.setRenderer,
    setSectionControls: sectionMode.setControls,
    setFocusControls: cameraFocus.setControls,
    setViewModeControls: viewModeState.setControls,
    fitToModel: viewModeState.fitToModel,
    getModelBounds: viewModeState.getModelBounds
  })

  const handleSectionPick = useSectionPick(sectionMode.createSectionPlane)

  useKeyboardShortcuts({
    onClearSelection: handleClearAll,
    onFocusSelection: focusOnCurrentSelection,
    onSetViewMode: viewModeState.setViewMode,
    showToast,
    cameraRef,
    controlsRef
  })

  /**
   * Handle model ready after upload
   */
  const handleModelReady = useCallback((urls) => {
    debugLog('Model ready:', urls)
    setModelUrls(urls)
    setJobId(urls.jobId)
    // Reset section mode when loading a new model
    sectionMode.setSectionMode(false)
    spaceOverlay.disableSpaceOverlay()
    occupancy.disable()
    setOccupancyPanelOpen(false)
    setGeometryHidden(false)
    // Invalidate bounds cache for new model
    viewModeState.invalidateBoundsCache()
    // Auto-fit once the model and controls are ready
    requestFitToModel()
  }, [sectionMode.setSectionMode, viewModeState.invalidateBoundsCache, spaceOverlay.disableSpaceOverlay, occupancy.disable, requestFitToModel])

  const handleResetModel = useCallback(() => {
    setModelUrls(null)
    setJobId(null)
    floatingPanels.handleCloseEcPanel()
    floatingPanels.handleCloseHvacPanel()
    spaceOverlay.disableSpaceOverlay()
    occupancy.disable()
    setOccupancyPanelOpen(false)
    setGeometryHidden(false)
    handleClearAll()
  }, [floatingPanels.handleCloseEcPanel, floatingPanels.handleCloseHvacPanel, spaceOverlay.disableSpaceOverlay, occupancy.disable, handleClearAll])

  /**
   * Toggle occupancy mode and panel
   */
  const handleToggleOccupancy = useCallback(() => {
    occupancy.toggle()
    // Also enable space overlay when turning on occupancy
    if (!occupancy.enabled && !spaceOverlay.spaceOverlayEnabled) {
      spaceOverlay.toggleSpaceOverlay()
    }
  }, [occupancy.enabled, occupancy.toggle, spaceOverlay.spaceOverlayEnabled, spaceOverlay.toggleSpaceOverlay])

  const handleToggleOccupancyPanel = useCallback(() => {
    setOccupancyPanelOpen(prev => !prev)
  }, [])

  const handleToggleGeometry = useCallback(() => {
    setGeometryHidden(prev => !prev)
  }, [])

  const handleLogout = useCallback(async () => {
    setLogoutPending(true)
    try {
      await logout()
    } finally {
      setLogoutPending(false)
    }
  }, [logout])

  const handleGlobalSearchSelect = useCallback((result) => {
    if (!result?.globalId) return

    handleTreeSelect(result.globalId)

    if (result.type === 'IfcSpace') {
      spaceOverlay.enableSpaceOverlayForSpaces([result.globalId])
    }
  }, [handleTreeSelect, spaceOverlay.enableSpaceOverlayForSpaces])

  const handleStartResize = useCallback((side, event) => {
    event.preventDefault()
    dragStateRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? structurePanelWidth : propertiesPanelWidth
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [structurePanelWidth, propertiesPanelWidth])

  useEffect(() => {
    const minWidth = 220
    const maxWidth = 520

    const handleMouseMove = (event) => {
      const dragState = dragStateRef.current
      if (!dragState) return
      const delta = event.clientX - dragState.startX
      const direction = dragState.side === 'left' ? 1 : -1
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, dragState.startWidth + (direction * delta)))
      if (dragState.side === 'left') {
        setStructurePanelWidth(nextWidth)
      } else {
        setPropertiesPanelWidth(nextWidth)
      }
    }

    const handleMouseUp = () => {
      if (!dragStateRef.current) return
      dragStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  // Show upload panel if no model loaded
  if (!modelUrls) {
    return <UploadPanel onModelReady={handleModelReady} hasModel={false} />
  }

  const viewer = {
    modelUrls,
    jobId,
    selection,
    sectionMode,
    viewModeState,
    floatingPanels,
    spaceOverlay,
    occupancy,
    occupancyPanelOpen,
    setOccupancyPanelOpen,
    geometryHidden,
    handleModelReady,
    handleResetModel,
    handleSectionPick,
    handleToggleOccupancy,
    handleToggleOccupancyPanel,
    handleToggleGeometry,
    handleHvacSelectDetail,
    handleTreeSelect,
    handleSceneReady,
    handleRendererReady,
    handleControlsReady
  }

  return (
    <div style={appStyles.appContainer}>
      <AppHeader 
        filename={modelUrls?.filename}
        ifcSchema={modelUrls?.ifcSchema}
        metadataUrl={modelUrls?.metadataUrl}
        onGlobalSearchSelect={handleGlobalSearchSelect}
        authUserLabel={user?.display_name || user?.email || ''}
        onLogout={handleLogout}
        logoutPending={logoutPending}
      />

      <div style={appStyles.mainContent}>
        {/* Subtle Panel Toggle Buttons */}
        {modelUrls && (
          <>
            <button
              data-panel-toggle
              onClick={() => setStructureTreeVisible(prev => !prev)}
              title={structureTreeVisible ? 'Hide Structure Tree' : 'Show Structure Tree'}
              style={{
                ...appStyles.panelToggle,
                ...appStyles.panelToggleLeft,
                ...(structureTreeVisible ? {} : appStyles.panelToggleHidden)
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {structureTreeVisible ? (
                  <polyline points="15 18 9 12 15 6" />
                ) : (
                  <polyline points="9 18 15 12 9 6" />
                )}
              </svg>
            </button>
            <button
              data-panel-toggle
              onClick={() => setPropertiesPanelVisible(prev => !prev)}
              title={propertiesPanelVisible ? 'Hide Properties Panel' : 'Show Properties Panel'}
              style={{
                ...appStyles.panelToggle,
                ...appStyles.panelToggleRight,
                ...(propertiesPanelVisible ? {} : appStyles.panelToggleHidden)
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {propertiesPanelVisible ? (
                  <polyline points="9 18 15 12 9 6" />
                ) : (
                  <polyline points="15 18 9 12 15 6" />
                )}
              </svg>
            </button>
          </>
        )}

        {structureTreeVisible && (
          <div style={{ width: structurePanelWidth, position: 'relative', display: 'flex', flexShrink: 0 }}>
            <StructureTree 
              hierarchyUrl={modelUrls.hierarchyUrl}
              onIsolate={handleIsolate}
              onSelect={handleTreeSelect}
              selectedId={selection.selectedId}
              focusLock={focusLock}
              onToggleFocusLock={() => setFocusLock(prev => !prev)}
            />
            <div
              onMouseDown={(event) => handleStartResize('left', event)}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                width: '6px',
                height: '100%',
                cursor: 'col-resize',
                background: 'rgba(0, 0, 0, 0.03)',
                zIndex: 5,
              }}
              title="Drag to resize"
            />
          </div>
        )}

        <ViewerShell
          containerStyle={appStyles.viewerContainer}
          viewer={viewer}
        />

        {propertiesPanelVisible && (
          <div style={{ width: propertiesPanelWidth, position: 'relative', display: 'flex', flexShrink: 0 }}>
            <div
              onMouseDown={(event) => handleStartResize('right', event)}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '6px',
                height: '100%',
                cursor: 'col-resize',
                background: 'rgba(0, 0, 0, 0.03)',
                zIndex: 5,
              }}
              title="Drag to resize"
            />
            <PropertyPanel 
              selectedId={selection.selectedId}
              metadataUrl={modelUrls.metadataUrl}
              jobId={jobId}
            />
          </div>
        )}
      </div>

      <ToastContainer />
    </div>
  )
}

function FullscreenLoader() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f4f4f4',
        color: '#86868b',
        fontSize: '13px',
      }}
    >
      Loading...
    </div>
  )
}

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullscreenLoader />
  if (!isAuthenticated) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" replace state={{ from }} />
  }
  return children
}

function PublicOnly({ children }) {
  const { isAuthenticated, loading } = useAuth()
  if (loading) return <FullscreenLoader />
  if (isAuthenticated) return <Navigate to="/" replace />
  return children
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={(
          <PublicOnly>
            <LoginPage />
          </PublicOnly>
        )}
      />
      <Route
        path="/signup"
        element={(
          <PublicOnly>
            <SignupPage />
          </PublicOnly>
        )}
      />
      <Route
        path="/*"
        element={(
          <RequireAuth>
            <ViewerApp />
          </RequireAuth>
        )}
      />
    </Routes>
  )
}

export default App
