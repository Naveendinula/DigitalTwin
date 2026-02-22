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

function GraphView({ nodes = [], edges = [], onNodeSelect, onExit }) {
  const graphData = useMemo(() => {
    const degreeCount = new Map()

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
        return {
          id,
          label: String(node?.name || node?.ifcType || node?.label || id),
          fill: colorForType(node?.ifcType || node?.label),
          size: Math.max(10, Math.min(28, 10 + degree * 1.4)),
        }
      })
      .filter(Boolean)

    const graphEdges = edges
      .map((edge, index) => {
        const source = String(edge?.source || '')
        const target = String(edge?.target || '')
        if (!source || !target) return null
        const type = String(edge?.type || 'RELATED_TO')
        return {
          id: `${source}|${target}|${type}|${index}`,
          source,
          target,
          label: type,
          size: 1,
        }
      })
      .filter(Boolean)

    return { graphNodes, graphEdges }
  }, [nodes, edges])

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
        <button type="button" style={styles.exitButton} onClick={onExit}>
          Back to Results
        </button>
      </div>
      <GraphCanvas
        nodes={graphData.graphNodes}
        edges={graphData.graphEdges}
        layoutType="forceDirected2d"
        labelType="none"
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
    right: '8px',
    zIndex: 5,
    pointerEvents: 'none',
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
