import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DraggablePanel from './DraggablePanel'
import GraphView from './GraphView'
import { apiFetch, parseJsonSafe } from '../utils/api'

const RELATIONSHIP_OPTIONS = [
  'CONTAINED_IN',
  'DECOMPOSES',
  'HAS_MATERIAL',
  'BOUNDED_BY',
  'FEEDS',
  'SERVES',
  'IN_SYSTEM',
]

const EMPTY_GRAPH_RESULT = { nodes: [], edges: [], total: 0 }
const PANEL_MODES = {
  QUERY: 'query',
  TRAVERSAL: 'traversal',
}
const TRAVERSAL_DEPTH_OPTIONS = [1, 2, 3]

function uniqueSorted(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)))
}

function extractSelectedId(value) {
  if (!value) return ''
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = extractSelectedId(item)
      if (id) return id
    }
    return ''
  }
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    const id = value.globalId || value.id
    return typeof id === 'string' ? id.trim() : ''
  }
  return ''
}

function normalizeNodeId(node) {
  const raw = node?.id || node?.globalId
  return typeof raw === 'string' ? raw : ''
}

function normalizeEdge(edge) {
  const source = String(edge?.source || '')
  const target = String(edge?.target || '')
  const type = String(edge?.type || 'RELATED_TO')
  if (!source || !target) return null
  return { source, target, type }
}

function normalizeEdgeKey(edge) {
  const normalized = normalizeEdge(edge)
  return normalized ? `${normalized.source}|${normalized.target}|${normalized.type}` : ''
}

function dedupeNodes(nodes) {
  const map = new Map()
  for (const node of nodes || []) {
    const id = normalizeNodeId(node)
    if (!id) continue
    map.set(id, node)
  }
  return Array.from(map.values())
}

function dedupeEdges(edges) {
  const map = new Map()
  for (const edge of edges || []) {
    const normalized = normalizeEdge(edge)
    if (!normalized) continue
    map.set(normalizeEdgeKey(normalized), normalized)
  }
  return Array.from(map.values())
}

function sortNodes(nodes) {
  return [...dedupeNodes(nodes)].sort((left, right) => {
    const leftLabel = String(left?.name || left?.ifcType || left?.label || normalizeNodeId(left))
    const rightLabel = String(right?.name || right?.ifcType || right?.label || normalizeNodeId(right))
    return leftLabel.localeCompare(rightLabel)
  })
}

function filterEdgesByRelationship(edges, relationship) {
  if (!relationship || relationship === 'ALL') {
    return dedupeEdges(edges)
  }
  return dedupeEdges(edges).filter((edge) => String(edge.type).toLowerCase() === String(relationship).toLowerCase())
}

function combineGraphResults(...results) {
  const nodes = []
  const edges = []
  for (const result of results) {
    if (!result) continue
    nodes.push(...(Array.isArray(result.nodes) ? result.nodes : []))
    edges.push(...(Array.isArray(result.edges) ? result.edges : []))
  }
  const dedupedNodes = sortNodes(nodes)
  const dedupedEdges = dedupeEdges(edges)
  return {
    nodes: dedupedNodes,
    edges: dedupedEdges,
    total: dedupedNodes.length,
  }
}

function buildNodeHopMap(startNodeId, hopBatches) {
  const hopMap = {}
  if (startNodeId) {
    hopMap[String(startNodeId)] = 0
  }

  for (const batch of hopBatches || []) {
    const hop = Number(batch?.hop || 0)
    for (const nodeId of batch?.newNodeIds || []) {
      if (!nodeId || Object.prototype.hasOwnProperty.call(hopMap, nodeId)) continue
      hopMap[String(nodeId)] = hop
    }
  }

  return hopMap
}

