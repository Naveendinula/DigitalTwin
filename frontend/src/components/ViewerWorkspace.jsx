import appStyles from '../constants/appStyles'
import DockedPanelContainer from './DockedPanelContainer'
import FloatingPanelLayer from './FloatingPanelLayer'
import LeftSidebar from './LeftSidebar'
import RightSidebar from './RightSidebar'
import StructureTree from './StructureTree'
import ViewerShell from './ViewerShell'
import { useViewerContext } from '../hooks/useViewerContext'

export default function ViewerWorkspace({
  structureTreeVisible,
  onToggleStructureTree,
  structurePanelWidth,
  onStartResize,
}) {
  const {
    modelUrls,
    jobId,
    selection,
    dockedPanels,
    focusLock,
    setFocusLock,
    handleIsolate,
    handleTreeSelect,
    sectionMode,
    viewModeState,
    spaceOverlay,
    occupancy,
    geometryHidden,
    handleToggleOccupancy,
    handleToggleOccupancyPanel,
    handleToggleGeometry,
  } = useViewerContext()

  const sidebarProps = {
    structureTreeVisible,
    onToggleStructureTree,
    sectionModeEnabled: sectionMode.sectionModeEnabled,
    onToggleSectionMode: sectionMode.toggleSectionMode,
    hasSectionPlane: !!sectionMode.activeSectionPlane,
    onClearSectionPlane: sectionMode.clearSectionPlane,
    viewMode: viewModeState.viewMode,
    onSetViewMode: viewModeState.setViewMode,
    availableViews: viewModeState.getAvailableViews(),
    onResetView: viewModeState.resetView,
    onFitToModel: viewModeState.fitToModel,
    onTogglePanel: dockedPanels.togglePanel,
    activePanel: dockedPanels.activePanel,
    floatingPanels: dockedPanels.floatingPanels,
    onToggleSpaceOverlay: spaceOverlay.toggleSpaceOverlay,
    spaceOverlayEnabled: spaceOverlay.spaceOverlayEnabled,
    spaceOverlayLoading: spaceOverlay.spaceOverlayStatus.loading,
    onToggleOccupancy: handleToggleOccupancy,
    occupancyEnabled: occupancy.enabled,
    onOpenOccupancyPanel: () => dockedPanels.togglePanel('occupancy'),
    geometryHidden,
    onToggleGeometry: handleToggleGeometry,
    hasModel: !!modelUrls,
  }

  return (
    <div style={{ ...appStyles.mainContent, position: 'relative' }}>
      <LeftSidebar {...sidebarProps} />

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
            onMouseDown={(event) => onStartResize('left', event)}
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

      <ViewerShell containerStyle={appStyles.viewerContainer} />

      <DockedPanelContainer
        activePanel={dockedPanels.activePanel}
        openPanels={dockedPanels.openPanels}
        onClose={dockedPanels.closePanel}
        onUndock={dockedPanels.undockPanel}
        floatingPanels={dockedPanels.floatingPanels}
      />

      <RightSidebar
        openPanels={dockedPanels.openPanels}
        activePanel={dockedPanels.activePanel}
        floatingPanels={dockedPanels.floatingPanels}
        dockZoneActive={dockedPanels.dockZoneActive}
        onToggle={dockedPanels.togglePanel}
        onClose={dockedPanels.closePanel}
      />

      {/* Dock-zone drop indicator — visible when dragging a floating panel near right edge */}
      {dockedPanels.dockZoneActive && (
        <div style={dockZoneStyles.indicator} />
      )}

      {/* Floating panels render as an absolute overlay */}
      <FloatingPanelLayer
        floatingPanels={dockedPanels.floatingPanels}
        onDock={dockedPanels.dockPanel}
        onClose={dockedPanels.closePanel}
        setDockZoneActive={dockedPanels.setDockZoneActive}
      />
    </div>
  )
}

const dockZoneStyles = {
  indicator: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '100px',
    background: 'linear-gradient(to right, transparent, rgba(59, 130, 246, 0.08))',
    borderRight: '3px solid rgba(59, 130, 246, 0.4)',
    pointerEvents: 'none',
    zIndex: 800,
    borderRadius: '0 12px 12px 0',
  },
}
