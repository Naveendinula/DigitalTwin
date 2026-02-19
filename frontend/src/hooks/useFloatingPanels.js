import { useCallback, useState } from 'react'
import usePanelStacking from './usePanelStacking'

export default function useFloatingPanels(disableXRay) {
  const [ecPanelOpen, setEcPanelOpen] = useState(false)
  const [hvacPanelOpen, setHvacPanelOpen] = useState(false)
  const [idsValidationPanelOpen, setIdsValidationPanelOpen] = useState(false)
  const [workOrdersPanelOpen, setWorkOrdersPanelOpen] = useState(false)
  const panelStacking = usePanelStacking()

  const handleCloseEcPanel = useCallback(() => {
    setEcPanelOpen(false)
    disableXRay()
  }, [disableXRay])

  const handleCloseHvacPanel = useCallback(() => {
    setHvacPanelOpen(false)
    disableXRay()
  }, [disableXRay])

  const handleCloseIdsValidationPanel = useCallback(() => {
    setIdsValidationPanelOpen(false)
  }, [])

  const handleCloseWorkOrdersPanel = useCallback(() => {
    setWorkOrdersPanelOpen(false)
  }, [])

  const handleToggleEcPanel = useCallback(() => {
    panelStacking.togglePanel({
      isOpen: ecPanelOpen,
      panelZIndex: panelStacking.ecPanelZIndex,
      setIsOpen: setEcPanelOpen,
      setPanelZIndex: panelStacking.setEcPanelZIndex,
      onClose: handleCloseEcPanel
    })
  }, [panelStacking.togglePanel, panelStacking.ecPanelZIndex, panelStacking.setEcPanelZIndex, ecPanelOpen, handleCloseEcPanel])

  const handleToggleHvacPanel = useCallback(() => {
    panelStacking.togglePanel({
      isOpen: hvacPanelOpen,
      panelZIndex: panelStacking.hvacPanelZIndex,
      setIsOpen: setHvacPanelOpen,
      setPanelZIndex: panelStacking.setHvacPanelZIndex,
      onClose: handleCloseHvacPanel
    })
  }, [panelStacking.togglePanel, panelStacking.hvacPanelZIndex, panelStacking.setHvacPanelZIndex, hvacPanelOpen, handleCloseHvacPanel])

  const handleToggleIdsValidationPanel = useCallback(() => {
    panelStacking.togglePanel({
      isOpen: idsValidationPanelOpen,
      panelZIndex: panelStacking.idsValidationPanelZIndex,
      setIsOpen: setIdsValidationPanelOpen,
      setPanelZIndex: panelStacking.setIdsValidationPanelZIndex,
      onClose: handleCloseIdsValidationPanel
    })
  }, [panelStacking.togglePanel, panelStacking.idsValidationPanelZIndex, panelStacking.setIdsValidationPanelZIndex, idsValidationPanelOpen, handleCloseIdsValidationPanel])

  const handleToggleWorkOrdersPanel = useCallback(() => {
    panelStacking.togglePanel({
      isOpen: workOrdersPanelOpen,
      panelZIndex: panelStacking.workOrdersPanelZIndex,
      setIsOpen: setWorkOrdersPanelOpen,
      setPanelZIndex: panelStacking.setWorkOrdersPanelZIndex,
      onClose: handleCloseWorkOrdersPanel
    })
  }, [panelStacking.togglePanel, panelStacking.workOrdersPanelZIndex, panelStacking.setWorkOrdersPanelZIndex, workOrdersPanelOpen, handleCloseWorkOrdersPanel])

  const handleOpenWorkOrdersPanel = useCallback(() => {
    // Open/focus the panel without the "toggle-to-close when topmost" behavior.
    panelStacking.togglePanel({
      isOpen: false,
      panelZIndex: panelStacking.workOrdersPanelZIndex,
      setIsOpen: setWorkOrdersPanelOpen,
      setPanelZIndex: panelStacking.setWorkOrdersPanelZIndex,
      onClose: handleCloseWorkOrdersPanel
    })
  }, [panelStacking.togglePanel, panelStacking.workOrdersPanelZIndex, panelStacking.setWorkOrdersPanelZIndex, handleCloseWorkOrdersPanel])

  return {
    ecPanelOpen,
    hvacPanelOpen,
    idsValidationPanelOpen,
    workOrdersPanelOpen,
    ecPanelZIndex: panelStacking.ecPanelZIndex,
    hvacPanelZIndex: panelStacking.hvacPanelZIndex,
    idsValidationPanelZIndex: panelStacking.idsValidationPanelZIndex,
    workOrdersPanelZIndex: panelStacking.workOrdersPanelZIndex,
    handleCloseEcPanel,
    handleCloseHvacPanel,
    handleCloseIdsValidationPanel,
    handleCloseWorkOrdersPanel,
    handleToggleEcPanel,
    handleToggleHvacPanel,
    handleToggleIdsValidationPanel,
    handleToggleWorkOrdersPanel,
    handleOpenWorkOrdersPanel
  }
}
