import React, { useMemo, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'

const PRIORITY_COLORS = {
  low: '#8e8e93',
  medium: '#0071e3',
  high: '#ff9500',
  critical: '#ff3b30',
}

const PRIORITY_RING = {
  low: 'rgba(142,142,147,0.25)',
  medium: 'rgba(0,113,227,0.25)',
  high: 'rgba(255,149,0,0.25)',
  critical: 'rgba(255,59,48,0.30)',
}

/**
 * Inject hover / pulse CSS once.
 */
let styleInjected = false
function injectStyles() {
  if (styleInjected) return
  styleInjected = true
  const style = document.createElement('style')
  style.textContent = `
    @keyframes wo-marker-pulse {
      0%   { transform: scale(1);   box-shadow: 0 0 0 0 var(--wo-ring); }
      50%  { transform: scale(1.1); box-shadow: 0 0 0 6px transparent; }
      100% { transform: scale(1);   box-shadow: 0 0 0 0 var(--wo-ring); }
    }
    .wo-marker-dot {
      cursor: pointer;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      pointer-events: auto;
      user-select: none;
      transition: transform 0.15s ease;
      animation: wo-marker-pulse 2.5s ease-in-out infinite;
    }
    .wo-marker-dot:hover {
      transform: scale(1.25) !important;
      animation: none;
    }
  `
  document.head.appendChild(style)
}

/**
 * Compute the bounding-box center for a set of meshes.
 */
function getMeshCenter(meshes) {
  const box = new THREE.Box3()
  meshes.forEach((m) => box.expandByObject(m))
  if (box.isEmpty()) return null
  return box.getCenter(new THREE.Vector3())
}

/**
 * A single marker rendered at a 3D position via drei <Html>.
 */
function Marker({ position, count, maxPriority, onClick }) {
  const color = PRIORITY_COLORS[maxPriority] || PRIORITY_COLORS.medium
  const ring = PRIORITY_RING[maxPriority] || PRIORITY_RING.medium
  const size = count > 1 ? 22 : 18

  return (
    <Html
      position={position}
      center
      zIndexRange={[50, 0]}
      style={{ pointerEvents: 'none' }}
      distanceFactor={undefined}
    >
      <div
        className="wo-marker-dot"
        style={{
          width: size,
          height: size,
          background: color,
          border: '2px solid #fff',
          '--wo-ring': ring,
        }}
        onClick={(e) => {
          e.stopPropagation()
          onClick?.()
        }}
        title={`${count} active work order${count > 1 ? 's' : ''} (${maxPriority})`}
      >
        {count > 1 ? count : ''}
      </div>
    </Html>
  )
}

/**
 * WorkOrderMarkers
 *
 * Renders small vivid circular indicators at the 3D position of every
 * element that has active work orders. Must be rendered inside the R3F
 * Canvas (as a child of <Viewer>).
 *
 * @param {{ markerData: Array, onMarkerClick: (globalId: string) => void, sceneIndex: object }} props
 */
export function WorkOrderMarkersInner({ markerData, onMarkerClick, sceneIndex }) {
  const [indexReady, setIndexReady] = useState(false)

  useEffect(() => {
    injectStyles()
  }, [])

  // The scene index is ref-based (doesn't trigger re-renders).
  // Poll briefly until the index is populated so markers can resolve positions.
  useFrame(() => {
    if (!indexReady && sceneIndex?.indexRef?.current?.size > 0) {
      setIndexReady(true)
    }
  })

  // Reset readiness when markerData changes so we re-check
  useEffect(() => {
    if (sceneIndex?.indexRef?.current?.size > 0) {
      setIndexReady(true)
    }
  }, [markerData, sceneIndex])

  const markers = useMemo(() => {
    if (!markerData?.length || !indexReady) return []
    const index = sceneIndex?.indexRef?.current
    if (!index || !index.size) return []

    return markerData
      .map((entry) => {
        const meshSet = index.get(entry.globalId)
        if (!meshSet || meshSet.size === 0) return null
        const center = getMeshCenter(meshSet)
        if (!center) return null
        return { ...entry, position: [center.x, center.y, center.z] }
      })
      .filter(Boolean)
  }, [markerData, indexReady, sceneIndex])

  if (markers.length === 0) return null

  return (
    <group>
      {markers.map((m) => (
        <Marker
          key={m.globalId}
          position={m.position}
          count={m.count}
          maxPriority={m.maxPriority}
          onClick={() => onMarkerClick?.(m.globalId)}
        />
      ))}
    </group>
  )
}
