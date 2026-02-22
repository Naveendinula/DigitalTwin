import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import useFloatingPanels from '../useFloatingPanels'

describe('useFloatingPanels', () => {
  test('toggles EC panel and calls disableXRay on close', () => {
    const disableXRay = vi.fn()
    const { result } = renderHook(() => useFloatingPanels(disableXRay))

    act(() => {
      result.current.handleToggleEcPanel()
    })
    expect(result.current.ecPanelOpen).toBe(true)

    act(() => {
      result.current.handleToggleEcPanel()
    })
    expect(result.current.ecPanelOpen).toBe(false)
    expect(disableXRay).toHaveBeenCalledTimes(1)
  })

  test('opens work orders panel without toggle-close behavior', () => {
    const disableXRay = vi.fn()
    const { result } = renderHook(() => useFloatingPanels(disableXRay))

    expect(result.current.workOrdersPanelOpen).toBe(false)
    act(() => {
      result.current.handleOpenWorkOrdersPanel()
    })
    expect(result.current.workOrdersPanelOpen).toBe(true)
  })
})
