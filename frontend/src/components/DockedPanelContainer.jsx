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
 * DockedPanelContainer
 *
 * Renders all open (non-floating) panels, hiding inactive ones with
 * display:'none' so their internal state is preserved across tab switches.
 * The active panel is visible; others stay mounted but hidden.
 */
export default function DockedPanelContainer({ activePanel, onClose, onUndock, openPanels = [], floatingPanels = [] }) {
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
    workOrderMarkers,
    woScrollTarget,
    setWoScrollTarget,
  } = useViewerContext()

  // Panels that should stay mounted: open and not floating
  const dockedKeys = openPanels.filter(k => !floatingPanels.includes(k))
  if (dockedKeys.length === 0) return null
  const hasActiveDockedPanel = !!activePanel && dockedKeys.includes(activePanel)

  const renderPanel = (key) => {
    const handleClosePanel = () => onClose(key)

    switch (key) {
      case 'properties':
        return (
          <PropertyPanel
            selectedId={selection.selectedId}
            metadataUrl={modelUrls?.metadataUrl}
            jobId={jobId}
            onOpenWorkOrdersPanel={() => dockedPanels.openPanel('work-orders')}
          />
        )

      case 'ec':
        return (
          <EcPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectContributor={handleTreeSelect}
            focusToken={null}
            zIndex={1}
          />
        )

      case 'hvac':
        return (
          <HvacFmPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectEquipment={handleHvacSelectDetail}
            focusToken={null}
            zIndex={1}
            spaceOverlayLoading={spaceOverlay.spaceOverlayStatus.loading}
          />
        )

      case 'graph':
        return (
          <GraphQueryPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            onSelectResult={handleGraphSelectResult}
            onSelectResultBatch={handleGraphSelectBatch}
            focusToken={null}
            zIndex={1}
          />
        )

      case 'ids-validation':
        return (
          <IdsValidationPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            focusToken={null}
            zIndex={1}
          />
        )

      case 'work-orders':
        return (
          <WorkOrdersPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            selectedId={selection.selectedId}
            metadataUrl={modelUrls?.metadataUrl || ''}
            onSelectWorkOrder={handleTreeSelect}
            focusToken={null}
            zIndex={1}
            scrollToGlobalId={woScrollTarget}
            onScrollToConsumed={() => setWoScrollTarget(null)}
            onWorkOrdersChanged={workOrderMarkers.refresh}
          />
        )

      case 'llm-chat':
        return (
          <LlmChatPanel
            isOpen
            onClose={handleClosePanel}
            jobId={jobId}
            onSelectResult={handleGraphSelectResult}
            focusToken={null}
            zIndex={1}
          />
        )

      case 'occupancy':
        return (
          <OccupancyPanel
            isOpen
            onClose={handleClosePanel}
            occupancyData={occupancy.occupancyMap}
            totals={occupancy.totals}
            timestamp={occupancy.timestamp}
            onReset={occupancy.reset}
            onSpaceSelect={spaceOverlay.handleSpaceSelect}
            zIndex={1}
          />
        )

      default:
        return null
    }
  }

  return (
    <div style={{
      ...styles.container,
      ...(hasActiveDockedPanel ? null : styles.containerHidden),
    }}>
      {dockedKeys.map(key => {
        const isVisible = key === activePanel
        const contextValue = {
          docked: true,
          onUndock: () => onUndock?.(key),
        }
        return (
          <DockedContext.Provider key={key} value={contextValue}>
            <div style={{
              display: isVisible ? 'flex' : 'none',
              flexDirection: 'column',
              width: '100%',
              height: '100%',
              overflow: 'hidden',
            }}>
              {renderPanel(key)}
            </div>
          </DockedContext.Provider>
        )
      })}
    </div>
  )
}

const styles = {
  container: {
    width: '400px',
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: '12px',
    border: '1px solid rgba(0, 0, 0, 0.04)',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.06)',
    background: '#ffffff',
  },
  containerHidden: {
    display: 'none',
  },
}
