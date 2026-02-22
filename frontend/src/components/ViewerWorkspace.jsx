import appStyles from '../constants/appStyles'
import PropertyPanel from './PropertyPanel'
import StructureTree from './StructureTree'
import ViewerShell from './ViewerShell'
import { useViewerContext } from '../hooks/useViewerContext'

export default function ViewerWorkspace({
  structureTreeVisible,
  propertiesPanelVisible,
  onToggleStructureTree,
  onTogglePropertiesPanel,
  structurePanelWidth,
  propertiesPanelWidth,
  onStartResize,
}) {
  const {
    modelUrls,
    jobId,
    selection,
    floatingPanels,
    focusLock,
    setFocusLock,
    handleIsolate,
    handleTreeSelect,
  } = useViewerContext()

  return (
    <div style={appStyles.mainContent}>
      <button
        data-panel-toggle
        onClick={onToggleStructureTree}
        title={structureTreeVisible ? 'Hide Structure Tree' : 'Show Structure Tree'}
        style={{
          ...appStyles.panelToggle,
          ...appStyles.panelToggleLeft,
          ...(structureTreeVisible ? {} : appStyles.panelToggleHidden),
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
        onClick={onTogglePropertiesPanel}
        title={propertiesPanelVisible ? 'Hide Properties Panel' : 'Show Properties Panel'}
        style={{
          ...appStyles.panelToggle,
          ...appStyles.panelToggleRight,
          ...(propertiesPanelVisible ? {} : appStyles.panelToggleHidden),
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

      {propertiesPanelVisible && (
        <div style={{ width: propertiesPanelWidth, position: 'relative', display: 'flex', flexShrink: 0 }}>
          <div
            onMouseDown={(event) => onStartResize('right', event)}
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
            onOpenWorkOrdersPanel={floatingPanels.handleOpenWorkOrdersPanel}
          />
        </div>
      )}
    </div>
  )
}
