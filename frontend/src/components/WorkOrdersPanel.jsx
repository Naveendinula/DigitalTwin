import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DraggablePanel from './DraggablePanel'
import { apiFetch, parseJsonSafe } from '../utils/api'

const STATUS_CYCLE = ['open', 'in_progress', 'on_hold', 'resolved', 'closed']
const CATEGORY_OPTIONS = ['inspection', 'repair', 'replacement', 'preventive', 'corrective', 'note', 'issue']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']
const ACTIVE_STATUSES = new Set(['open', 'in_progress', 'on_hold'])

const PRIORITY_COLORS = {
  low: '#8e8e93',
  medium: '#0071e3',
  high: '#ff9500',
  critical: '#ff3b30',
}

function getNextStatus(status) {
  const index = STATUS_CYCLE.indexOf(status)
  if (index === -1) return 'open'
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length]
}

function formatRelativeTime(isoValue) {
  if (!isoValue) return '-'
  const then = new Date(isoValue).getTime()
  if (Number.isNaN(then)) return '-'
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function WorkOrdersPanel({
  isOpen,
  onClose,
  jobId,
  selectedId,
  onSelectWorkOrder,
  focusToken,
  zIndex,
}) {
  const [position, setPosition] = useState({ x: 820, y: 80 })
  const [size, setSize] = useState({ width: 420, height: 560 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')
  const [selectedOnly, setSelectedOnly] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createPending, setCreatePending] = useState(false)
  const [statusUpdateId, setStatusUpdateId] = useState(null)
  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'issue',
    priority: 'medium',
    description: '',
  })

  const selectedGlobalId = useMemo(() => {
    if (Array.isArray(selectedId)) return selectedId[0] || ''
    return selectedId || ''
  }, [selectedId])

  useEffect(() => {
    if (selectedOnly && !selectedGlobalId) {
      setSelectedOnly(false)
    }
  }, [selectedOnly, selectedGlobalId])

  const fetchWorkOrders = useCallback(async () => {
    if (!isOpen || !jobId) return

    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: '200',
        offset: '0',
      })
      if (selectedOnly && selectedGlobalId) {
        params.set('global_id', selectedGlobalId)
      }
      if (statusFilter !== 'all' && statusFilter !== 'active') {
        params.set('status', statusFilter)
      }

      const response = await apiFetch(`/api/work-orders/${jobId}?${params.toString()}`)
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to load work orders')
      }

      let list = Array.isArray(payload) ? payload : []
      if (statusFilter === 'active') {
        list = list.filter((item) => ACTIVE_STATUSES.has(item.status))
      }
      setItems(list)

      const summaryResponse = await apiFetch(`/api/work-orders/${jobId}/summary`)
      const summaryPayload = await parseJsonSafe(summaryResponse)
      if (summaryResponse.ok && summaryPayload) {
        setSummary(summaryPayload)
      }
    } catch (err) {
      setError(err.message || 'Failed to load work orders')
    } finally {
      setLoading(false)
    }
  }, [isOpen, jobId, selectedOnly, selectedGlobalId, statusFilter])

  useEffect(() => {
    fetchWorkOrders()
  }, [fetchWorkOrders])

  const handleCreate = async () => {
    if (!jobId || !selectedGlobalId || createPending) return
    const title = createForm.title.trim()
    if (!title) {
      setError('Title is required')
      return
    }

    setCreatePending(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/work-orders/${jobId}`, {
        method: 'POST',
        body: {
          global_id: selectedGlobalId,
          category: createForm.category,
          title,
          description: createForm.description.trim(),
          priority: createForm.priority,
        },
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to create work order')
      }

      setCreateForm({
        title: '',
        category: 'issue',
        priority: 'medium',
        description: '',
      })
      setShowCreateForm(false)
      await fetchWorkOrders()
    } catch (err) {
      setError(err.message || 'Failed to create work order')
    } finally {
      setCreatePending(false)
    }
  }

  const handleCycleStatus = async (item) => {
    if (!jobId || statusUpdateId || typeof item?.id !== 'number') return
    const nextStatus = getNextStatus(item.status)
    const previous = item.status

    setStatusUpdateId(item.id)
    setItems((prev) =>
      prev.map((row) => (row.id === item.id ? { ...row, status: nextStatus, updated_at: new Date().toISOString() } : row))
    )

    try {
      const response = await apiFetch(`/api/work-orders/${jobId}/${item.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update work order')
      }
      setItems((prev) => prev.map((row) => (row.id === item.id ? payload : row)))
      await fetchWorkOrders()
    } catch (err) {
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, status: previous } : row))
      )
      setError(err.message || 'Failed to update work order')
    } finally {
      setStatusUpdateId(null)
    }
  }

  const activeCount = summary?.status
    ? Number(summary.status.open || 0) + Number(summary.status.in_progress || 0) + Number(summary.status.on_hold || 0)
    : items.filter((item) => ACTIVE_STATUSES.has(item.status)).length

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
        <div style={styles.titleRow}>
          <span style={styles.dragIcon}>:::</span>
          <h3 style={styles.title}>Work Orders</h3>
          <span style={styles.badge}>{activeCount} active</span>
        </div>
        <button type="button" onClick={onClose} style={styles.closeButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={styles.content}>
        <div style={styles.summaryRow}>
          <SummaryPill label="Open" value={summary?.status?.open || 0} color="#ff3b30" />
          <SummaryPill label="In Progress" value={summary?.status?.in_progress || 0} color="#ff9500" />
          <SummaryPill label="On Hold" value={summary?.status?.on_hold || 0} color="#5ac8fa" />
          <SummaryPill label="Overdue" value={summary?.overdue || 0} color="#af52de" />
        </div>

        <div style={styles.controlRow}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={styles.select}
          >
            <option value="active">Active</option>
            <option value="all">All</option>
            {STATUS_CYCLE.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
          <button
            type="button"
            style={{
              ...styles.toggleButton,
              ...(selectedOnly ? styles.toggleButtonActive : {}),
              ...(!selectedGlobalId ? styles.toggleButtonDisabled : {}),
            }}
            onClick={() => selectedGlobalId && setSelectedOnly((prev) => !prev)}
            title={selectedGlobalId ? 'Filter to selected element' : 'Select an element first'}
          >
            Selected
          </button>
          <button type="button" style={styles.actionButton} onClick={() => setShowCreateForm((prev) => !prev)}>
            {showCreateForm ? 'Cancel' : 'New'}
          </button>
        </div>

        {showCreateForm && (
          <div style={styles.form}>
            <div style={styles.formMeta}>
              <span style={styles.formMetaLabel}>Element:</span>
              <code style={styles.globalId}>{selectedGlobalId || 'None selected'}</code>
            </div>
            <input
              type="text"
              placeholder="Work order title"
              value={createForm.title}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
              style={styles.input}
              disabled={!selectedGlobalId || createPending}
            />
            <div style={styles.formRow}>
              <select
                value={createForm.category}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))}
                style={styles.select}
                disabled={createPending}
              >
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
              <select
                value={createForm.priority}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))}
                style={styles.select}
                disabled={createPending}
              >
                {PRIORITY_OPTIONS.map((priority) => (
                  <option key={priority} value={priority}>{priority}</option>
                ))}
              </select>
            </div>
            <textarea
              placeholder="Description (optional)"
              value={createForm.description}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))}
              style={styles.textarea}
              disabled={createPending}
            />
            <button
              type="button"
              onClick={handleCreate}
              style={styles.primaryButton}
              disabled={!selectedGlobalId || createPending}
            >
              {createPending ? 'Saving...' : 'Create from Selection'}
            </button>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        {loading && <div style={styles.loading}>Loading work orders...</div>}

        {!loading && items.length === 0 && (
          <div style={styles.empty}>
            No work orders for the current filters.
          </div>
        )}

        {!loading && items.length > 0 && (
          <div style={styles.list}>
            {items.map((item) => (
              <div key={item.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div style={styles.cardTitleWrap}>
                    <span style={styles.workOrderNo}>{item.work_order_no}</span>
                    <span style={{ ...styles.priorityDot, background: PRIORITY_COLORS[item.priority] || '#8e8e93' }} />
                    <strong style={styles.cardTitle}>{item.title}</strong>
                  </div>
                  <button
                    type="button"
                    style={styles.statusButton}
                    onClick={() => handleCycleStatus(item)}
                    disabled={statusUpdateId === item.id}
                  >
                    {item.status}
                  </button>
                </div>
                <div style={styles.metaRow}>
                  <span>{item.category}</span>
                  <span>{item.element_type || 'Unknown type'}</span>
                  <span>{formatRelativeTime(item.updated_at)}</span>
                </div>
                <div style={styles.actionRow}>
                  <button
                    type="button"
                    style={styles.linkButton}
                    onClick={() => onSelectWorkOrder && item.global_id && onSelectWorkOrder(item.global_id)}
                  >
                    Locate in model
                  </button>
                  <code style={styles.globalId}>{item.global_id}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DraggablePanel>
  )
}

function SummaryPill({ label, value, color }) {
  return (
    <div style={{ ...styles.summaryPill, borderColor: color }}>
      <span style={{ ...styles.summaryDot, background: color }} />
      <span style={styles.summaryLabel}>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    background: 'rgba(255, 255, 255, 0.97)',
    border: '1px solid rgba(229, 229, 231, 0.9)',
    borderRadius: '14px',
    boxShadow: '0 20px 44px rgba(0, 0, 0, 0.16)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    backdropFilter: 'blur(10px)',
  },
  resizeHandle: {
    position: 'absolute',
    width: '16px',
    height: '16px',
    right: '0',
    bottom: '0',
    cursor: 'nwse-resize',
    background: 'linear-gradient(135deg, transparent 0%, transparent 50%, rgba(134, 134, 139, 0.35) 50%, rgba(134, 134, 139, 0.35) 100%)',
    borderBottomRightRadius: '14px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #ececee',
    cursor: 'grab',
    userSelect: 'none',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  dragIcon: {
    color: '#b0b0b4',
    fontSize: '13px',
    letterSpacing: '1px',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  badge: {
    padding: '3px 8px',
    borderRadius: '999px',
    background: '#eef6ff',
    color: '#0071e3',
    fontSize: '11px',
    fontWeight: 600,
  },
  closeButton: {
    border: 'none',
    background: 'transparent',
    color: '#86868b',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '12px',
    minHeight: 0,
    overflow: 'hidden',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
  },
  summaryPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    border: '1px solid #d9d9de',
    borderRadius: '999px',
    padding: '5px 8px',
    fontSize: '11px',
    color: '#1d1d1f',
  },
  summaryDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
  },
  summaryLabel: {
    color: '#6e6e73',
  },
  controlRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  select: {
    flex: 1,
    border: '1px solid #d2d2d7',
    borderRadius: '8px',
    padding: '7px 8px',
    fontSize: '12px',
    background: '#fff',
    color: '#1d1d1f',
  },
  toggleButton: {
    border: '1px solid #d2d2d7',
    borderRadius: '8px',
    padding: '7px 10px',
    fontSize: '12px',
    color: '#1d1d1f',
    background: '#fff',
    cursor: 'pointer',
  },
  toggleButtonActive: {
    background: '#eef6ff',
    color: '#0071e3',
    borderColor: '#c8e2ff',
  },
  toggleButtonDisabled: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  actionButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '7px 11px',
    background: '#1d1d1f',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    border: '1px solid #e5e5e7',
    borderRadius: '10px',
    padding: '10px',
    background: '#fafafc',
  },
  formMeta: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    fontSize: '11px',
    color: '#6e6e73',
  },
  formMetaLabel: {
    fontWeight: 600,
  },
  input: {
    border: '1px solid #d2d2d7',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '13px',
    color: '#1d1d1f',
    background: '#fff',
  },
  formRow: {
    display: 'flex',
    gap: '8px',
  },
  textarea: {
    border: '1px solid #d2d2d7',
    borderRadius: '8px',
    padding: '8px',
    fontSize: '12px',
    minHeight: '70px',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  primaryButton: {
    border: 'none',
    borderRadius: '8px',
    padding: '9px 12px',
    background: '#0071e3',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    borderRadius: '8px',
    border: '1px solid #f5c2c0',
    background: '#fff1f1',
    color: '#b42318',
    fontSize: '12px',
    padding: '8px 10px',
  },
  loading: {
    color: '#6e6e73',
    fontSize: '12px',
    padding: '8px 0',
  },
  empty: {
    border: '1px dashed #d2d2d7',
    borderRadius: '10px',
    padding: '14px',
    fontSize: '12px',
    color: '#86868b',
    textAlign: 'center',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    overflowY: 'auto',
    minHeight: 0,
    paddingRight: '2px',
  },
  card: {
    border: '1px solid #e5e5e7',
    borderRadius: '10px',
    padding: '9px 10px',
    background: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  cardTitleWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minWidth: 0,
  },
  workOrderNo: {
    color: '#0071e3',
    fontSize: '11px',
    fontWeight: 700,
  },
  priorityDot: {
    width: '8px',
    height: '8px',
    borderRadius: '999px',
    flexShrink: 0,
  },
  cardTitle: {
    fontSize: '12px',
    color: '#1d1d1f',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  statusButton: {
    border: '1px solid #d2d2d7',
    borderRadius: '999px',
    background: '#f5f5f7',
    color: '#1d1d1f',
    padding: '3px 9px',
    fontSize: '11px',
    cursor: 'pointer',
    textTransform: 'none',
  },
  metaRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    color: '#6e6e73',
    fontSize: '11px',
  },
  actionRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
  },
  linkButton: {
    border: 'none',
    background: 'transparent',
    color: '#0071e3',
    fontSize: '11px',
    fontWeight: 600,
    padding: 0,
    cursor: 'pointer',
  },
  globalId: {
    color: '#6e6e73',
    fontSize: '10px',
    background: '#f5f5f7',
    borderRadius: '6px',
    padding: '2px 6px',
    maxWidth: '180px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}

export default WorkOrdersPanel
