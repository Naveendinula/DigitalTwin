import { useCallback, useRef, useState } from 'react'

/**
 * Panel configuration: key → metadata for each dockable panel.
 */
export const PANEL_CONFIG = {
  properties:       { label: 'Properties',       iconKey: 'properties' },
  ec:               { label: 'Embodied Carbon',  iconKey: 'ec' },
  hvac:             { label: 'HVAC / FM',        iconKey: 'hvac' },
  graph:            { label: 'Graph Query',      iconKey: 'graph' },
  'ids-validation': { label: 'IDS Validation',   iconKey: 'ids-validation' },
  'work-orders':    { label: 'Work Orders',      iconKey: 'work-orders' },
  'llm-chat':       { label: 'Ask AI',           iconKey: 'llm-chat' },
  occupancy:        { label: 'Occupancy',        iconKey: 'occupancy' },
}

/**
 * useDockedPanels
 *
 * Manages which panels are "open" (have icons on the right sidebar),
 * which one is currently "active" (visible in the docked area),
 * and which ones are floating (dragged out of the dock).
 *
 * Only one panel is docked at a time.  Multiple panels can float simultaneously.
 *
 * @param {function} disableXRay - called when EC or HVAC panels close
 */
export default function useDockedPanels(disableXRay) {
  const [activePanel, setActivePanel] = useState(null)
  const [openPanels, setOpenPanels] = useState([])
  const [floatingPanels, setFloatingPanels] = useState([])
  const [dockZoneActive, setDockZoneActive] = useState(false)

  // Ref so stable callbacks can read the latest floatingPanels without re-creating
  const floatingRef = useRef(floatingPanels)
  floatingRef.current = floatingPanels

  /** Open a panel: add to sidebar icons + make it the active/visible docked one */
  const openPanel = useCallback((key) => {
    setOpenPanels(prev => prev.includes(key) ? prev : [...prev, key])
    // If it's currently floating, dock it back
    setFloatingPanels(prev => prev.filter(k => k !== key))
    setActivePanel(key)
  }, [])

  /** Close a panel: remove from everywhere */
  const closePanel = useCallback((key) => {
    setOpenPanels(prev => prev.filter(k => k !== key))
    setFloatingPanels(prev => prev.filter(k => k !== key))
    setActivePanel(prev => (prev === key ? null : prev))
    if (key === 'ec' || key === 'hvac') disableXRay?.()
  }, [disableXRay])

  /**
   * Toggle a panel:
   * - Floating      → dock it (remove from floating, make active)
   * - Not open yet  → open and dock it
   * - Docked+active → minimize (hide panel but keep icon)
   * - Docked+hidden → activate (bring to front)
   */
  const togglePanel = useCallback((key) => {
    // If floating, dock it back
    if (floatingRef.current.includes(key)) {
      setFloatingPanels(prev => prev.filter(k => k !== key))
      setActivePanel(key)
      return
    }
    setOpenPanels(prev => {
      if (!prev.includes(key)) return [...prev, key]
      return prev
    })
    setActivePanel(prev => {
      if (prev === key) return null // minimize
      return key // activate
    })
  }, [])

  /** Undock: move panel from docked area to floating */
  const undockPanel = useCallback((key) => {
    setOpenPanels(prev => prev.includes(key) ? prev : [...prev, key])
    setFloatingPanels(prev => prev.includes(key) ? prev : [...prev, key])
    setActivePanel(prev => (prev === key ? null : prev))
  }, [])

  /** Dock: move panel from floating back to docked area (previous active is minimized) */
  const dockPanel = useCallback((key) => {
    setFloatingPanels(prev => prev.filter(k => k !== key))
    setActivePanel(key)
  }, [])

  /** Close all panels (used on model reset) */
  const closeAllPanels = useCallback(() => {
    setOpenPanels([])
    setFloatingPanels([])
    setActivePanel(null)
    setDockZoneActive(false)
    disableXRay?.()
  }, [disableXRay])

  return {
    activePanel,
    openPanels,
    floatingPanels,
    dockZoneActive,
    openPanel,
    closePanel,
    togglePanel,
    closeAllPanels,
    undockPanel,
    dockPanel,
    setDockZoneActive,
  }
}