function GraphQueryPanel({
  isOpen,
  onClose,
  jobId,
  selectedId,
  onSelectResult,
  onSelectResultBatch,
  focusToken,
  zIndex,
}) {
  const [position, setPosition] = useState({ x: 760, y: 90 })
  const [size, setSize] = useState({ width: 420, height: 560 })
  const [panelMode, setPanelMode] = useState(PANEL_MODES.QUERY)
  const [loadingStats, setLoadingStats] = useState(false)
  const [runningQuery, setRunningQuery] = useState(false)
  const [traversalLoading, setTraversalLoading] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [result, setResult] = useState(EMPTY_GRAPH_RESULT)

  const [nodeType, setNodeType] = useState('ALL')
  const [storey, setStorey] = useState('ALL')
  const [material, setMaterial] = useState('ALL')
  const [nameContains, setNameContains] = useState('')
  const [relatedTo, setRelatedTo] = useState('')
  const [maxDepth, setMaxDepth] = useState(1)
  const [relationship, setRelationship] = useState('ALL')
  const [showGraphView, setShowGraphView] = useState(false)

  const [traversalStartId, setTraversalStartId] = useState('')
  const [traversalTargetId, setTraversalTargetId] = useState('')
  const [traversalRelationship, setTraversalRelationship] = useState('ALL')
  const [traversalMaxDepth, setTraversalMaxDepth] = useState(3)
  const [traversalCurrentDepth, setTraversalCurrentDepth] = useState(0)
  const [frontierNodeIds, setFrontierNodeIds] = useState([])
  const [visitedNodeIds, setVisitedNodeIds] = useState([])
  const [visitedEdgeKeys, setVisitedEdgeKeys] = useState([])
  const [traversalGraph, setTraversalGraph] = useState(EMPTY_GRAPH_RESULT)
  const [hopBatches, setHopBatches] = useState([])
  const [pathResult, setPathResult] = useState(null)
  const [activeTraversalStartId, setActiveTraversalStartId] = useState('')
  const [activeTraversalRelationship, setActiveTraversalRelationship] = useState('ALL')
  const [activeTraversalMaxDepth, setActiveTraversalMaxDepth] = useState(3)

  const typeOptions = useMemo(() => ['ALL', ...Object.keys(stats?.node_types || {})], [stats])
  const storeyOptions = useMemo(() => ['ALL', ...(stats?.storeys || [])], [stats])
  const materialOptions = useMemo(() => ['ALL', ...(stats?.materials || [])], [stats])
  const edgeOptions = useMemo(
    () => ['ALL', ...uniqueSorted([...(Object.keys(stats?.edge_types || {})), ...RELATIONSHIP_OPTIONS])],
    [stats]
  )

  const selectableResultIds = useMemo(() => {
    const ids = (result?.nodes || [])
      .map((node) => node?.id || node?.globalId)
      .filter((id) => typeof id === 'string' && !id.startsWith('mat:') && !id.startsWith('sys:'))
    return uniqueSorted(ids)
  }, [result])

  const selectedGraphId = useMemo(() => extractSelectedId(selectedId), [selectedId])
  const resolvedTraversalStartId = activeTraversalStartId || traversalStartId.trim()
  const latestHop = hopBatches.length ? hopBatches[hopBatches.length - 1] : null
  const traversalGraphResult = useMemo(() => combineGraphResults(traversalGraph, pathResult), [traversalGraph, pathResult])
  const traversalNodeHopMap = useMemo(
    () => buildNodeHopMap(resolvedTraversalStartId, hopBatches),
    [resolvedTraversalStartId, hopBatches]
  )
  const pathNodeIds = useMemo(
    () => dedupeNodes(pathResult?.nodes || []).map(normalizeNodeId).filter(Boolean),
    [pathResult]
  )
  const pathEdgeKeys = useMemo(
    () => dedupeEdges(pathResult?.edges || []).map(normalizeEdgeKey).filter(Boolean),
    [pathResult]
  )
  const traversalActiveNodeIds = useMemo(() => {
    if (latestHop?.newNodeIds?.length) return latestHop.newNodeIds
    return resolvedTraversalStartId ? [resolvedTraversalStartId] : []
  }, [latestHop, resolvedTraversalStartId])
  const traversalStartNode = useMemo(
    () => traversalGraphResult.nodes.find((node) => normalizeNodeId(node) === resolvedTraversalStartId) || null,
    [traversalGraphResult, resolvedTraversalStartId]
  )
  const traversalCanExpand = Boolean(
    frontierNodeIds.length
      && traversalCurrentDepth > 0
      && traversalCurrentDepth < activeTraversalMaxDepth
      && !traversalLoading
  )

  useEffect(() => {
    if (!isOpen || !jobId) return
    let cancelled = false

    const fetchStats = async () => {
      setLoadingStats(true)
      setError(null)
      try {
        const response = await apiFetch(`/api/graph/${jobId}/stats`)
        const payload = await parseJsonSafe(response)
        if (!response.ok) {
          throw new Error(payload?.detail || 'Failed to load graph stats')
        }
        if (!cancelled) {
          setStats(payload)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Failed to load graph stats')
        }
      } finally {
        if (!cancelled) {
          setLoadingStats(false)
        }
      }
    }

    fetchStats()
    return () => {
      cancelled = true
    }
  }, [isOpen, jobId])

  useEffect(() => {
    if (!isOpen || !selectedGraphId) return
    setRelatedTo(selectedGraphId)
    if (!traversalCurrentDepth) {
      setTraversalStartId(selectedGraphId)
    }
  }, [isOpen, selectedGraphId, traversalCurrentDepth])

  const fetchGraphPayload = useCallback(async (path, fallbackMessage) => {
    const response = await apiFetch(path)
    const payload = await parseJsonSafe(response)
    if (!response.ok) {
      throw new Error(payload?.detail || fallbackMessage)
    }
    return payload
  }, [])

  const resetTraversal = useCallback(() => {
    setTraversalCurrentDepth(0)
    setFrontierNodeIds([])
    setVisitedNodeIds([])
    setVisitedEdgeKeys([])
    setTraversalGraph(EMPTY_GRAPH_RESULT)
    setHopBatches([])
    setPathResult(null)
    setActiveTraversalStartId('')
    setActiveTraversalRelationship('ALL')
    setActiveTraversalMaxDepth(3)
  }, [])

  const runQuery = useCallback(async () => {
    if (!jobId) {
      setError('Upload a model first.')
      return
    }

    setRunningQuery(true)
    setError(null)
    try {
      const body = {
        node_type: nodeType === 'ALL' ? null : nodeType,
        storey: storey === 'ALL' ? null : storey,
        material: material === 'ALL' ? null : material,
        name_contains: nameContains.trim() || null,
        related_to: relatedTo.trim() || null,
        relationship: relationship === 'ALL' ? null : relationship,
        max_depth: Number(maxDepth) || 1,
        limit: 200,
        offset: 0,
      }

      const response = await apiFetch(`/api/graph/${jobId}/query`, {
        method: 'POST',
        body,
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Graph query failed')
      }

      setResult({
        nodes: Array.isArray(payload?.nodes) ? payload.nodes : [],
        edges: Array.isArray(payload?.edges) ? payload.edges : [],
        total: Number(payload?.total || 0),
      })
    } catch (err) {
      setError(err.message || 'Graph query failed')
    } finally {
      setRunningQuery(false)
    }
  }, [jobId, material, maxDepth, nameContains, nodeType, relatedTo, relationship, storey])

  const expandTraversal = useCallback(async ({ reset = false } = {}) => {
    if (!jobId) {
      setError('Upload a model first.')
      return
    }

    const requestedStartId = traversalStartId.trim()
    const startId = reset ? requestedStartId : (activeTraversalStartId || requestedStartId)
    if (!startId) {
      setError('Enter a start node id.')
      return
    }

    const relationshipFilter = reset ? traversalRelationship : activeTraversalRelationship
    const depthLimit = reset ? Number(traversalMaxDepth) || 1 : activeTraversalMaxDepth
    const nextDepth = (reset ? 0 : traversalCurrentDepth) + 1
    const frontierIds = reset ? [startId] : frontierNodeIds

    if (!frontierIds.length) {
      setError('No frontier nodes remain to expand.')
      return
    }
    if (!reset && nextDepth > depthLimit) {
      return
    }

    setTraversalLoading(true)
    setError(null)

    try {
      const frontierPayloads = await Promise.all(
        frontierIds.map(async (nodeId) => ({
          centerId: nodeId,
          payload: await fetchGraphPayload(
            `/api/graph/${jobId}/neighbors/${encodeURIComponent(nodeId)}`,
            `Failed to load neighbors for ${nodeId}`
          ),
        }))
      )

      const nodeMap = new Map()
      const edgeMap = new Map()
      const nextVisitedNodeIds = new Set(reset ? [startId] : visitedNodeIds)
      const nextVisitedEdgeKeys = new Set(reset ? [] : visitedEdgeKeys)
      const newNodeIds = new Set()
      const newEdgeKeys = new Set()
      const batchEntries = []

      for (const node of reset ? [] : traversalGraph.nodes || []) {
        const id = normalizeNodeId(node)
        if (id) nodeMap.set(id, node)
      }

      for (const edge of reset ? [] : traversalGraph.edges || []) {
        const key = normalizeEdgeKey(edge)
        const normalized = normalizeEdge(edge)
        if (key && normalized) {
          edgeMap.set(key, normalized)
        }
      }

      for (const { centerId, payload } of frontierPayloads) {
        const localNodes = dedupeNodes(Array.isArray(payload?.nodes) ? payload.nodes : [])
        const localNodeMap = new Map()

        for (const node of localNodes) {
          const id = normalizeNodeId(node)
          if (!id) continue
          localNodeMap.set(id, node)
        }

        const centerNode = localNodeMap.get(centerId)
        if (centerNode) {
          nodeMap.set(centerId, centerNode)
        }

        const matchingEdges = filterEdgesByRelationship(payload?.edges, relationshipFilter)
        for (const edge of matchingEdges) {
          if (edge.source !== centerId && edge.target !== centerId) continue
          const edgeKey = normalizeEdgeKey(edge)
          if (!edgeKey) continue

          const discoveredId = edge.source === centerId ? edge.target : edge.source
          const discoveredNode = localNodeMap.get(discoveredId)
          const sourceNode = localNodeMap.get(edge.source)
          const targetNode = localNodeMap.get(edge.target)
          const isNewNode = Boolean(discoveredId) && !nextVisitedNodeIds.has(discoveredId)
          const isNewEdge = !nextVisitedEdgeKeys.has(edgeKey)

          if (sourceNode) {
            nodeMap.set(edge.source, sourceNode)
          }
          if (targetNode) {
            nodeMap.set(edge.target, targetNode)
          }

          edgeMap.set(edgeKey, edge)
          nextVisitedEdgeKeys.add(edgeKey)
          if (isNewEdge) newEdgeKeys.add(edgeKey)

          if (discoveredId && isNewNode) {
            nextVisitedNodeIds.add(discoveredId)
            newNodeIds.add(discoveredId)
          }

          batchEntries.push({
            hop: nextDepth,
            edgeKey,
            fromId: centerId,
            fromName: localNodeMap.get(centerId)?.name || centerId,
            sourceId: edge.source,
            sourceName: localNodeMap.get(edge.source)?.name || edge.source,
            targetId: edge.target,
            targetName: localNodeMap.get(edge.target)?.name || edge.target,
            relationship: edge.type,
            discoveredId,
            discoveredName: discoveredNode?.name || discoveredId,
            discoveredType: discoveredNode?.graphRole || discoveredNode?.ifcType || discoveredNode?.label || 'Node',
            discoveredStorey: discoveredNode?.storey || '',
            isNewNode,
          })
        }
      }

      batchEntries.sort((left, right) => {
        const leftKey = `${left.relationship}|${left.fromName}|${left.discoveredName}`
        const rightKey = `${right.relationship}|${right.fromName}|${right.discoveredName}`
        return leftKey.localeCompare(rightKey)
      })

      const batch = {
        hop: nextDepth,
        sourceNodeIds: [...frontierIds],
        newNodeIds: [...newNodeIds],
        newEdgeKeys: [...newEdgeKeys],
        relationshipTypes: uniqueSorted(batchEntries.map((entry) => entry.relationship)),
        entries: batchEntries,
      }

      const nextNodes = sortNodes(Array.from(nodeMap.values()))
      const nextEdges = dedupeEdges(Array.from(edgeMap.values()))

      setTraversalGraph({ nodes: nextNodes, edges: nextEdges, total: nextNodes.length })
      setVisitedNodeIds(Array.from(nextVisitedNodeIds))
      setVisitedEdgeKeys(Array.from(nextVisitedEdgeKeys))
      setFrontierNodeIds(Array.from(newNodeIds))
      setTraversalCurrentDepth(nextDepth)
      setHopBatches((previous) => (reset ? [batch] : [...previous, batch]))
      setPathResult(null)
      setActiveTraversalStartId(startId)
      setActiveTraversalRelationship(relationshipFilter)
      setActiveTraversalMaxDepth(depthLimit)
    } catch (err) {
      setError(err.message || 'Traversal request failed')
    } finally {
      setTraversalLoading(false)
    }
  }, [
    activeTraversalMaxDepth,
    activeTraversalRelationship,
    activeTraversalStartId,
    fetchGraphPayload,
    frontierNodeIds,
    jobId,
    traversalCurrentDepth,
    traversalGraph.edges,
    traversalGraph.nodes,
    traversalMaxDepth,
    traversalRelationship,
    traversalStartId,
    visitedEdgeKeys,
    visitedNodeIds,
  ])

  const handleFindPath = useCallback(async () => {
    if (!jobId) {
      setError('Upload a model first.')
      return
    }

    const sourceId = (activeTraversalStartId || traversalStartId).trim()
    const targetId = traversalTargetId.trim()
    if (!sourceId || !targetId) {
      setError('Enter both a start node id and a target node id.')
      return
    }

    setTraversalLoading(true)
    setError(null)
    try {
      const payload = await fetchGraphPayload(
        `/api/graph/${jobId}/path/${encodeURIComponent(sourceId)}/${encodeURIComponent(targetId)}`,
        'Failed to compute graph path'
      )

      setPathResult({
        nodes: sortNodes(Array.isArray(payload?.nodes) ? payload.nodes : []),
        edges: dedupeEdges(Array.isArray(payload?.edges) ? payload.edges : []),
        total: Number(payload?.total || 0),
        hops: Number(payload?.hops || 0),
      })
    } catch (err) {
      setError(err.message || 'Failed to compute graph path')
    } finally {
      setTraversalLoading(false)
    }
  }, [activeTraversalStartId, fetchGraphPayload, jobId, traversalStartId, traversalTargetId])

  const handleSelectRow = useCallback((node) => {
    const id = node?.id || node?.globalId
    if (!id || id.startsWith('mat:') || id.startsWith('sys:')) return
    setRelatedTo(String(id))
    onSelectResult?.(id)
  }, [onSelectResult])

  const handleGraphNodeSelect = useCallback((id) => {
    if (!id) return
    setRelatedTo(String(id))
    onSelectResult?.(id)
  }, [onSelectResult])

  const handleTraversalNodeSelect = useCallback((id) => {
    if (!id) return
    setTraversalTargetId(String(id))
    onSelectResult?.(id)
  }, [onSelectResult])

  const handleTraversalRowSelect = useCallback((entry) => {
    const id = entry?.discoveredId || entry?.targetId || entry?.sourceId
    if (!id || String(id).startsWith('mat:') || String(id).startsWith('sys:')) return
    setTraversalTargetId(String(id))
    onSelectResult?.(id)
  }, [onSelectResult])

  const handleHighlightAll = useCallback(() => {
    if (selectableResultIds.length) {
      onSelectResultBatch?.(selectableResultIds)
    }
  }, [onSelectResultBatch, selectableResultIds])

  if (!isOpen) return null

  return (
    <DraggablePanel
      position={position}
      setPosition={setPosition}
      size={size}
      setSize={setSize}
      minWidth={340}
      minHeight={360}
      panelStyle={styles.panel}
      resizeHandleStyle={styles.resizeHandle}
      zIndex={zIndex}
      focusToken={focusToken}
      stopPointerDown
    >
      <div style={styles.header} className="drag-handle">
        <div style={styles.titleWrap}>
          <span style={styles.dragIcon}>:::</span>
          <h3 style={styles.title}>Graph Explorer</h3>
        </div>
        <button type="button" style={styles.closeButton} onClick={onClose}>x</button>
      </div>

      <div style={styles.content}>
        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.modeToggle}>
          <button
            type="button"
            style={{ ...styles.modeButton, ...(panelMode === PANEL_MODES.QUERY ? styles.modeButtonActive : {}) }}
            onClick={() => setPanelMode(PANEL_MODES.QUERY)}
          >
            Structured Query
          </button>
          <button
            type="button"
            style={{ ...styles.modeButton, ...(panelMode === PANEL_MODES.TRAVERSAL ? styles.modeButtonActive : {}) }}
            onClick={() => setPanelMode(PANEL_MODES.TRAVERSAL)}
          >
            Traversal Explorer
          </button>
        </div>

        {panelMode === PANEL_MODES.QUERY ? (
          <>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Filters</div>
              <div style={styles.grid}>
                <label style={styles.label}>
                  <span>Type</span>
                  <select value={nodeType} onChange={(e) => setNodeType(e.target.value)} style={styles.select}>
                    {typeOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  <span>Storey</span>
                  <select value={storey} onChange={(e) => setStorey(e.target.value)} style={styles.select}>
                    {storeyOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  <span>Material</span>
                  <select value={material} onChange={(e) => setMaterial(e.target.value)} style={styles.select}>
                    {materialOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  <span>Name Contains</span>
                  <input
                    value={nameContains}
                    onChange={(e) => setNameContains(e.target.value)}
                    placeholder="wall, ahu, room..."
                    style={styles.input}
                  />
                </label>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Related To</div>
              <div style={styles.grid}>
                <label style={styles.label}>
                  <span>GlobalId</span>
                  <input
                    value={relatedTo}
                    onChange={(e) => setRelatedTo(e.target.value)}
                    placeholder="auto from current selection"
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  <span>Depth</span>
                  <select value={String(maxDepth)} onChange={(e) => setMaxDepth(Number(e.target.value))} style={styles.select}>
                    <option value="1">1 hop</option>
                    <option value="2">2 hops</option>
                    <option value="3">3 hops</option>
                  </select>
                </label>
                <label style={styles.label}>
                  <span>Edge</span>
                  <select value={relationship} onChange={(e) => setRelationship(e.target.value)} style={styles.select}>
                    {edgeOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div style={styles.actions}>
              <button type="button" onClick={runQuery} style={styles.primaryButton} disabled={runningQuery || loadingStats}>
                {runningQuery ? 'Running...' : 'Run Query'}
              </button>
              <button
                type="button"
                onClick={handleHighlightAll}
                style={styles.secondaryButton}
                disabled={!selectableResultIds.length}
              >
                Highlight Results
              </button>
              <button
                type="button"
                onClick={() => {
                  setResult(EMPTY_GRAPH_RESULT)
                  setShowGraphView(false)
                }}
                style={styles.secondaryButton}
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setShowGraphView((previous) => !previous)}
                style={styles.secondaryButton}
                disabled={!result.nodes?.length}
              >
                {showGraphView ? 'Show Results List' : 'Show Graph View'}
              </button>
            </div>

            <div style={styles.summary}>
              {loadingStats ? 'Loading graph stats...' : `Results: ${result.total || 0}`}
              {stats?.node_count ? ` | Graph: ${stats.node_count} nodes / ${stats.edge_count || 0} edges` : ''}
            </div>

            {showGraphView ? (
              <GraphView
                nodes={result.nodes || []}
                edges={result.edges || []}
                onNodeSelect={handleGraphNodeSelect}
                onExit={() => setShowGraphView(false)}
              />
            ) : (
              <div style={styles.resultList}>
                {(result.nodes || []).map((node) => {
                  const id = node?.id || node?.globalId
                  const selectable = Boolean(id) && !String(id).startsWith('mat:') && !String(id).startsWith('sys:')
                  return (
                    <button
                      key={String(id)}
                      type="button"
                      style={{ ...styles.resultRow, ...(selectable ? styles.resultRowInteractive : styles.resultRowMuted) }}
                      onClick={() => selectable && handleSelectRow(node)}
                      disabled={!selectable}
                      title={selectable ? 'Select in model' : 'Synthetic node'}
                    >
                      <div style={styles.resultTop}>
                        <span style={styles.typePill}>{node.graphRole || node.ifcType || node.label || 'Node'}</span>
                        <span style={styles.resultId}>{id}</span>
                      </div>
                      <div style={styles.resultName}>{node.name || '(unnamed)'}</div>
                      <div style={styles.resultMeta}>
                        <span>{node.storey || '-'}</span>
                        <span>{Array.isArray(node.materials) ? node.materials.join(', ') : ''}</span>
                      </div>
                    </button>
                  )
                })}
                {!result.nodes?.length && !runningQuery && (
                  <div style={styles.empty}>Run a query to see results.</div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <div style={styles.card}>
              <div style={styles.cardTitle}>Traversal Controls</div>
              <div style={styles.grid}>
                <label style={styles.label}>
                  <span>Start Node</span>
                  <input
                    value={traversalStartId}
                    onChange={(e) => setTraversalStartId(e.target.value)}
                    placeholder="auto from current selection"
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  <span>Target Node</span>
                  <input
                    value={traversalTargetId}
                    onChange={(e) => setTraversalTargetId(e.target.value)}
                    placeholder="optional for shortest path"
                    style={styles.input}
                  />
                </label>
                <label style={styles.label}>
                  <span>Max Hops</span>
                  <select
                    value={String(traversalMaxDepth)}
                    onChange={(e) => setTraversalMaxDepth(Number(e.target.value))}
                    style={styles.select}
                  >
                    {TRAVERSAL_DEPTH_OPTIONS.map((value) => (
                      <option key={String(value)} value={String(value)}>{value} hops</option>
                    ))}
                  </select>
                </label>
                <label style={styles.label}>
                  <span>Edge Filter</span>
                  <select
                    value={traversalRelationship}
                    onChange={(e) => setTraversalRelationship(e.target.value)}
                    style={styles.select}
                  >
                    {edgeOptions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div style={styles.actions}>
                <button
                  type="button"
                  onClick={() => expandTraversal({ reset: true })}
                  style={styles.primaryButton}
                  disabled={traversalLoading || loadingStats}
                >
                  {traversalLoading ? 'Loading...' : 'Load 1-Hop'}
                </button>
                <button
                  type="button"
                  onClick={() => expandTraversal({ reset: false })}
                  style={styles.secondaryButton}
                  disabled={!traversalCanExpand}
                >
                  Next Hop
                </button>
                <button
                  type="button"
                  onClick={resetTraversal}
                  style={styles.secondaryButton}
                  disabled={!traversalCurrentDepth && !pathResult}
                >
                  Reset Traversal
                </button>
                <button
                  type="button"
                  onClick={handleFindPath}
                  style={styles.secondaryButton}
                  disabled={traversalLoading || !((activeTraversalStartId || traversalStartId).trim() && traversalTargetId.trim())}
                >
                  Find Path
                </button>
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Traversal Summary</div>
              <div style={styles.summaryGrid}>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{resolvedTraversalStartId || '-'}</div>
                  <div style={styles.metricLabel}>Start Node</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{traversalCurrentDepth}</div>
                  <div style={styles.metricLabel}>Current Depth</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{visitedNodeIds.length}</div>
                  <div style={styles.metricLabel}>Visited Nodes</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{visitedEdgeKeys.length}</div>
                  <div style={styles.metricLabel}>Visited Edges</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{latestHop?.newNodeIds?.length || 0}</div>
                  <div style={styles.metricLabel}>New Nodes This Hop</div>
                </div>
                <div style={styles.metricCard}>
                  <div style={styles.metricValue}>{latestHop?.newEdgeKeys?.length || 0}</div>
                  <div style={styles.metricLabel}>New Edges This Hop</div>
                </div>
              </div>
              <div style={styles.summaryMeta}>
                {traversalStartNode?.name ? `Start name: ${traversalStartNode.name}` : 'Load a start node to inspect traversal.'}
              </div>
              <div style={styles.summaryMeta}>
                Active filter: {activeTraversalRelationship || traversalRelationship} | Max depth: {activeTraversalMaxDepth}
              </div>
              <div style={styles.summaryMeta}>
                {latestHop?.relationshipTypes?.length
                  ? `Relationships this hop: ${latestHop.relationshipTypes.join(', ')}`
                  : 'Relationships this hop: none'}
              </div>
              <div style={styles.summaryMeta}>
                {loadingStats ? 'Loading graph stats...' : `Graph: ${stats?.node_count || 0} nodes / ${stats?.edge_count || 0} edges`}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardTitle}>Traversal Graph</div>
              {traversalGraphResult.nodes.length ? (
                <GraphView
                  nodes={traversalGraphResult.nodes}
                  edges={traversalGraphResult.edges}
                  onNodeSelect={handleTraversalNodeSelect}
                  startNodeId={resolvedTraversalStartId}
                  nodeHopMap={traversalNodeHopMap}
                  highlightedEdgeKeys={latestHop?.newEdgeKeys || []}
                  pathNodeIds={pathNodeIds}
                  pathEdgeKeys={pathEdgeKeys}
                  activeNodeIds={traversalActiveNodeIds}
                />
              ) : (
                <div style={styles.empty}>Load 1-Hop to visualize a traversal.</div>
              )}
            </div>

            {pathResult ? (
              <div style={styles.card}>
                <div style={styles.cardTitle}>Shortest Path</div>
                <div style={styles.summaryMeta}>
                  {pathResult.hops} hop{pathResult.hops === 1 ? '' : 's'} from {(activeTraversalStartId || traversalStartId).trim()} to {traversalTargetId.trim()}
                </div>
                <div style={styles.pathList}>
                  {(pathResult.nodes || []).map((node, index) => {
                    const nextEdge = pathResult.edges?.[index]
                    return (
                      <div key={`${normalizeNodeId(node)}-${index}`} style={styles.pathStep}>
                        <div style={styles.pathStepNumber}>{index + 1}</div>
                        <div style={styles.pathStepBody}>
                          <div style={styles.pathStepName}>{node.name || normalizeNodeId(node)}</div>
                          <div style={styles.pathStepMeta}>
                            {(node.graphRole || node.ifcType || node.label || 'Node')}
                            {node.storey ? ` | ${node.storey}` : ''}
                            {nextEdge?.type ? ` | via ${nextEdge.type}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div style={styles.card}>
              <div style={styles.cardTitle}>Hop Breakdown</div>
              {hopBatches.length ? hopBatches.map((batch) => (
                <div key={`hop-${batch.hop}`} style={styles.hopCard}>
                  <div style={styles.hopHeader}>
                    <div>
                      <div style={styles.hopTitle}>Hop {batch.hop}</div>
                      <div style={styles.hopMeta}>
                        {batch.newNodeIds.length} new nodes | {batch.newEdgeKeys.length} new edges
                      </div>
                    </div>
                    <div style={styles.relationshipChipWrap}>
                      {(batch.relationshipTypes.length ? batch.relationshipTypes : ['No matches']).map((value) => (
                        <span key={`${batch.hop}-${value}`} style={styles.relationshipChip}>{value}</span>
                      ))}
                    </div>
                  </div>

                  {batch.entries.length ? batch.entries.map((entry, index) => (
                    <button
                      key={`${batch.hop}-${entry.edgeKey}-${index}`}
                      type="button"
                      style={styles.hopEntry}
                      onClick={() => handleTraversalRowSelect(entry)}
                    >
                      <div style={styles.hopEntryTop}>
                        <span style={styles.typePill}>{entry.relationship}</span>
                        <span style={entry.isNewNode ? styles.badge : styles.badgeMuted}>
                          {entry.isNewNode ? 'New' : 'Seen'}
                        </span>
                      </div>
                      <div style={styles.hopEntryText}>
                        {entry.fromName || entry.fromId}
                        {' -> '}
                        {entry.discoveredName || entry.discoveredId}
                      </div>
                      <div style={styles.resultMeta}>
                        <span>{entry.discoveredType}</span>
                        <span>{entry.discoveredStorey || '-'}</span>
                      </div>
                      <div style={styles.directionText}>
                        Stored direction: {entry.sourceName || entry.sourceId}
                        {' -> '}
                        {entry.targetName || entry.targetId}
                      </div>
                    </button>
                  )) : (
                    <div style={styles.empty}>No matching relationships found for this hop.</div>
                  )}
                </div>
              )) : (
                <div style={styles.empty}>Load 1-Hop to inspect traversal batches.</div>
              )}
            </div>
          </>
        )}
      </div>
    </DraggablePanel>
  )
}

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px'

const styles = {
  panel: {
    position: 'absolute',
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    boxShadow: softShadow,
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    overflow: 'hidden',
    fontFamily: 'inherit',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'grab',
    userSelect: 'none',
    background: 'rgba(255, 255, 255, 0.5)',
  },
  titleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dragIcon: {
    color: '#86868b',
    fontSize: '12px',
    letterSpacing: '-1px',
    cursor: 'grab',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  closeButton: {
    background: '#e8e8ec',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    padding: '4px 8px',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  content: {
    padding: '14px',
    overflowY: 'auto',
    flex: 1,
    background: 'rgba(255, 255, 255, 0.3)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  modeToggle: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  modeButton: {
    border: 'none',
    borderRadius: '10px',
    padding: '10px 12px',
    background: '#e8e8ec',
    color: '#4a4a50',
    boxShadow: softShadow,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 700,
  },
  modeButtonActive: {
    background: '#1f7ae0',
    color: '#fff',
  },
  card: {
    borderRadius: '10px',
    background: '#e8e8ec',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
    padding: '10px',
  },
  cardTitle: {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.6px',
    color: '#86868b',
    marginBottom: '8px',
    fontWeight: 700,
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
    color: '#5c5c60',
  },
  select: {
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    background: '#f6f6f8',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.08), inset -1px -1px 2px rgba(255,255,255,0.7)',
    fontSize: '12px',
  },
  input: {
    padding: '8px',
    borderRadius: '8px',
    border: 'none',
    background: '#f6f6f8',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.08), inset -1px -1px 2px rgba(255,255,255,0.7)',
    fontSize: '12px',
  },
  actions: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginTop: '10px',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    background: '#1f7ae0',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '12px',
  },
  secondaryButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '8px 12px',
    background: '#e8e8ec',
    color: '#1d1d1f',
    boxShadow: softShadow,
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 600,
  },
  summary: {
    fontSize: '12px',
    color: '#5c5c60',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
  },
  metricCard: {
    background: '#f6f6f8',
    borderRadius: '10px',
    padding: '10px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.06)',
  },
  metricValue: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#1d1d1f',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  metricLabel: {
    marginTop: '4px',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#6b7280',
  },
  summaryMeta: {
    marginTop: '8px',
    fontSize: '11px',
    color: '#5c5c60',
  },
  resultList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '120px',
  },
  resultRow: {
    width: '100%',
    textAlign: 'left',
    border: 'none',
    borderRadius: '10px',
    background: '#ececef',
    padding: '10px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.06)',
  },
  resultRowInteractive: {
    cursor: 'pointer',
  },
  resultRowMuted: {
    opacity: 0.75,
    cursor: 'default',
  },
  resultTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  typePill: {
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    background: '#ddeafc',
    color: '#16509a',
    borderRadius: '999px',
    padding: '2px 7px',
    fontWeight: 700,
  },
  resultId: {
    fontSize: '10px',
    color: '#707076',
    maxWidth: '210px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultName: {
    marginTop: '5px',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  resultMeta: {
    marginTop: '4px',
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '11px',
    color: '#5c5c60',
  },
  pathList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  pathStep: {
    display: 'flex',
    gap: '10px',
    alignItems: 'flex-start',
    background: '#f6f6f8',
    borderRadius: '10px',
    padding: '10px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.06)',
  },
  pathStepNumber: {
    minWidth: '24px',
    height: '24px',
    borderRadius: '999px',
    background: '#be123c',
    color: '#fff',
    fontSize: '11px',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathStepBody: {
    minWidth: 0,
    flex: 1,
  },
  pathStepName: {
    fontSize: '12px',
    fontWeight: 700,
    color: '#1d1d1f',
  },
  pathStepMeta: {
    marginTop: '4px',
    fontSize: '11px',
    color: '#5c5c60',
  },
  hopCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
    paddingTop: '10px',
    marginTop: '10px',
  },
  hopHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    alignItems: 'flex-start',
  },
  hopTitle: {
    fontSize: '13px',
    fontWeight: 700,
    color: '#1d1d1f',
  },
  hopMeta: {
    marginTop: '3px',
    fontSize: '11px',
    color: '#5c5c60',
  },
  relationshipChipWrap: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  relationshipChip: {
    borderRadius: '999px',
    padding: '3px 8px',
    background: '#ddeafc',
    color: '#16509a',
    fontSize: '10px',
    fontWeight: 700,
  },
  hopEntry: {
    border: 'none',
    width: '100%',
    textAlign: 'left',
    borderRadius: '10px',
    background: '#f6f6f8',
    padding: '10px',
    cursor: 'pointer',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.7), inset -1px -1px 2px rgba(0,0,0,0.06)',
  },
  hopEntryTop: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    alignItems: 'center',
  },
  hopEntryText: {
    marginTop: '6px',
    fontSize: '12px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  badge: {
    borderRadius: '999px',
    padding: '2px 7px',
    fontSize: '10px',
    fontWeight: 700,
    background: '#d1fae5',
    color: '#065f46',
  },
  badgeMuted: {
    borderRadius: '999px',
    padding: '2px 7px',
    fontSize: '10px',
    fontWeight: 700,
    background: '#e5e7eb',
    color: '#4b5563',
  },
  directionText: {
    marginTop: '6px',
    fontSize: '10px',
    color: '#6b7280',
  },
  empty: {
    fontSize: '12px',
    color: '#7a7a80',
    padding: '8px 4px',
  },
  error: {
    color: '#b3261e',
    background: '#fde9e7',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '12px',
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '20px',
    height: '20px',
    cursor: 'nwse-resize',
    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
    borderBottomRightRadius: '12px',
    zIndex: 10,
  },
}

export default GraphQueryPanel
