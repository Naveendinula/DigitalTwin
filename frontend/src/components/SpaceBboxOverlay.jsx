import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'

const getSpaceLabel = (space) => {
  if (!space) return 'Unknown'
  const roomNo = space.room_no || ''
  const roomName = space.room_name || ''
  const label = `${roomNo} ${roomName}`.trim()
  return label || space.name || space.globalId || 'Unknown'
}

/**
 * SpaceBboxOverlay
 *
 * Renders translucent bbox overlays for IfcSpace elements.
 */
function SpaceBboxOverlay({ enabled, jobId, onSpaceSelect, highlightedSpaceIds = [], onStatus, selectedSpaceId, onSpacesLoaded }) {
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
        const label = getSpaceLabel(space)

        const mesh = (
          <mesh
            key={space.globalId || `${center[0]}-${center[1]}-${center[2]}`}
            geometry={geometry}
            material={isHighlighted ? highlightMaterial : material}
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
