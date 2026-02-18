import React, { useEffect, useRef, useState } from 'react'

/**
 * Shared floating panel wrapper that centralizes drag/resize behavior.
 */
function DraggablePanel({
  position,
  setPosition,
  size,
  setSize,
  panelStyle,
  resizeHandleStyle,
  minWidth = 300,
  minHeight = 300,
  zIndex,
  focusToken,
  focusPadding = 20,
  dragBounds,
  dragHandleSelector = '.drag-handle',
  stopPointerDown = false,
  resizeHandleClassName,
  children,
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: 0, height: 0 })

  useEffect(() => {
    if (!panelRef.current || focusToken === undefined || focusToken === null) return

    setPosition((prev) => {
      const maxX = Math.max(focusPadding, window.innerWidth - size.width - focusPadding)
      const maxY = Math.max(focusPadding, window.innerHeight - size.height - focusPadding)
      const x = Math.min(Math.max(focusPadding, prev.x), maxX)
      const y = Math.min(Math.max(focusPadding, prev.y), maxY)
      return { x, y }
    })

    const el = panelRef.current
    const original = el.style.boxShadow
    el.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)'
    const timeout = setTimeout(() => {
      el.style.boxShadow = original
    }, 280)

    return () => clearTimeout(timeout)
  }, [focusToken, focusPadding, setPosition, size.height, size.width])

  const applyDragBounds = (nextPosition) => {
    if (!dragBounds) return nextPosition

    const bounded = { ...nextPosition }
    if (typeof dragBounds.minX === 'number') bounded.x = Math.max(dragBounds.minX, bounded.x)
    if (typeof dragBounds.maxX === 'number') bounded.x = Math.min(dragBounds.maxX, bounded.x)
    if (typeof dragBounds.minY === 'number') bounded.y = Math.max(dragBounds.minY, bounded.y)
    if (typeof dragBounds.maxY === 'number') bounded.y = Math.min(dragBounds.maxY, bounded.y)
    return bounded
  }

  const handleMouseDown = (event) => {
    if (!panelRef.current || !event.target.closest(dragHandleSelector)) return
    setIsDragging(true)
    dragStart.current = { x: event.clientX, y: event.clientY }
    startPos.current = { x: position.x, y: position.y }
  }

  const handleMouseMove = (event) => {
    if (isDragging) {
      event.preventDefault()
      const dx = event.clientX - dragStart.current.x
      const dy = event.clientY - dragStart.current.y
      setPosition(
        applyDragBounds({
          x: startPos.current.x + dx,
          y: startPos.current.y + dy,
        })
      )
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleResizeMouseDown = (event) => {
    event.stopPropagation()
    setIsResizing(true)
    resizeStart.current = { x: event.clientX, y: event.clientY }
    startSize.current = { width: size.width, height: size.height }
  }

  const handleResizeMouseMove = (event) => {
    if (!isResizing) return
    event.preventDefault()
    const dx = event.clientX - resizeStart.current.x
    const dy = event.clientY - resizeStart.current.y
    setSize({
      width: Math.max(minWidth, startSize.current.width + dx),
      height: Math.max(minHeight, startSize.current.height + dy),
    })
  }

  const handleResizeMouseUp = () => {
    setIsResizing(false)
  }

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = 'none'
    } else if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove)
      window.addEventListener('mouseup', handleResizeMouseUp)
      document.body.style.userSelect = 'none'
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleResizeMouseMove)
      window.removeEventListener('mouseup', handleResizeMouseUp)
      document.body.style.userSelect = ''
    }
  }, [isDragging, isResizing])

  return (
    <div
      ref={panelRef}
      style={{
        ...panelStyle,
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: zIndex ?? panelStyle?.zIndex,
        cursor: isDragging ? 'grabbing' : 'default',
      }}
      onMouseDown={handleMouseDown}
      onPointerDown={stopPointerDown ? (event) => event.stopPropagation() : undefined}
    >
      {children}
      <div
        className={resizeHandleClassName}
        style={resizeHandleStyle}
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  )
}

export default DraggablePanel
