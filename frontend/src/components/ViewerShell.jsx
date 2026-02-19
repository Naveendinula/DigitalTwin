import AxisViewWidget from './AxisViewWidget'
import EcPanel from './EcPanel'
import HvacFmPanel from './HvacFmPanel'
import IdsValidationPanel from './IdsValidationPanel'
import KeyboardHints from './KeyboardHints'
import OccupancyLegend from './OccupancyLegend'
import OccupancyPanel from './OccupancyPanel'
import WorkOrdersPanel from './WorkOrdersPanel'
import SectionPlaneHelper from './SectionPlaneHelper'
import SectionPlanePanel from './SectionPlanePanel'
import SelectableModel from './SelectableModelWithVisibility'
import SpaceBboxOverlay from './SpaceBboxOverlay'
import SpaceNavigator from './SpaceNavigator'
import UploadPanel from './UploadPanel'
import Viewer from './Viewer'
import ViewerToolbar from './ViewerToolbar'

export default function ViewerShell({ 
  containerStyle, 
  viewer, 
  structureTreeVisible,
  propertiesPanelVisible,
  onToggleStructureTree,
  onTogglePropertiesPanel
}) {
  const {
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
  } = viewer

  const viewerToolbarProps = {
    sectionModeEnabled: sectionMode.sectionModeEnabled,
    onToggleSectionMode: sectionMode.toggleSectionMode,
    hasSectionPlane: !!sectionMode.activeSectionPlane,
    onClearSectionPlane: sectionMode.clearSectionPlane,
    viewMode: viewModeState.viewMode,
    onSetViewMode: viewModeState.setViewMode,
    availableViews: viewModeState.getAvailableViews(),
    onResetView: viewModeState.resetView,
    onFitToModel: viewModeState.fitToModel,
    onOpenEcPanel: floatingPanels.handleToggleEcPanel,
    onOpenHvacPanel: floatingPanels.handleToggleHvacPanel,
    onOpenWorkOrdersPanel: floatingPanels.handleToggleWorkOrdersPanel,
    onOpenIdsValidationPanel: floatingPanels.handleToggleIdsValidationPanel,
    onToggleSpaceOverlay: spaceOverlay.toggleSpaceOverlay,
    spaceOverlayEnabled: spaceOverlay.spaceOverlayEnabled,
    spaceOverlayLoading: spaceOverlay.spaceOverlayStatus.loading,
    onToggleOccupancy: handleToggleOccupancy,
    occupancyEnabled: occupancy.enabled,
    onOpenOccupancyPanel: handleToggleOccupancyPanel,
    geometryHidden,
    onToggleGeometry: handleToggleGeometry,
    hasModel: !!modelUrls
  }

  const sectionPanelProps = {
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
  }

  const viewerProps = {
    onMissed: selection.deselect,
    onRendererReady: handleRendererReady,
    onControlsReady: handleControlsReady
  }

  const sectionPlaneHelperProps = {
    activeSectionPlane: sectionMode.activeSectionPlane,
    visible: sectionMode.sectionPlaneVisible,
    size: sectionMode.sectionPlaneSize
  }

  const selectableModelProps = {
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
  }

  const hasGeometry = !!modelUrls.glbUrl

  const spaceOverlayProps = {
    enabled: spaceOverlay.spaceOverlayEnabled,
    jobId,
    onSpaceSelect: spaceOverlay.handleSpaceSelect,
    highlightedSpaceIds: spaceOverlay.highlightedSpaceIds,
    onStatus: spaceOverlay.setSpaceOverlayStatus,
    selectedSpaceId: spaceOverlay.selectedSpaceId,
    onSpacesLoaded: spaceOverlay.handleSpacesLoaded,
    occupancyData: occupancy.enabled ? occupancy.occupancyMap : null
  }

  const uploadPanelProps = {
    onModelReady: handleModelReady,
    hasModel: true,
    onReset: handleResetModel
  }

  const ecPanelProps = {
    isOpen: floatingPanels.ecPanelOpen,
    onClose: floatingPanels.handleCloseEcPanel,
    jobId,
    selectedId: selection.selectedId,
    onSelectContributor: handleTreeSelect,
    focusToken: floatingPanels.ecPanelZIndex,
    zIndex: floatingPanels.ecPanelZIndex
  }

  const hvacPanelProps = {
    isOpen: floatingPanels.hvacPanelOpen,
    onClose: floatingPanels.handleCloseHvacPanel,
    jobId,
    selectedId: selection.selectedId,
    onSelectEquipment: handleHvacSelectDetail,
    focusToken: floatingPanels.hvacPanelZIndex,
    zIndex: floatingPanels.hvacPanelZIndex,
    spaceOverlayLoading: spaceOverlay.spaceOverlayStatus.loading
  }

  const idsValidationPanelProps = {
    isOpen: floatingPanels.idsValidationPanelOpen,
    onClose: floatingPanels.handleCloseIdsValidationPanel,
    jobId,
    focusToken: floatingPanels.idsValidationPanelZIndex,
    zIndex: floatingPanels.idsValidationPanelZIndex
  }

  const workOrdersPanelProps = {
    isOpen: floatingPanels.workOrdersPanelOpen,
    onClose: floatingPanels.handleCloseWorkOrdersPanel,
    jobId,
    selectedId: selection.selectedId,
    metadataUrl: modelUrls?.metadataUrl || '',
    onSelectWorkOrder: handleTreeSelect,
    focusToken: floatingPanels.workOrdersPanelZIndex,
    zIndex: floatingPanels.workOrdersPanelZIndex
  }

  const spaceNavigatorProps = spaceOverlay.spaceNavigatorProps
  const { visible: showSpaceNavigator, ...navigatorProps } = spaceNavigatorProps || {}

  const axisViewProps = {
    viewMode: viewModeState.viewMode,
    onSetViewMode: viewModeState.setViewMode
  }

  const occupancyLegendProps = {
    visible: occupancy.enabled,
    totals: occupancy.totals,
    timestamp: occupancy.timestamp
  }

  const occupancyPanelProps = {
    isOpen: occupancyPanelOpen,
    onClose: () => setOccupancyPanelOpen(false),
    occupancyData: occupancy.occupancyMap,
    totals: occupancy.totals,
    timestamp: occupancy.timestamp,
    onReset: occupancy.reset,
    onSpaceSelect: spaceOverlay.handleSpaceSelect,
    zIndex: 210
  }

  return (
    <div style={containerStyle}>
      <ViewerToolbar {...viewerToolbarProps} />

      <SectionPlanePanel {...sectionPanelProps} />

      <Viewer {...viewerProps}>
        <SectionPlaneHelper {...sectionPlaneHelperProps} />
        {hasGeometry ? (
          <SelectableModel {...selectableModelProps} />
        ) : (
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.1, 0.1, 0.1]} />
            <meshBasicMaterial color="#cccccc" transparent opacity={0} />
          </mesh>
        )}
        <SpaceBboxOverlay {...spaceOverlayProps} />
      </Viewer>

      {!hasGeometry && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          padding: '2rem',
          background: 'rgba(255, 255, 255, 0.95)',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          textAlign: 'center',
          maxWidth: '400px',
          pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '1rem', opacity: 0.5 }}>📦</div>
          <div style={{ fontSize: '16px', fontWeight: '500', color: '#333', marginBottom: '0.5rem' }}>
            No 3D Geometry Available
          </div>
          <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.5' }}>
            This IFC file contains only data entities without geometric representations.
            You can still access metadata and other analysis results.
          </div>
        </div>
      )}

      <UploadPanel {...uploadPanelProps} />

      <EcPanel {...ecPanelProps} />
      <HvacFmPanel {...hvacPanelProps} />
      <IdsValidationPanel {...idsValidationPanelProps} />
      <WorkOrdersPanel {...workOrdersPanelProps} />
      <OccupancyPanel {...occupancyPanelProps} />

      {showSpaceNavigator && <SpaceNavigator {...navigatorProps} />}

      <OccupancyLegend {...occupancyLegendProps} />

      <KeyboardHints />

      <AxisViewWidget {...axisViewProps} />
    </div>
  )
}
