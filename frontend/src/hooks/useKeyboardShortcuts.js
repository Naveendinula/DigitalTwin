import { useEffect } from 'react'
import { VIEW_MODE_LABELS, VIEW_MODE_SHORTCUTS, VIEW_MODE_TOAST_DURATION_MS } from '../constants/viewModes'

const isTextInput = (target) => {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
}

const logCameraState = (cameraRef, controlsRef, showToast) => {
  if (!cameraRef.current || !controlsRef.current) return
  const cam = cameraRef.current
  const ctrl = controlsRef.current
  console.log('=== CAMERA STATE ===')
  console.log(`Position: (${cam.position.x.toFixed(3)}, ${cam.position.y.toFixed(3)}, ${cam.position.z.toFixed(3)})`)
  console.log(`Target: (${ctrl.target.x.toFixed(3)}, ${ctrl.target.y.toFixed(3)}, ${ctrl.target.z.toFixed(3)})`)
  console.log(`Up: (${cam.up.x.toFixed(3)}, ${cam.up.y.toFixed(3)}, ${cam.up.z.toFixed(3)})`)
  const dir = cam.position.clone().sub(ctrl.target).normalize()
  console.log(`Direction (normalized): (${dir.x.toFixed(3)}, ${dir.y.toFixed(3)}, ${dir.z.toFixed(3)})`)
  showToast('Camera state logged to console (press F12)', 'info', 3000)
}

const handleViewModeShortcut = (key, onSetViewMode, showToast) => {
  const viewMode = VIEW_MODE_SHORTCUTS[key]
  if (!viewMode) return false
  onSetViewMode(viewMode)
  showToast(`${VIEW_MODE_LABELS[viewMode]} view`, 'info', VIEW_MODE_TOAST_DURATION_MS)
  return true
}

export default function useKeyboardShortcuts({
  onClearSelection,
  onFocusSelection,
  onSetViewMode,
  showToast,
  cameraRef,
  controlsRef
}) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isTextInput(event.target)) return

      if (handleViewModeShortcut(event.key, onSetViewMode, showToast)) return

      switch (event.key) {
        case 'Escape':
          onClearSelection()
          showToast('Selection cleared', 'info', 2000)
          break
        case 'f':
        case 'F':
          onFocusSelection()
          break
        case 'c':
        case 'C':
          logCameraState(cameraRef, controlsRef, showToast)
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClearSelection, onFocusSelection, onSetViewMode, showToast, cameraRef, controlsRef])
}
