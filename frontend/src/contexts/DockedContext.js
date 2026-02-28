import { createContext, useContext } from 'react'

/**
 * DockedContext signals DraggablePanel how to render:
 *
 *  { docked: true,  onUndock }         → static container; drag-handle starts undock gesture
 *  { docked: false, onDock, setDockZoneActive } → floating; drag near right edge to dock
 *
 * Default is floating (no callbacks).
 */
export const DockedContext = createContext({ docked: false })

export function useDockedContext() {
  return useContext(DockedContext)
}
