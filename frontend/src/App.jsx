import { useCallback, useState } from 'react'
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
import appStyles from './constants/appStyles'

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
    console.log('Model ready:', urls)
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

  // Show upload panel if no model loaded
  if (!modelUrls) {
    return <UploadPanel onModelReady={handleModelReady} hasModel={false} />
  }

  return (
    <div style={appStyles.appContainer}>
      <AppHeader />

      <div style={appStyles.mainContent}>
        <StructureTree 
          hierarchyUrl={modelUrls.hierarchyUrl}
          onIsolate={handleIsolate}
          onSelect={handleTreeSelect}
          selectedId={selection.selectedId}
          focusLock={focusLock}
          onToggleFocusLock={() => setFocusLock(prev => !prev)}
        />

        <ViewerShell
          containerStyle={appStyles.viewerContainer}
          viewerToolbarProps={{
            sectionModeEnabled: sectionMode.sectionModeEnabled,
            onToggleSectionMode: sectionMode.toggleSectionMode,
            hasSectionPlane: !!sectionMode.activeSectionPlane,
            onClearSectionPlane: sectionMode.clearSectionPlane,
            onAlignCamera: sectionMode.alignCameraToSection,
            viewMode: viewModeState.viewMode,
            onSetViewMode: viewModeState.setViewMode,
            availableViews: viewModeState.getAvailableViews(),
            onResetView: viewModeState.resetView,
            onFitToModel: viewModeState.fitToModel,
            onOpenEcPanel: floatingPanels.handleToggleEcPanel,
            onOpenHvacPanel: floatingPanels.handleToggleHvacPanel,
            onToggleSpaceOverlay: spaceOverlay.toggleSpaceOverlay,
            spaceOverlayEnabled: spaceOverlay.spaceOverlayEnabled,
            onToggleOccupancy: handleToggleOccupancy,
            occupancyEnabled: occupancy.enabled,
            onOpenOccupancyPanel: handleToggleOccupancyPanel,
            geometryHidden,
            onToggleGeometry: handleToggleGeometry,
            hasModel: !!modelUrls
          }}
          sectionPanelProps={{
            sectionModeEnabled: sectionMode.sectionModeEnabled,
            sectionPlanePickingEnabled: sectionMode.sectionPlanePickingEnabled,
            activeSectionPlane: sectionMode.activeSectionPlane,
            onToggleSectionMode: sectionMode.toggleSectionMode,
            onNudge: sectionMode.nudgeSectionPlane,
            onAlignCamera: sectionMode.alignCameraToSection,
            onReset: sectionMode.clearSectionPlane,
            onResetOffset: sectionMode.resetPlaneOffset,
            onChangePlane: sectionMode.enableSectionPicking,
            sectionPlaneVisible: sectionMode.sectionPlaneVisible,
            onTogglePlaneVisibility: sectionMode.toggleSectionPlaneVisibility,
            sectionPlaneSize: sectionMode.sectionPlaneSize,
            onSectionPlaneSizeChange: sectionMode.setSectionPlaneSize
          }}
          viewerProps={{
            onMissed: selection.deselect,
            onRendererReady: handleRendererReady,
            onControlsReady: handleControlsReady
          }}
          sectionPlaneHelperProps={{
            activeSectionPlane: sectionMode.activeSectionPlane,
            visible: sectionMode.sectionPlaneVisible,
            size: sectionMode.sectionPlaneSize
          }}
          selectableModelProps={{
            url: modelUrls.glbUrl,
            metadataUrl: modelUrls.metadataUrl,
            onSelect: selection.handleSelect,
            onSceneReady: handleSceneReady,
            sectionModeEnabled: sectionMode.sectionModeEnabled,
            sectionPlanePickingEnabled: sectionMode.sectionPlanePickingEnabled,
            onSectionPick: handleSectionPick,
            position: [0, 0, 0],
            scale: 1,
            visible: !geometryHidden
          }}
          spaceOverlayProps={{
            enabled: spaceOverlay.spaceOverlayEnabled,
            jobId,
            onSpaceSelect: spaceOverlay.handleSpaceSelect,
            highlightedSpaceIds: spaceOverlay.highlightedSpaceIds,
            onStatus: spaceOverlay.setSpaceOverlayStatus,
            selectedSpaceId: spaceOverlay.selectedSpaceId,
            onSpacesLoaded: spaceOverlay.handleSpacesLoaded,
            occupancyData: occupancy.enabled ? occupancy.occupancyMap : null
          }}
          uploadPanelProps={{
            onModelReady: handleModelReady,
            hasModel: true,
            onReset: handleResetModel
          }}
          ecPanelProps={{
            isOpen: floatingPanels.ecPanelOpen,
            onClose: floatingPanels.handleCloseEcPanel,
            jobId,
            selectedId: selection.selectedId,
            onSelectContributor: handleTreeSelect,
            focusToken: floatingPanels.ecPanelZIndex,
            zIndex: floatingPanels.ecPanelZIndex
          }}
          hvacPanelProps={{
            isOpen: floatingPanels.hvacPanelOpen,
            onClose: floatingPanels.handleCloseHvacPanel,
            jobId,
            selectedId: selection.selectedId,
            onSelectEquipment: handleHvacSelectDetail,
            focusToken: floatingPanels.hvacPanelZIndex,
            zIndex: floatingPanels.hvacPanelZIndex,
            spaceOverlayLoading: spaceOverlay.spaceOverlayStatus.loading
          }}
          spaceNavigatorProps={spaceOverlay.spaceNavigatorProps}
          axisViewProps={{
            viewMode: viewModeState.viewMode,
            onSetViewMode: viewModeState.setViewMode
          }}
          occupancyLegendProps={{
            visible: occupancy.enabled,
            totals: occupancy.totals,
            timestamp: occupancy.timestamp
          }}
          occupancyPanelProps={{
            isOpen: occupancyPanelOpen,
            onClose: () => setOccupancyPanelOpen(false),
            occupancyData: occupancy.occupancyMap,
            totals: occupancy.totals,
            timestamp: occupancy.timestamp,
            onReset: occupancy.reset,
            onSpaceSelect: spaceOverlay.handleSpaceSelect,
            zIndex: 210
          }}
        />

        <PropertyPanel 
          selectedId={selection.selectedId}
          metadataUrl={modelUrls.metadataUrl}
        />
      </div>

      <ToastContainer />
    </div>
  )
}

export default App
