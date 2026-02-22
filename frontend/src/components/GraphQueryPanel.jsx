import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DraggablePanel from './DraggablePanel'
import GraphView from './GraphView'
import { apiFetch, parseJsonSafe } from '../utils/api'

const EDGE_OPTIONS = [
  'ALL',
  'CONTAINED_IN',
  'DECOMPOSES',
  'HAS_MATERIAL',
  'BOUNDED_BY',
  'FEEDS',
  'SERVES',
  'IN_SYSTEM',
]

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

  const [loadingStats, setLoadingStats] = useState(false)
  const [runningQuery, setRunningQuery] = useState(false)
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [result, setResult] = useState({ nodes: [], edges: [], total: 0 })

  const [nodeType, setNodeType] = useState('ALL')
  const [storey, setStorey] = useState('ALL')
  const [material, setMaterial] = useState('ALL')
  const [nameContains, setNameContains] = useState('')
  const [relatedTo, setRelatedTo] = useState('')
  const [maxDepth, setMaxDepth] = useState(1)
  const [relationship, setRelationship] = useState('ALL')
  const [showGraphView, setShowGraphView] = useState(false)

  const typeOptions = useMemo(() => ['ALL', ...Object.keys(stats?.node_types || {})], [stats])
  const storeyOptions = useMemo(() => ['ALL', ...(stats?.storeys || [])], [stats])
  const materialOptions = useMemo(() => ['ALL', ...(stats?.materials || [])], [stats])

  const selectableResultIds = useMemo(() => {
    const ids = (result?.nodes || [])
      .map((node) => node?.id || node?.globalId)
      .filter((id) => typeof id === 'string' && !id.startsWith('mat:') && !id.startsWith('sys:'))
    return uniqueSorted(ids)
  }, [result])

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
    if (!isOpen) return
    const id = extractSelectedId(selectedId)
    if (!id) return
    setRelatedTo(id)
  }, [isOpen, selectedId])

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
  }, [jobId, nodeType, storey, material, nameContains, relatedTo, relationship, maxDepth])

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

  const handleHighlightAll = useCallback(() => {
    if (!selectableResultIds.length) return
    onSelectResultBatch?.(selectableResultIds)
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
          <h3 style={styles.title}>Graph Query</h3>
        </div>
        <button type="button" style={styles.closeButton} onClick={onClose}>x</button>
      </div>

      <div style={styles.content}>
        {error && <div style={styles.error}>{error}</div>}

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
                {EDGE_OPTIONS.map((value) => (
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
          <button type="button" onClick={() => setResult({ nodes: [], edges: [], total: 0 })} style={styles.secondaryButton}>
            Clear
          </button>
          <button
            type="button"
            onClick={() => setShowGraphView(prev => !prev)}
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
                    <span style={styles.typePill}>{node.ifcType || node.label || 'Node'}</span>
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
