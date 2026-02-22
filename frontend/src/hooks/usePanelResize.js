import { useCallback, useEffect, useRef, useState } from 'react'

export default function usePanelResize({
  initialLeftWidth = 280,
  initialRightWidth = 320,
  minWidth = 220,
  maxWidth = 520,
} = {}) {
  const [leftPanelWidth, setLeftPanelWidth] = useState(initialLeftWidth)
  const [rightPanelWidth, setRightPanelWidth] = useState(initialRightWidth)
  const dragStateRef = useRef(null)

  const handleStartResize = useCallback((side, event) => {
    event.preventDefault()
    dragStateRef.current = {
      side,
      startX: event.clientX,
      startWidth: side === 'left' ? leftPanelWidth : rightPanelWidth,
    }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [leftPanelWidth, rightPanelWidth])

  useEffect(() => {
    const handleMouseMove = (event) => {
      const dragState = dragStateRef.current
      if (!dragState) return

      const delta = event.clientX - dragState.startX
      const direction = dragState.side === 'left' ? 1 : -1
      const nextWidth = Math.min(
        maxWidth,
        Math.max(minWidth, dragState.startWidth + (direction * delta)),
      )

      if (dragState.side === 'left') {
        setLeftPanelWidth(nextWidth)
      } else {
        setRightPanelWidth(nextWidth)
      }
    }

    const handleMouseUp = () => {
      if (!dragStateRef.current) return
      dragStateRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [maxWidth, minWidth])

  return {
    leftPanelWidth,
    rightPanelWidth,
    handleStartResize,
  }
}
