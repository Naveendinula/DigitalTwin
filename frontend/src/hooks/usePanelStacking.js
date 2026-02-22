import { useCallback, useState } from 'react'

const INITIAL_PANEL_Z_INDEX = 1000

export default function usePanelStacking() {
  const [panelZCounter, setPanelZCounter] = useState(INITIAL_PANEL_Z_INDEX)
  const [ecPanelZIndex, setEcPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)
  const [hvacPanelZIndex, setHvacPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)
  const [graphPanelZIndex, setGraphPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)
  const [idsValidationPanelZIndex, setIdsValidationPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)
  const [workOrdersPanelZIndex, setWorkOrdersPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)
  const [llmChatPanelZIndex, setLlmChatPanelZIndex] = useState(INITIAL_PANEL_Z_INDEX)

  const bringToFront = useCallback((setPanelZIndex) => {
    setPanelZCounter(prev => {
      const next = prev + 1
      setPanelZIndex(next)
      return next
    })
  }, [])

  const togglePanel = useCallback(({
    isOpen,
    panelZIndex,
    setIsOpen,
    setPanelZIndex,
    onClose
  }) => {
    if (!isOpen) {
      setIsOpen(true)
      bringToFront(setPanelZIndex)
      return
    }

    if (panelZIndex === panelZCounter) {
      onClose()
      return
    }

    bringToFront(setPanelZIndex)
  }, [bringToFront, panelZCounter])

  return {
    ecPanelZIndex,
    hvacPanelZIndex,
    graphPanelZIndex,
    idsValidationPanelZIndex,
    workOrdersPanelZIndex,
    llmChatPanelZIndex,
    setEcPanelZIndex,
    setHvacPanelZIndex,
    setGraphPanelZIndex,
    setIdsValidationPanelZIndex,
    setWorkOrdersPanelZIndex,
    setLlmChatPanelZIndex,
    togglePanel
  }
}
