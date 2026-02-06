import { useEffect } from 'react'
import { VIEW_MODE_LABELS, VIEW_MODE_SHORTCUTS, VIEW_MODE_TOAST_DURATION_MS } from '../constants/viewModes'

const isTextInput = (target) => {
  return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
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
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClearSelection, onFocusSelection, onSetViewMode, showToast, cameraRef, controlsRef])
}
