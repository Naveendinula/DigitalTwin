import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const createSpaceOverlayStatus = (overrides = {}) => ({
  hasSpaces: false,
  count: 0,
  error: null,
  loading: false,
  checked: false,
  ...overrides
})

export default function useSpaceOverlay({ jobId, showToast }) {
  const [spaceOverlayEnabled, setSpaceOverlayEnabled] = useState(false)
  const [highlightedSpaceIds, setHighlightedSpaceIds] = useState([])
  const [spaceOverlayStatus, setSpaceOverlayStatus] = useState(createSpaceOverlayStatus())
  const [allSpaces, setAllSpaces] = useState([])
  const [selectedSpaceIndex, setSelectedSpaceIndex] = useState(-1)
  const lastSpaceToastRef = useRef({ jobId: null, type: null })

  const disableSpaceOverlay = useCallback(() => {
    setSpaceOverlayEnabled(false)
    setHighlightedSpaceIds([])
    setSelectedSpaceIndex(-1)
  }, [])

  const toggleSpaceOverlay = useCallback(() => {
    setSpaceOverlayEnabled(prev => {
      const next = !prev
      if (next) {
        setSpaceOverlayStatus(createSpaceOverlayStatus({ loading: true }))
      }
      return next
    })
  }, [])

  const enableSpaceOverlayForSpaces = useCallback((spaceIds) => {
    const ids = (spaceIds || []).filter(Boolean)
    if (ids.length === 0) {
      setHighlightedSpaceIds([])
      setSpaceOverlayEnabled(false)
      return
    }
    if (!spaceOverlayEnabled) {
      setSpaceOverlayStatus(createSpaceOverlayStatus({ loading: true }))
      setSpaceOverlayEnabled(true)
    }
    setHighlightedSpaceIds(ids)
  }, [spaceOverlayEnabled])

  const handleSpacesLoaded = useCallback((spaces) => {
    setAllSpaces(spaces)
    setSelectedSpaceIndex(-1)
  }, [])

  const handleNextSpace = useCallback(() => {
    if (allSpaces.length === 0) return
    setSelectedSpaceIndex(prev => {
      const next = prev + 1
      return next >= allSpaces.length ? 0 : next
    })
  }, [allSpaces.length])

  const handlePrevSpace = useCallback(() => {
    if (allSpaces.length === 0) return
    setSelectedSpaceIndex(prev => {
      const next = prev - 1
      return next < 0 ? allSpaces.length - 1 : next
    })
  }, [allSpaces.length])

  const handleSpaceSelect = useCallback((id) => {
    console.log('Space selected:', id)
    if (highlightedSpaceIds.length === 0 && allSpaces.length > 0) {
      const idx = allSpaces.findIndex(space => space.globalId === id)
      if (idx !== -1) setSelectedSpaceIndex(idx)
    }
  }, [highlightedSpaceIds.length, allSpaces])

  const showSpaceNavigator = spaceOverlayEnabled && highlightedSpaceIds.length === 0 && allSpaces.length > 0
  const spaceNavigatorName = selectedSpaceIndex >= 0 && allSpaces[selectedSpaceIndex]
    ? `${allSpaces[selectedSpaceIndex].room_no || ''} ${allSpaces[selectedSpaceIndex].room_name || allSpaces[selectedSpaceIndex].name || ''}`.trim()
    : 'Select a space'

  const spaceNavigatorProps = {
    visible: showSpaceNavigator,
    currentIndex: selectedSpaceIndex >= 0 ? selectedSpaceIndex + 1 : 0,
    totalCount: allSpaces.length,
    currentName: spaceNavigatorName,
    onNext: handleNextSpace,
    onPrev: handlePrevSpace
  }

  const selectedSpaceId = useMemo(() => {
    if (selectedSpaceIndex < 0 || !allSpaces[selectedSpaceIndex]) return null
    return allSpaces[selectedSpaceIndex].globalId
  }, [selectedSpaceIndex, allSpaces])

  useEffect(() => {
    if (!spaceOverlayEnabled) {
      setHighlightedSpaceIds([])
      setSelectedSpaceIndex(-1)
    }
  }, [spaceOverlayEnabled])

  useEffect(() => {
    if (!spaceOverlayEnabled) return
    if (!spaceOverlayStatus.checked || spaceOverlayStatus.loading) return
    if (spaceOverlayStatus.error) {
      if (lastSpaceToastRef.current.jobId !== jobId || lastSpaceToastRef.current.type !== 'error') {
        showToast(`Spaces overlay error: ${spaceOverlayStatus.error}`, 'warning')
        lastSpaceToastRef.current = { jobId, type: 'error' }
      }
      return
    }
    if (!spaceOverlayStatus.hasSpaces) {
      if (lastSpaceToastRef.current.jobId !== jobId || lastSpaceToastRef.current.type !== 'empty') {
        showToast('No spaces found in this model.', 'info', 2500)
        lastSpaceToastRef.current = { jobId, type: 'empty' }
      }
    }
  }, [spaceOverlayEnabled, spaceOverlayStatus, showToast, jobId])

  useEffect(() => {
    lastSpaceToastRef.current = { jobId, type: null }
    setSpaceOverlayStatus(prev => ({ ...prev, checked: false }))
  }, [jobId])

  useEffect(() => {
    if (!spaceOverlayEnabled) {
      lastSpaceToastRef.current = { jobId, type: null }
      setSpaceOverlayStatus(prev => ({ ...prev, checked: false }))
    }
  }, [spaceOverlayEnabled, jobId])

  return {
    spaceOverlayEnabled,
    highlightedSpaceIds,
    spaceOverlayStatus,
    setSpaceOverlayStatus,
    allSpaces,
    selectedSpaceIndex,
    selectedSpaceId,
    spaceNavigatorProps,
    disableSpaceOverlay,
    toggleSpaceOverlay,
    enableSpaceOverlayForSpaces,
    handleSpacesLoaded,
    handleSpaceSelect,
    handleNextSpace,
    handlePrevSpace
  }
}
