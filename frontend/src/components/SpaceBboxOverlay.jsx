import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'

/**
 * Get color for occupancy percentage using green -> yellow -> red gradient
 */
const getOccupancyColor = (percent) => {
  // Clamp percent to 0-100
  const p = Math.max(0, Math.min(100, percent))

  // Green (0%) -> Yellow (50%) -> Red (100%)
  let r, g, b

  if (p <= 50) {
    // Green to Yellow: increase red
    r = Math.round((p / 50) * 255)
    g = 200
    b = 50
  } else {
    // Yellow to Red: decrease green
    r = 255
    g = Math.round(200 - ((p - 50) / 50) * 200)
    b = 50
  }

  return (r << 16) | (g << 8) | b
}

const getSpaceLabel = (space, occupancyData) => {
  if (!space) return 'Unknown'
  const roomNo = space.room_no || ''
  const roomName = space.room_name || ''
  let label = `${roomNo} ${roomName}`.trim()
  label = label || space.name || space.globalId || 'Unknown'

  // Add occupancy info if available
  if (occupancyData && occupancyData.has(space.globalId)) {
    const occ = occupancyData.get(space.globalId)
    label += ` (${occ.occupancy}/${occ.capacity})`
  }

  return label
}

/**
 * SpaceBboxOverlay
 *
 * Renders translucent bbox overlays for IfcSpace elements.
 * Supports occupancy visualization with color-coded heatmap.
 */
function SpaceBboxOverlay({ enabled, jobId, onSpaceSelect, highlightedSpaceIds = [], onStatus, selectedSpaceId, onSpacesLoaded, occupancyData }) {
  const [spaces, setSpaces] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !jobId) return

    let isMounted = true
    setLoading(true)
    setError(null)
    onStatus?.({ hasSpaces: false, count: 0, error: null, loading: true, checked: false })

    fetch(`http://localhost:8000/api/spaces/bboxes/${jobId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load space bboxes')
        return res.json()
      })
      .then(data => {
        if (!isMounted) return
        const nextSpaces = Array.isArray(data.spaces) ? data.spaces : []
        setSpaces(nextSpaces)
        onStatus?.({ hasSpaces: nextSpaces.length > 0, count: nextSpaces.length, error: null, loading: false, checked: true })
        onSpacesLoaded?.(nextSpaces)
      })
      .catch(err => {
        if (!isMounted) return
        setError(err.message)
        onStatus?.({ hasSpaces: false, count: 0, error: err.message, loading: false, checked: true })
      })
      .finally(() => {
        if (!isMounted) return
        setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [enabled, jobId, onStatus])

  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), [])
  const material = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x00a4ff,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
  }, [])
  const highlightMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0xff5500, // High contrast orange-red
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    })
  }, [])

  // Create materials for occupancy visualization
  const occupancyMaterials = useMemo(() => {
    if (!occupancyData || occupancyData.size === 0) return null

    const materials = new Map()
    for (const [globalId, occ] of occupancyData) {
      const color = getOccupancyColor(occ.percent)
      materials.set(globalId, new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
      }))
    }
    return materials
  }, [occupancyData])

  const highlightedSet = useMemo(() => new Set(highlightedSpaceIds), [highlightedSpaceIds])

  const spaceMeshes = useMemo(() => {
    // If highlightedSpaceIds is provided and not empty, filter to show only those spaces.
    // Otherwise, show all spaces.
    const spacesToShow = highlightedSpaceIds.length > 0
      ? spaces.filter(s => highlightedSet.has(s.globalId))
      : spaces

    return spacesToShow.map((space) => {
      const min = space?.bbox?.min
      const max = space?.bbox?.max
      if (!min || !max) return null

      const sizeX = Math.max(0.01, max[0] - min[0])
      const sizeY = Math.max(0.01, max[1] - min[1])
      const sizeZ = Math.max(0.01, max[2] - min[2])
      const centerX = min[0] + sizeX / 2
      const centerY = min[1] + sizeY / 2
      const centerZ = min[2] + sizeZ / 2

      let matrix = null
      if (Array.isArray(space.transform) && space.transform.length === 16) {
        matrix = new THREE.Matrix4().fromArray(space.transform)
      }

      return {
        space,
        center: [centerX, centerY, centerZ],
        scale: [sizeX, sizeY, sizeZ],
        matrix,
      }
    }).filter(Boolean)
  }, [spaces, highlightedSet, highlightedSpaceIds.length])

  if (!enabled || loading || error || spaceMeshes.length === 0) return null

  return (
    <group name="SpaceBboxOverlay">
      {spaceMeshes.map((entry) => {
        const { space, center, scale, matrix } = entry
        const isHighlighted = (space.globalId && highlightedSet.has(space.globalId)) || (selectedSpaceId && space.globalId === selectedSpaceId)
        const label = getSpaceLabel(space, occupancyData)

        // Determine material: occupancy color > highlight > default
        let meshMaterial = material
        if (occupancyMaterials && occupancyMaterials.has(space.globalId)) {
          meshMaterial = occupancyMaterials.get(space.globalId)
        }
        if (isHighlighted) {
          meshMaterial = highlightMaterial
        }

        const mesh = (
          <mesh
            key={space.globalId || `${center[0]}-${center[1]}-${center[2]}`}
            geometry={geometry}
            material={meshMaterial}
            position={center}
            scale={scale}
            onPointerDown={(e) => {
              e.stopPropagation()
              onSpaceSelect?.(space.globalId)
            }}
          />
        )

        const labelElement = (
          <Text
            key={`${space.globalId}-label`}
            position={[center[0], center[1] + scale[1] / 2 + 0.2, center[2]]}
            fontSize={0.5}
            color="black"
            anchorX="center"
            anchorY="bottom"
            outlineWidth={0.05}
            outlineColor="white"
          >
            {label}
          </Text>
        )

        if (!matrix) {
          return (
            <group key={`${space.globalId}-container`}>
              {mesh}
              {labelElement}
            </group>
          )
        }

        return (
          <group key={`${space.globalId}-group`} matrix={matrix} matrixAutoUpdate={false}>
            {mesh}
            {/* Note: Label is also transformed by matrix, which is usually desired */}
            {labelElement}
          </group>
        )
      })}
    </group>
  )
}

export default SpaceBboxOverlay
