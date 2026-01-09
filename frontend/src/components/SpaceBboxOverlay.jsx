import React, { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { Text } from '@react-three/drei'

/**
 * Get color for occupancy percentage using iOS-style green -> yellow -> red gradient
 */
const getOccupancyColor = (percent) => {
  // Clamp percent to 0-100
  const p = Math.max(0, Math.min(100, percent))

  // iOS colors: #4cd964 (green) -> #ffcc00 (yellow) -> #ff3b30 (red)
  let r, g, b

  if (p <= 50) {
    // Green to Yellow
    const t = p / 50
    r = Math.round(76 + t * (255 - 76))   // 76 -> 255
    g = Math.round(217 + t * (204 - 217)) // 217 -> 204
    b = Math.round(100 - t * 100)          // 100 -> 0
  } else {
    // Yellow to Red
    const t = (p - 50) / 50
    r = 255
    g = Math.round(204 - t * (204 - 59))  // 204 -> 59
    b = Math.round(t * 48)                 // 0 -> 48
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
 * Create a THREE.Shape from a 2D footprint polygon
 */
const createShapeFromFootprint = (footprint) => {
  if (!footprint || footprint.length < 3) return null
  
  const shape = new THREE.Shape()
  shape.moveTo(footprint[0][0], footprint[0][1])
  for (let i = 1; i < footprint.length; i++) {
    shape.lineTo(footprint[i][0], footprint[i][1])
  }
  shape.closePath()
  return shape
}

/**
 * SpaceFootprintMesh - Renders a single space as an extruded footprint
 */
function SpaceFootprintMesh({ space, material, onSelect, occupancyData }) {
  const transformMatrix = useMemo(() => {
    if (space?.transform && Array.isArray(space.transform) && space.transform.length === 16) {
      const matrix = new THREE.Matrix4()
      matrix.fromArray(space.transform)
      return matrix
    }
    return null
  }, [space?.transform])

  const geometry = useMemo(() => {
    // If footprint exists, use it; otherwise fall back to bbox
    if (space.footprint && space.footprint.length >= 3) {
      const shape = createShapeFromFootprint(space.footprint)
      if (!shape) return null
      
      // Calculate height from footprint_z or bbox
      const zRange = space.footprint_z || [space.bbox?.min?.[2] || 0, space.bbox?.max?.[2] || 3]
      const height = Math.max(0.1, zRange[1] - zRange[0])
      
      const extrudeSettings = {
        steps: 1,
        depth: height,
        bevelEnabled: false,
      }
      
      const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings)
      // Rotate to Z-up (ExtrudeGeometry extrudes along Z by default, but in XY plane)
      // The shape is in XY, extrusion goes along +Z, which is correct for IFC Z-up
      return geom
    }
    
    // Fallback to box geometry
    const min = space.bbox?.min
    const max = space.bbox?.max
    if (!min || !max) return null
    
    const sizeX = Math.max(0.01, max[0] - min[0])
    const sizeY = Math.max(0.01, max[1] - min[1])
    const sizeZ = Math.max(0.01, max[2] - min[2])
    
    const geom = new THREE.BoxGeometry(sizeX, sizeY, sizeZ)
    // Center the geometry at origin, we'll position it later
    return geom
  }, [space])

  const position = useMemo(() => {
    if (space.footprint && space.footprint.length >= 3) {
      // For footprint, position at Z min
      const zMin = space.footprint_z?.[0] ?? space.bbox?.min?.[2] ?? 0
      return [0, 0, zMin]
    }
    
    // For bbox fallback, position at center
    const min = space.bbox?.min
    const max = space.bbox?.max
    if (!min || !max) return [0, 0, 0]
    
    const centerX = (min[0] + max[0]) / 2
    const centerY = (min[1] + max[1]) / 2
    const centerZ = (min[2] + max[2]) / 2
    return [centerX, centerY, centerZ]
  }, [space])

  const labelPosition = useMemo(() => {
    if (space.footprint && space.footprint.length >= 3) {
      // Calculate centroid of footprint for label
      let cx = 0, cy = 0
      for (const [x, y] of space.footprint) {
        cx += x
        cy += y
      }
      cx /= space.footprint.length
      cy /= space.footprint.length
      const zMax = space.footprint_z?.[1] ?? space.bbox?.max?.[2] ?? 3
      return [cx, cy, zMax + 0.2]
    }
    
    // For bbox fallback
    const min = space.bbox?.min
    const max = space.bbox?.max
    if (!min || !max) return [0, 0, 0]
    
    return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, max[2] + 0.2]
  }, [space])

  if (!geometry) return null

  const label = getSpaceLabel(space, occupancyData)

  return (
    <group
      matrixAutoUpdate={!!transformMatrix ? false : true}
      matrix={transformMatrix ?? undefined}
    >
      <mesh
        geometry={geometry}
        material={material}
        position={position}
        onPointerDown={(e) => {
          e.stopPropagation()
          onSelect?.(space.globalId)
        }}
      />
      <Text
        position={labelPosition}
        fontSize={0.5}
        color="black"
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.05}
        outlineColor="white"
      >
        {label}
      </Text>
    </group>
  )
}

/**
 * SpaceBboxOverlay
 *
 * Renders translucent overlays for IfcSpace elements.
 * Uses footprint polygons when available, falls back to bounding boxes.
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

  const defaultMaterial = useMemo(() => {
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
      opacity: 0.18,
      depthWrite: false,
      depthTest: true,
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

  const spacesToRender = useMemo(() => {
    // If highlightedSpaceIds is provided and not empty, filter to show only those spaces.
    // Otherwise, show all spaces.
    return highlightedSpaceIds.length > 0
      ? spaces.filter(s => highlightedSet.has(s.globalId))
      : spaces
  }, [spaces, highlightedSet, highlightedSpaceIds.length])

  if (!enabled || loading || error || spacesToRender.length === 0) return null

  return (
    <group name="SpaceBboxOverlay">
      {spacesToRender.map((space) => {
        const isHighlighted = (space.globalId && highlightedSet.has(space.globalId)) || (selectedSpaceId && space.globalId === selectedSpaceId)

        // Determine material: occupancy color > highlight > default
        let meshMaterial = defaultMaterial
        if (occupancyMaterials && occupancyMaterials.has(space.globalId)) {
          meshMaterial = occupancyMaterials.get(space.globalId)
        }
        if (isHighlighted) {
          meshMaterial = highlightMaterial
        }

        return (
          <SpaceFootprintMesh
            key={space.globalId}
            space={space}
            material={meshMaterial}
            onSelect={onSpaceSelect}
            occupancyData={occupancyData}
          />
        )
      })}
    </group>
  )
}

export default SpaceBboxOverlay
