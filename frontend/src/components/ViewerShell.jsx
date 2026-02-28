import AxisViewWidget from './AxisViewWidget'
import KeyboardHints from './KeyboardHints'
import OccupancyLegend from './OccupancyLegend'
import SectionPlaneHelper from './SectionPlaneHelper'
import SectionPlanePanel from './SectionPlanePanel'
import SelectableModel from './SelectableModelWithVisibility'
import SpaceBboxOverlay from './SpaceBboxOverlay'
import SpaceNavigator from './SpaceNavigator'
import UploadPanel from './UploadPanel'
import Viewer from './Viewer'
import { WorkOrderMarkersInner } from './WorkOrderMarkers'
import { useViewerContext } from '../hooks/useViewerContext'

export default function ViewerShell({ containerStyle }) {
  const viewer = useViewerContext()
  const {
    modelUrls,
    jobId,
    selection,
    sectionMode,
    viewModeState,
    spaceOverlay,
    occupancy,
    geometryHidden,
    sceneIndex,
    workOrderMarkers,
    setWoScrollTarget,
    handleModelReady,
    handleResetModel,
    handleSectionPick,
    handleSceneReady,
    handleRendererReady,
    handleControlsReady
  } = viewer

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

  return (
    <div style={containerStyle}>
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
        {workOrderMarkers.markerData.length > 0 && (
          <WorkOrderMarkersInner
            markerData={workOrderMarkers.markerData}
            onMarkerClick={(globalId) => setWoScrollTarget(globalId)}
            sceneIndex={sceneIndex}
          />
        )}
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

      {showSpaceNavigator && <SpaceNavigator {...navigatorProps} />}

      <OccupancyLegend {...occupancyLegendProps} />

      <KeyboardHints />

      <AxisViewWidget {...axisViewProps} />
    </div>
  )
}
