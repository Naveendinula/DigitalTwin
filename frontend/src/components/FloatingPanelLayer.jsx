import React from 'react'
import { DockedContext } from '../contexts/DockedContext'
import { useViewerContext } from '../hooks/useViewerContext'
import EcPanel from './EcPanel'
import GraphQueryPanel from './GraphQueryPanel'
import HvacFmPanel from './HvacFmPanel'
import IdsValidationPanel from './IdsValidationPanel'
import LlmChatPanel from './LlmChatPanel'
import OccupancyPanel from './OccupancyPanel'
import PropertyPanel from './PropertyPanel'
import WorkOrdersPanel from './WorkOrdersPanel'

/**
 * FloatingPanelLayer
 *
 * Absolute overlay that renders all panels currently in floating mode.
 * Each panel gets a DockedContext with { docked: false, onDock, setDockZoneActive }
 * so DraggablePanel enables drag-to-dock when the cursor reaches the right edge.
 */
export default function FloatingPanelLayer({ floatingPanels, onDock, onClose, setDockZoneActive }) {
  const {
    modelUrls,
    jobId,
    selection,
    spaceOverlay,
    occupancy,
    dockedPanels,
    handleTreeSelect,
    handleGraphSelectResult,
    handleGraphSelectBatch,
    handleHvacSelectDetail,
  } = useViewerContext()

  if (!floatingPanels || floatingPanels.length === 0) return null

  const renderPanel = (key) => {
    const handleClosePanel = () => onClose(key)

    const contextValue = {
      docked: false,
      onDock: () => onDock(key),
      setDockZoneActive,
    }

    let content
    switch (key) {
      case 'properties':
        content = (
          <PropertyPanel
            selectedId={selection.selectedId}
            metadataUrl={modelUrls?.metadataUrl}
            jobId={jobId}
            onOpenWorkOrdersPanel={() => dockedPanels.openPanel('work-orders')}
          />
        )
        break

      case 'ec':
        content = (
          <EcPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectContributor={handleTreeSelect}
            focusToken={null}
            zIndex={1000}
          />
        )
        break

      case 'hvac':
        content = (
          <HvacFmPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectEquipment={handleHvacSelectDetail}
            focusToken={null}
            zIndex={1000}
            spaceOverlayLoading={spaceOverlay.spaceOverlayStatus.loading}
          />
        )
        break

      case 'graph':
        content = (
          <GraphQueryPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectResult={handleGraphSelectResult}
            onSelectResultBatch={handleGraphSelectBatch}
            focusToken={null}
            zIndex={1000}
          />
        )
        break

      case 'ids-validation':
        content = (
          <IdsValidationPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            focusToken={null}
            zIndex={1000}
          />
        )
        break

      case 'work-orders':
        content = (
          <WorkOrdersPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            metadataUrl={modelUrls?.metadataUrl || ''}
            onSelectWorkOrder={handleTreeSelect}
            focusToken={null}
            zIndex={1000}
          />
        )
        break

      case 'llm-chat':
        content = (
          <LlmChatPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            onSelectResult={handleGraphSelectResult}
            focusToken={null}
            zIndex={1000}
          />
        )
        break

      case 'occupancy':
        content = (
          <OccupancyPanel
            isOpen
            onClose={handleClosePanel}
            occupancyData={occupancy.occupancyMap}
            totals={occupancy.totals}
            timestamp={occupancy.timestamp}
            onReset={occupancy.reset}
            onSpaceSelect={spaceOverlay.handleSpaceSelect}
            zIndex={1000}
          />
        )
        break

      default:
        return null
    }

    return (
      <DockedContext.Provider key={key} value={contextValue}>
        <div style={{ pointerEvents: 'auto' }}>
          {content}
        </div>
      </DockedContext.Provider>
    )
  }

  return (
    <div style={styles.overlay}>
      {floatingPanels.map(renderPanel)}
    </div>
  )
}

const styles = {
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none',
    zIndex: 900,
  },
}
