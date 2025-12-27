import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'

/**
 * SpaceBboxOverlay
 *
 * Renders translucent bbox overlays for IfcSpace elements.
 */
function SpaceBboxOverlay({ enabled, jobId, onSpaceSelect, highlightedSpaceIds = [], onStatus }) {
  const [spaces, setSpaces] = useState([])
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !jobId) return

    let isMounted = true
    setLoading(true)
    setError(null)
    onStatus?.({ hasSpaces: false, count: 0, error: null, loading: true })

    fetch(`http://localhost:8000/api/spaces/bboxes/${jobId}`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load space bboxes')
        return res.json()
      })
      .then(data => {
        if (!isMounted) return
        const nextSpaces = Array.isArray(data.spaces) ? data.spaces : []
        setSpaces(nextSpaces)
        onStatus?.({ hasSpaces: nextSpaces.length > 0, count: nextSpaces.length, error: null })
      })
      .catch(err => {
        if (!isMounted) return
        setError(err.message)
        onStatus?.({ hasSpaces: false, count: 0, error: err.message })
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
    })
  }, [])
  const highlightMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: 0x00d4ff,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      depthTest: false,
    })
  }, [])

  const highlightedSet = useMemo(() => new Set(highlightedSpaceIds), [highlightedSpaceIds])

  const spaceMeshes = useMemo(() => {
    return spaces.map((space) => {
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
  }, [spaces])

  if (!enabled || loading || error || spaceMeshes.length === 0) return null

  return (
    <group name="SpaceBboxOverlay">
      {spaceMeshes.map((entry) => {
        const { space, center, scale, matrix } = entry
        const isHighlighted = space.globalId && highlightedSet.has(space.globalId)
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

        if (!matrix) {
          return mesh
        }

        return (
          <group key={`${space.globalId}-group`} matrix={matrix} matrixAutoUpdate={false}>
            {mesh}
          </group>
        )
      })}
    </group>
  )
}

export default SpaceBboxOverlay
