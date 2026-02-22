import { act, renderHook } from '@testing-library/react'
import usePanelResize from '../usePanelResize'

function startResize(result, side, clientX) {
  const event = {
    clientX,
    preventDefault: () => {},
  }
  act(() => {
    result.current.handleStartResize(side, event)
  })
}

describe('usePanelResize', () => {
  test('resizes left panel width with mouse movement', () => {
    const { result } = renderHook(() =>
      usePanelResize({
        initialLeftWidth: 280,
        initialRightWidth: 320,
      })
    )

    startResize(result, 'left', 100)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 160 }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    expect(result.current.leftPanelWidth).toBe(340)
  })

  test('clamps width to min and max bounds', () => {
    const { result } = renderHook(() =>
      usePanelResize({
        initialLeftWidth: 280,
        initialRightWidth: 320,
        minWidth: 220,
        maxWidth: 520,
      })
    )

    startResize(result, 'left', 100)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000 }))
    })
    expect(result.current.leftPanelWidth).toBe(220)

    startResize(result, 'left', 100)
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 2000 }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
    expect(result.current.leftPanelWidth).toBe(520)
  })
})
