import { useCallback, useState } from 'react'
import usePanelStacking from './usePanelStacking'

export default function useFloatingPanels(disableXRay) {
  const [ecPanelOpen, setEcPanelOpen] = useState(false)
  const [hvacPanelOpen, setHvacPanelOpen] = useState(false)
  const panelStacking = usePanelStacking()

  const handleCloseEcPanel = useCallback(() => {
    setEcPanelOpen(false)
    disableXRay()
  }, [disableXRay])

  const handleCloseHvacPanel = useCallback(() => {
    setHvacPanelOpen(false)
    disableXRay()
  }, [disableXRay])

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

  return {
    ecPanelOpen,
    hvacPanelOpen,
    ecPanelZIndex: panelStacking.ecPanelZIndex,
    hvacPanelZIndex: panelStacking.hvacPanelZIndex,
    handleCloseEcPanel,
    handleCloseHvacPanel,
    handleToggleEcPanel,
    handleToggleHvacPanel
  }
}
