import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import usePanelStacking from '../usePanelStacking'

function usePanelStackingHarness() {
  const stacking = usePanelStacking()
  const [open, setOpen] = useState(false)

  const toggle = () => {
    stacking.togglePanel({
      isOpen: open,
      panelZIndex: stacking.ecPanelZIndex,
      setIsOpen: setOpen,
      setPanelZIndex: stacking.setEcPanelZIndex,
      onClose: () => setOpen(false),
    })
  }

  return {
    ...stacking,
    open,
    toggle,
  }
}

describe('usePanelStacking', () => {
  test('opens panel and brings it to front', () => {
    const { result } = renderHook(() => usePanelStackingHarness())

    expect(result.current.open).toBe(false)
    expect(result.current.ecPanelZIndex).toBe(1000)

    act(() => {
      result.current.toggle()
    })

    expect(result.current.open).toBe(true)
    expect(result.current.ecPanelZIndex).toBeGreaterThan(1000)
  })

  test('closes panel when toggled while topmost', () => {
    const { result } = renderHook(() => usePanelStackingHarness())

    act(() => {
      result.current.toggle()
    })
    expect(result.current.open).toBe(true)

    act(() => {
      result.current.toggle()
    })
    expect(result.current.open).toBe(false)
  })
})
