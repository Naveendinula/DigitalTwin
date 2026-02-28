import React, { useEffect, useRef, useState } from 'react'
import { useDockedContext } from '../contexts/DockedContext'

/**
 * Shared panel wrapper that centralizes drag/resize behavior.
 *
 * Behaviour depends on DockedContext:
 *  • { docked: true,  onUndock }                  → fills parent, drag-handle triggers undock
 *  • { docked: false, onDock, setDockZoneActive }  → absolute-positioned, draggable & resizable
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
  const dockedCtx = useDockedContext()
  const docked = typeof dockedCtx === 'object' ? !!dockedCtx.docked : !!dockedCtx
  const dockedCtxRef = useRef(dockedCtx)
  dockedCtxRef.current = dockedCtx

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const panelRef = useRef(null)
  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: 0, height: 0 })

  // Dock-zone tracking (floating → docked)
  const dockZoneRef = useRef(false)

  // Undock gesture tracking (docked → floating)
  const undockDragRef = useRef(null)
  const [undocking, setUndocking] = useState(false)

  // ── Focus token effect (floating only) ──
  useEffect(() => {
    if (docked) return
    if (!panelRef.current || focusToken === undefined || focusToken === null) return

    setPosition((prev) => {
      const maxX = Math.max(focusPadding, window.innerWidth - size.width - focusPadding)
      const maxY = Math.max(focusPadding, window.innerHeight - size.height - focusPadding)
      return {
        x: Math.min(Math.max(focusPadding, prev.x), maxX),
        y: Math.min(Math.max(focusPadding, prev.y), maxY),
      }
    })

    const el = panelRef.current
    const original = el.style.boxShadow
    el.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)'
    const timeout = setTimeout(() => { el.style.boxShadow = original }, 280)
    return () => clearTimeout(timeout)
  }, [docked, focusToken, focusPadding, setPosition, size.height, size.width])

  // ── Undock drag gesture (docked mode: drag handle > 30 px → undock) ──
  useEffect(() => {
    if (!undocking) return
    const handleMove = (e) => {
      if (!undockDragRef.current) return
      const dx = e.clientX - undockDragRef.current.x
      const dy = e.clientY - undockDragRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > 30) {
        setUndocking(false)
        undockDragRef.current = null
        const ctx = dockedCtxRef.current
        if (typeof ctx === 'object') ctx.onUndock?.()
      }
    }
    const handleUp = () => {
      setUndocking(false)
      undockDragRef.current = null
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      document.body.style.userSelect = ''
    }
  }, [undocking])

  // ── Helpers ──
  const applyDragBounds = (nextPos) => {
    if (!dragBounds) return nextPos
    const bounded = { ...nextPos }
    if (typeof dragBounds.minX === 'number') bounded.x = Math.max(dragBounds.minX, bounded.x)
    if (typeof dragBounds.maxX === 'number') bounded.x = Math.min(dragBounds.maxX, bounded.x)
    if (typeof dragBounds.minY === 'number') bounded.y = Math.max(dragBounds.minY, bounded.y)
    if (typeof dragBounds.maxY === 'number') bounded.y = Math.min(dragBounds.maxY, bounded.y)
    return bounded
  }

  // ── Floating-mode drag handlers ──
  const handleMouseDown = (event) => {
    if (docked) return
    if (!panelRef.current || !event.target.closest(dragHandleSelector)) return
    setIsDragging(true)
    dragStart.current = { x: event.clientX, y: event.clientY }
    startPos.current = { x: position.x, y: position.y }
  }

  const handleMouseMove = (event) => {
    if (!isDragging) return
    event.preventDefault()
    const dx = event.clientX - dragStart.current.x
    const dy = event.clientY - dragStart.current.y
    setPosition(applyDragBounds({ x: startPos.current.x + dx, y: startPos.current.y + dy }))

    // Dock-zone detection: cursor near the right edge
    const nearDock = event.clientX > window.innerWidth - 100
    dockZoneRef.current = nearDock
    const ctx = dockedCtxRef.current
    if (typeof ctx === 'object') ctx.setDockZoneActive?.(nearDock)
  }

  const handleMouseUp = () => {
    if (dockZoneRef.current && isDragging) {
      const ctx = dockedCtxRef.current
      if (typeof ctx === 'object') {
        ctx.onDock?.()
        ctx.setDockZoneActive?.(false)
      }
      dockZoneRef.current = false
    }
    setIsDragging(false)
  }

  // ── Floating-mode resize handlers ──
  const handleResizeMouseDown = (event) => {
    if (docked) return
    event.stopPropagation()
    setIsResizing(true)
    resizeStart.current = { x: event.clientX, y: event.clientY }
    startSize.current = { width: size.width, height: size.height }
  }

  const handleResizeMouseMove = (event) => {
    if (!isResizing) return
    event.preventDefault()
    setSize({
      width: Math.max(minWidth, startSize.current.width + (event.clientX - resizeStart.current.x)),
      height: Math.max(minHeight, startSize.current.height + (event.clientY - resizeStart.current.y)),
    })
  }

  const handleResizeMouseUp = () => {
    setIsResizing(false)
  }

  // ── Window listeners for floating drag / resize ──
  useEffect(() => {
    if (docked) return
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
  }, [docked, isDragging, isResizing])

  // ══════════ Docked-mode render ══════════
  if (docked) {
    const handleDockedMouseDown = (e) => {
      if (!e.target.closest(dragHandleSelector)) return
      undockDragRef.current = { x: e.clientX, y: e.clientY }
      setUndocking(true)
    }

    const {
      position: _p, left: _l, top: _t,
      width: _w, height: _h, zIndex: _z,
      ...dockedStyle
    } = panelStyle || {}

    return (
      <div style={{
        ...dockedStyle,
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        cursor: undocking ? 'grabbing' : 'default',
      }} onMouseDown={handleDockedMouseDown}>
        {children}
      </div>
    )
  }

  // ══════════ Floating-mode render ══════════
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
