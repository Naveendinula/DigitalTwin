import React, { useMemo } from 'react'
import { GraphCanvas } from 'reagraph'

const TYPE_COLORS = [
  '#3b82f6',
  '#0ea5a4',
  '#22c55e',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#64748b',
]

const HOP_COLORS = [
  '#1d4ed8',
  '#0f766e',
  '#15803d',
  '#b45309',
]

function colorForType(typeName) {
  const text = String(typeName || 'Unknown')
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i)
    hash |= 0
  }
  return TYPE_COLORS[Math.abs(hash) % TYPE_COLORS.length]
}

function normalizeNodeId(node) {
  const raw = node?.id || node?.globalId
  return typeof raw === 'string' ? raw : ''
}

function normalizeEdgeKey(edge) {
  const source = String(edge?.source || '')
  const target = String(edge?.target || '')
  const type = String(edge?.type || 'RELATED_TO')
  return source && target ? `${source}|${target}|${type}` : ''
}

function colorForHop(hop) {
  const index = Math.max(0, Number(hop) || 0) % HOP_COLORS.length
  return HOP_COLORS[index]
}

function uniqueIds(values) {
  return Array.from(new Set((values || []).filter(Boolean).map((value) => String(value))))
}

function GraphView({
  nodes = [],
  edges = [],
  onNodeSelect,
  onExit,
  startNodeId = '',
  nodeHopMap = {},
  highlightedEdgeKeys = [],
  pathNodeIds = [],
  pathEdgeKeys = [],
  activeNodeIds = [],
}) {
  const graphData = useMemo(() => {
    const degreeCount = new Map()
    const pathNodeSet = new Set(uniqueIds(pathNodeIds))
    const pathEdgeSet = new Set(uniqueIds(pathEdgeKeys))
    const highlightedEdgeSet = new Set(uniqueIds(highlightedEdgeKeys))
    const activeNodeSet = new Set(uniqueIds(activeNodeIds))

    edges.forEach((edge) => {
      const source = String(edge?.source || '')
      const target = String(edge?.target || '')
      if (!source || !target) return
      degreeCount.set(source, (degreeCount.get(source) || 0) + 1)
      degreeCount.set(target, (degreeCount.get(target) || 0) + 1)
    })

    const graphNodes = nodes
      .map((node) => {
        const id = normalizeNodeId(node)
        if (!id) return null
        const degree = degreeCount.get(id) || 0
        const hop = Object.prototype.hasOwnProperty.call(nodeHopMap, id)
          ? Number(nodeHopMap[id])
          : null
        const isStart = Boolean(startNodeId) && id === startNodeId
        const isPathNode = pathNodeSet.has(id)
        const isActive = activeNodeSet.has(id)
        const typeLabel = String(node?.graphRole || node?.ifcType || node?.label || 'Node')
        let fill = colorForType(typeLabel)

        if (hop !== null && Number.isFinite(hop)) {
          fill = colorForHop(hop)
        }
        if (isPathNode) {
          fill = '#be123c'
        }
        if (isStart) {
          fill = '#0f172a'
        }

        return {
          id,
          label: String(node?.name || node?.ifcType || node?.label || id),
          subLabel: [
            hop !== null && Number.isFinite(hop) ? `Hop ${hop}` : null,
            typeLabel,
          ].filter(Boolean).join(' - '),
          fill,
          size: Math.max(10, Math.min(32, 10 + degree * 1.4 + (isStart ? 6 : isPathNode ? 4 : isActive ? 2 : 0))),
          labelVisible: Boolean(isStart || isPathNode || isActive),
        }
      })
      .filter(Boolean)

    const graphEdges = edges
      .map((edge, index) => {
        const source = String(edge?.source || '')
        const target = String(edge?.target || '')
        if (!source || !target) return null
        const type = String(edge?.type || 'RELATED_TO')
        const edgeKey = normalizeEdgeKey(edge)
        const isPathEdge = pathEdgeSet.has(edgeKey)
        const isHighlighted = highlightedEdgeSet.has(edgeKey)
        return {
          id: edgeKey || `${source}|${target}|${type}|${index}`,
          source,
          target,
          label: type,
          fill: isPathEdge ? '#be123c' : isHighlighted ? '#1d4ed8' : '#94a3b8',
          size: isPathEdge ? 3 : isHighlighted ? 2.25 : 1,
          labelVisible: Boolean(isPathEdge || isHighlighted),
        }
      })
      .filter(Boolean)

    return { graphNodes, graphEdges }
  }, [nodes, edges, startNodeId, nodeHopMap, highlightedEdgeKeys, pathNodeIds, pathEdgeKeys, activeNodeIds])

  if (!graphData.graphNodes.length) {
    return (
      <div style={styles.empty}>
        No graph nodes to visualize.
      </div>
    )
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.topBar}>
        <div style={styles.legend}>
          {startNodeId ? <span style={{ ...styles.legendItem, ...styles.legendStart }}>Start</span> : null}
          {pathNodeIds.length ? <span style={{ ...styles.legendItem, ...styles.legendPath }}>Path</span> : null}
          {highlightedEdgeKeys.length ? <span style={{ ...styles.legendItem, ...styles.legendHop }}>Current Hop</span> : null}
        </div>
        {onExit ? (
          <button type="button" style={styles.exitButton} onClick={onExit}>
            Back to Results
          </button>
        ) : null}
      </div>
      <GraphCanvas
        nodes={graphData.graphNodes}
        edges={graphData.graphEdges}
        layoutType="forceDirected2d"
        labelType="nodes"
        edgeArrowPosition="end"
        selections={uniqueIds([startNodeId, ...pathNodeIds])}
        actives={uniqueIds(activeNodeIds)}
        onNodeClick={(node) => {
          const nodeId = String(node?.id || '')
          if (!nodeId || nodeId.startsWith('mat:') || nodeId.startsWith('sys:')) return
          onNodeSelect?.(nodeId)
        }}
      />
    </div>
  )
}

const styles = {
  wrap: {
    position: 'relative',
    width: '100%',
    minHeight: '280px',
    height: '360px',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, #f6f8fb 0%, #eef2f7 100%)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
  },
  topBar: {
    position: 'absolute',
    top: '8px',
    left: '8px',
    right: '8px',
    zIndex: 5,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  legend: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    pointerEvents: 'none',
  },
  legendItem: {
    borderRadius: '999px',
    padding: '4px 8px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.4px',
    color: '#fff',
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  legendStart: {
    background: '#0f172a',
  },
  legendPath: {
    background: '#be123c',
  },
  legendHop: {
    background: '#1d4ed8',
  },
  exitButton: {
    pointerEvents: 'auto',
    border: 'none',
    borderRadius: '8px',
    padding: '6px 10px',
    background: 'rgba(232, 232, 236, 0.92)',
    color: '#1d1d1f',
    boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 700,
  },
  empty: {
    borderRadius: '10px',
    padding: '20px',
    fontSize: '12px',
    color: '#6b7280',
    background: '#eef1f6',
    border: '1px solid rgba(0,0,0,0.06)',
  },
}

export default GraphView
