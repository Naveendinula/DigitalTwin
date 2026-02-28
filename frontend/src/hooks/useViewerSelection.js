import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getEcColor } from '../utils/colorUtils'
import { normalizeIds } from '../utils/selectionUtils'
import { debugLog } from '../utils/logger'

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
    debugLog('Viewer Mode:', mode)
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
    debugLog('Selected from tree:', globalIdOrIds, ecData)
    
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
      const targetLabel = ids.length === 1 ? String(ids[0]) : `${ids.length} elements`
      showToast(`No geometry found for "${targetLabel}"`, 'warning')
    } else if (result.count > 1) {
      showToast(`Focused on ${result.count} elements`, 'info', 2000)
    }
  }, [selectById, focusOnElements, showToast, enableXRay, disableXRay, isolatedIds])

  const handleHvacSelectDetail = useCallback((payload) => {
    if (!payload) return
    const ids = [payload.equipmentId, ...(payload.terminalIds || [])].filter(Boolean)
    if (ids.length === 0) return

    // enableXRay handles ALL meshes: ghosts non-selected (including previously
    // highlighted ones now that the highlight guard is removed) and restores
    // selected ones to original.  selectById then applies highlight on top.
    enableXRay(ids, { mode: 'ghost' })
    selectById(ids)

    enableSpaceOverlayForSpaces(payload.spaceIds)

    lastSelectedIdsRef.current = ids
    const result = focusOnElements(ids)
    if (!result.found) {
      showToast('No geometry found for selected equipment', 'warning')
    }
  }, [enableXRay, selectById, focusOnElements, showToast, enableSpaceOverlayForSpaces])

  // Track the last set of IDs we passed to updateXRaySelection / enableXRay
  // so the effect below can skip truly-redundant calls.
  const lastXRayIdsRef = useRef(null)

  useEffect(() => {
    if (!xRayEnabled) return

    // Build the full set of IDs that should remain solid.
    // lastSelectedIdsRef holds the multi-element set from handleHvacSelectDetail /
    // handleTreeSelect — this is essential because selectedId only contains the
    // *first* selected mesh's GlobalId, not all of them.
    const explicitIds = lastSelectedIdsRef.current || []
    const currentSelectedIds = normalizeIds(selectedId)
    const isolatedList = isolatedIds || []

    // Merge all sources, deduplicate
    const merged = new Set([...isolatedList, ...explicitIds, ...currentSelectedIds])
    const solidIds = Array.from(merged)

    if (solidIds.length === 0) {
      disableXRay()
      return
    }

    // Skip if identical IDs were already applied (e.g. by handleHvacSelectDetail)
    const prev = lastXRayIdsRef.current
    if (prev && prev.length === solidIds.length && prev.every((id, i) => id === solidIds[i])) {
      return
    }
    lastXRayIdsRef.current = solidIds
    updateXRaySelection(solidIds)
  }, [xRayEnabled, isolatedIds, selectedId, updateXRaySelection, disableXRay])

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
