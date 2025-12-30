import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEcColor } from '../utils/colorUtils'
import { normalizeIds } from '../utils/selectionUtils'

export default function useViewerSelection({
  selectedId,
  selectById,
  deselect,
  isolate,
  showAll,
  enableXRay,
  disableXRay,
  xRayEnabled,
  updateXRaySelection,
  focusOnElements,
  showToast,
  enableSpaceOverlayForSpaces
}) {
  const [isolatedIds, setIsolatedIds] = useState(null)
  const [focusLock, setFocusLock] = useState(true)
  const lastSelectedIdsRef = useRef(null)

  const mode = useMemo(() => {
    if (isolatedIds) return 'ISOLATE'
    if (selectedId) return 'FOCUS'
    return 'NORMAL'
  }, [isolatedIds, selectedId])

  useEffect(() => {
    console.log('Viewer Mode:', mode)
  }, [mode])

  const handleClearAll = useCallback(() => {
    deselect()
    disableXRay()
    showAll()
    setIsolatedIds(null)
    lastSelectedIdsRef.current = null
  }, [deselect, showAll, disableXRay])

  const focusOnCurrentSelection = useCallback(() => {
    const lastSelectedIds = lastSelectedIdsRef.current || []
    const selectedIds = normalizeIds(selectedId)
    const idsToFocus = lastSelectedIds.length > 0 ? lastSelectedIds : selectedIds
    if (idsToFocus.length === 0) {
      showToast('No element selected. Select an element first.', 'info')
      return
    }

    const result = focusOnElements(idsToFocus)
    if (!result.found) {
      showToast('No geometry found for selected element(s)', 'warning')
    }
  }, [focusOnElements, selectedId, showToast])

  const handleIsolate = useCallback((globalIds, options = {}) => {
    const { behavior = 'FOCUS' } = options

    if (globalIds === null) {
      disableXRay()
      showAll()
      setIsolatedIds(null)
    } else {
      if (behavior === 'ISOLATE') {
        disableXRay()
        isolate(globalIds)
      } else {
        showAll()
        enableXRay(globalIds, { mode: 'wireframe' })
      }
      setIsolatedIds(globalIds)
    }
  }, [isolate, showAll, enableXRay, disableXRay])

  const handleTreeSelect = useCallback((globalIdOrIds, ecData) => {
    console.log('Selected from tree:', globalIdOrIds, ecData)
    
    let options = {}
    const ids = normalizeIds(globalIdOrIds)

    if (ecData) {
      const { ecValue, minEc, maxEc } = ecData
      const color = getEcColor(ecValue, minEc, maxEc)
      options = { color }
      
      enableXRay(ids, { mode: 'wireframe' })
    } else if (!isolatedIds) {
      disableXRay()
    }

    selectById(globalIdOrIds, options)
    lastSelectedIdsRef.current = ids
    
    const result = focusOnElements(ids)
    
    if (!result.found) {
      showToast(`No geometry found for "${ids.length === 1 ? 'element' : ids.length + ' elements'}"`, 'warning')
    } else if (result.count > 1) {
      showToast(`Focused on ${result.count} elements`, 'info', 2000)
    }
  }, [selectById, focusOnElements, showToast, enableXRay, disableXRay, isolatedIds])

  const handleHvacSelectDetail = useCallback((payload) => {
    if (!payload) return
    const ids = [payload.equipmentId, ...(payload.terminalIds || [])].filter(Boolean)
    if (ids.length === 0) return

    showAll()
    enableXRay(ids, { mode: 'ghost' })
    selectById(ids)

    enableSpaceOverlayForSpaces(payload.spaceIds)

    lastSelectedIdsRef.current = ids
    const result = focusOnElements(ids)
    if (!result.found) {
      showToast('No geometry found for selected equipment', 'warning')
    }
  }, [showAll, enableXRay, selectById, focusOnElements, showToast, enableSpaceOverlayForSpaces])

  useEffect(() => {
    if (!xRayEnabled) return
    const solidIds = [...(isolatedIds || []), ...normalizeIds(selectedId)]
    updateXRaySelection(solidIds)
  }, [xRayEnabled, isolatedIds, selectedId, updateXRaySelection])

  useEffect(() => {
    if (mode === 'FOCUS' && !focusLock && selectedId) {
      const newIds = Array.isArray(selectedId) ? selectedId : [selectedId]
      const currentIds = isolatedIds || []
      const isDifferent = newIds.length !== currentIds.length || 
                         !newIds.every(id => currentIds.includes(id))
      
      if (isDifferent) {
        setIsolatedIds(newIds)
      }
    }
  }, [mode, focusLock, selectedId, isolatedIds])

  return {
    focusLock,
    setFocusLock,
    handleClearAll,
    handleIsolate,
    handleTreeSelect,
    handleHvacSelectDetail,
    focusOnCurrentSelection
  }
}
