import React, { useCallback, useEffect, useMemo, useState } from 'react'
import DraggablePanel from './DraggablePanel'
import { apiFetch, parseJsonSafe } from '../utils/api'

const STATUS_CYCLE = ['open', 'in_progress', 'on_hold', 'resolved', 'closed']
const CATEGORY_OPTIONS = ['inspection', 'repair', 'replacement', 'preventive', 'corrective', 'note', 'issue']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']
const EXTERNAL_SYSTEM_OPTIONS = ['none', 'upkeep', 'fiix', 'maximo', 'other']
const SYNC_STATUS_OPTIONS = ['none', 'pending', 'synced', 'conflict']
const SORT_BY_OPTIONS = [
  { value: 'updated_at', label: 'Updated' },
  { value: 'created_at', label: 'Created' },
  { value: 'due_date', label: 'Due Date' },
  { value: 'priority', label: 'Priority' },
  { value: 'status', label: 'Status' },
]

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

function toDateInputValue(value) {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().slice(0, 10)
}

function fromDateInputValue(value) {
  if (!value) return null
  return new Date(`${value}T00:00:00.000Z`).toISOString()
}

function toNullableString(value) {
  if (value === null || value === undefined) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isOverdue(item) {
  if (!item?.due_date || !ACTIVE_STATUSES.has(item.status)) return false
  const dueTime = new Date(item.due_date).getTime()
  return Number.isFinite(dueTime) && dueTime < Date.now()
}

function toEditorState(item) {
  if (!item) return null
  return {
    title: item.title || '',
    description: item.description || '',
    status: item.status || 'open',
    priority: item.priority || 'medium',
    category: item.category || 'note',
    assigned_to: item.assigned_to || '',
    due_date: toDateInputValue(item.due_date),
    estimated_hours: item.estimated_hours ?? '',
    actual_hours: item.actual_hours ?? '',
    cost: item.cost ?? '',
    external_system: item.external_system || 'none',
    external_work_order_id: item.external_work_order_id || '',
    external_sync_status: item.external_sync_status || 'none',
  }
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

function WorkOrdersPanel({
  isOpen,
  onClose,
  jobId,
  selectedId,
  metadataUrl,
  onSelectWorkOrder,
  focusToken,
  zIndex,
}) {
  const [position, setPosition] = useState({ x: 820, y: 80 })
  const [size, setSize] = useState({ width: 460, height: 620 })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [rawItems, setRawItems] = useState([])
  const [summary, setSummary] = useState(null)
  const [metadataMap, setMetadataMap] = useState({})

  const [statusFilter, setStatusFilter] = useState('active')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [storeyFilter, setStoreyFilter] = useState('all')
  const [assignedFilter, setAssignedFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [selectedOnly, setSelectedOnly] = useState(false)

  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(null)
  const [editorState, setEditorState] = useState(null)
  const [savingDetails, setSavingDetails] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [statusUpdateId, setStatusUpdateId] = useState(null)

  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createPending, setCreatePending] = useState(false)
  const [createForm, setCreateForm] = useState({
    title: '',
    category: 'issue',
    priority: 'medium',
    description: '',
    assigned_to: '',
    due_date: '',
  })

  const selectedGlobalId = useMemo(() => {
    if (Array.isArray(selectedId)) return selectedId[0] || ''
    return selectedId || ''
  }, [selectedId])

  const selectedElement = useMemo(() => {
    if (!selectedGlobalId) return null
    return metadataMap[selectedGlobalId] || null
  }, [selectedGlobalId, metadataMap])

  const selectedElementStorey = useMemo(() => {
    if (!selectedElement) return ''
    return selectedElement.storey || selectedElement.level || selectedElement.buildingStorey || ''
  }, [selectedElement])

  const fetchMetadata = useCallback(async () => {
    if (!isOpen || !metadataUrl) return
    try {
      const response = await fetch(metadataUrl, { credentials: 'include' })
      if (!response.ok) return
      const payload = await response.json()
      const elements = payload?.elements || payload || {}
      if (elements && typeof elements === 'object') {
        setMetadataMap(elements)
      }
    } catch {
      // Metadata is optional for this panel.
    }
  }, [isOpen, metadataUrl])

  const fetchWorkOrders = useCallback(async () => {
    if (!isOpen || !jobId) return
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({
        limit: '250',
        offset: '0',
        sort_by: sortBy,
        sort_order: sortOrder,
      })
      if (selectedOnly && selectedGlobalId) {
        params.set('global_id', selectedGlobalId)
      }
      if (searchQuery.trim()) {
        params.set('search', searchQuery.trim())
      }

      const response = await apiFetch(`/api/work-orders/${jobId}?${params.toString()}`)
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to load work orders')
      }
      setRawItems(Array.isArray(payload) ? payload : [])

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
  }, [isOpen, jobId, sortBy, sortOrder, selectedOnly, selectedGlobalId, searchQuery])

  useEffect(() => {
    fetchMetadata()
  }, [fetchMetadata])

  useEffect(() => {
    fetchWorkOrders()
  }, [fetchWorkOrders])

  useEffect(() => {
    if (!isOpen) return
    setSelectedOnly(Boolean(selectedGlobalId))
  }, [isOpen, selectedGlobalId])

  const items = useMemo(() => {
    return rawItems.filter((item) => {
      if (statusFilter === 'active' && !ACTIVE_STATUSES.has(item.status)) return false
      if (statusFilter !== 'all' && statusFilter !== 'active' && item.status !== statusFilter) return false
      if (priorityFilter !== 'all' && item.priority !== priorityFilter) return false
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false
      if (storeyFilter !== 'all' && item.storey !== storeyFilter) return false
      if (assignedFilter !== 'all' && (item.assigned_to || '') !== assignedFilter) return false
      return true
    })
  }, [rawItems, statusFilter, priorityFilter, categoryFilter, storeyFilter, assignedFilter])

  const storeyOptions = useMemo(() => {
    const values = new Set()
    rawItems.forEach((item) => {
      if (item.storey) values.add(item.storey)
    })
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))]
  }, [rawItems])

  const assignedOptions = useMemo(() => {
    const values = new Set()
    rawItems.forEach((item) => {
      if (item.assigned_to) values.add(item.assigned_to)
    })
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))]
  }, [rawItems])

  useEffect(() => {
    if (!items.length) {
      setSelectedWorkOrderId(null)
      setEditorState(null)
      return
    }
    if (!items.some((item) => item.id === selectedWorkOrderId)) {
      setSelectedWorkOrderId(items[0].id)
    }
  }, [items, selectedWorkOrderId])

  useEffect(() => {
    if (!selectedGlobalId || !items.length) return
    const match = items.find((item) => item.global_id === selectedGlobalId)
    if (match) {
      setSelectedWorkOrderId(match.id)
    }
  }, [items, selectedGlobalId])

  const selectedWorkOrder = useMemo(
    () => items.find((item) => item.id === selectedWorkOrderId) || null,
    [items, selectedWorkOrderId]
  )

  useEffect(() => {
    setEditorState(toEditorState(selectedWorkOrder))
  }, [selectedWorkOrder])

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
          element_name: selectedElement?.name || '',
          element_type: selectedElement?.type || '',
          storey: selectedElementStorey || '',
          category: createForm.category,
          title,
          description: createForm.description.trim(),
          priority: createForm.priority,
          assigned_to: toNullableString(createForm.assigned_to),
          due_date: fromDateInputValue(createForm.due_date),
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
        assigned_to: '',
        due_date: '',
      })
      setShowCreateForm(false)
      await fetchWorkOrders()
      if (payload?.id) {
        setSelectedWorkOrderId(payload.id)
      }
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
    setRawItems((prev) => prev.map((row) => (
      row.id === item.id ? { ...row, status: nextStatus, updated_at: new Date().toISOString() } : row
    )))

    try {
      const response = await apiFetch(`/api/work-orders/${jobId}/${item.id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to update work order')
      }
      setRawItems((prev) => prev.map((row) => (row.id === item.id ? payload : row)))
      if (selectedWorkOrderId === item.id) {
        setEditorState(toEditorState(payload))
      }
      await fetchWorkOrders()
    } catch (err) {
      setRawItems((prev) => prev.map((row) => (
        row.id === item.id ? { ...row, status: previous } : row
      )))
      setError(err.message || 'Failed to update work order')
    } finally {
      setStatusUpdateId(null)
    }
  }

  const handleSaveDetails = async () => {
    if (!jobId || !selectedWorkOrder || !editorState || savingDetails) return
    const title = editorState.title.trim()
    if (!title) {
      setError('Title is required')
      return
    }

    setSavingDetails(true)
    setError(null)
    try {
      const response = await apiFetch(`/api/work-orders/${jobId}/${selectedWorkOrder.id}`, {
        method: 'PATCH',
        body: {
          title,
          description: editorState.description || '',
          status: editorState.status,
          priority: editorState.priority,
          category: editorState.category,
          assigned_to: toNullableString(editorState.assigned_to),
          due_date: fromDateInputValue(editorState.due_date),
          estimated_hours: toNullableNumber(editorState.estimated_hours),
          actual_hours: toNullableNumber(editorState.actual_hours),
          cost: toNullableNumber(editorState.cost),
          external_system: editorState.external_system === 'none' ? null : editorState.external_system,
          external_work_order_id: toNullableString(editorState.external_work_order_id),
          external_sync_status: editorState.external_sync_status === 'none' ? null : editorState.external_sync_status,
        },
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to save work order')
      }
      setRawItems((prev) => prev.map((row) => (row.id === payload.id ? payload : row)))
      setEditorState(toEditorState(payload))
      await fetchWorkOrders()
    } catch (err) {
      setError(err.message || 'Failed to save work order')
    } finally {
      setSavingDetails(false)
    }
  }

  const handleDeleteSelected = async () => {
    if (!jobId || !selectedWorkOrder || deletingId) return
    setDeletingId(selectedWorkOrder.id)
    setError(null)
    try {
      const response = await apiFetch(`/api/work-orders/${jobId}/${selectedWorkOrder.id}`, {
        method: 'DELETE',
      })
      const payload = await parseJsonSafe(response)
      if (!response.ok) {
        throw new Error(payload?.detail || 'Failed to delete work order')
      }
      const removedId = selectedWorkOrder.id
      setRawItems((prev) => prev.filter((row) => row.id !== removedId))
      setSelectedWorkOrderId(null)
      setEditorState(null)
      await fetchWorkOrders()
    } catch (err) {
      setError(err.message || 'Failed to delete work order')
    } finally {
      setDeletingId(null)
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
      minWidth={380}
      minHeight={420}
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
        <button type="button" onClick={onClose} style={styles.closeButton}>x</button>
      </div>

      <div style={styles.content}>
        <div style={styles.summaryRow}>
          <SummaryPill label="Open" value={summary?.status?.open || 0} color="#ff3b30" />
          <SummaryPill label="In Progress" value={summary?.status?.in_progress || 0} color="#ff9500" />
          <SummaryPill label="On Hold" value={summary?.status?.on_hold || 0} color="#5ac8fa" />
          <SummaryPill label="Overdue" value={summary?.overdue || 0} color="#af52de" />
        </div>

        <div style={styles.filterGrid}>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={styles.select}>
            <option value="active">Active</option>
            <option value="all">All Statuses</option>
            {STATUS_CYCLE.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
          <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} style={styles.select}>
            <option value="all">All Priorities</option>
            {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} style={styles.select}>
            <option value="all">All Categories</option>
            {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={storeyFilter} onChange={(event) => setStoreyFilter(event.target.value)} style={styles.select}>
            <option value="all">All Storeys</option>
            {storeyOptions.filter((value) => value !== 'all').map((storey) => <option key={storey} value={storey}>{storey}</option>)}
          </select>
          <select value={assignedFilter} onChange={(event) => setAssignedFilter(event.target.value)} style={styles.select}>
            <option value="all">All Assignees</option>
            {assignedOptions.filter((value) => value !== 'all').map((assignee) => <option key={assignee} value={assignee}>{assignee}</option>)}
          </select>
          <input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search title/description" style={styles.input} />
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} style={styles.select}>
            {SORT_BY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} style={styles.select}>
            <option value="desc">Descending</option>
            <option value="asc">Ascending</option>
          </select>
        </div>

        <div style={styles.controlRow}>
          <button
            type="button"
            style={{
              ...styles.secondaryButton,
              ...(selectedOnly ? styles.secondaryActive : {}),
              ...(!selectedGlobalId ? styles.secondaryDisabled : {}),
            }}
            onClick={() => selectedGlobalId && setSelectedOnly((prev) => !prev)}
          >
            Selected Element
          </button>
          <button type="button" style={styles.secondaryButton} onClick={fetchWorkOrders}>Refresh</button>
          <button type="button" style={styles.primarySmall} onClick={() => setShowCreateForm((prev) => !prev)}>
            {showCreateForm ? 'Cancel' : 'New'}
          </button>
        </div>

        {showCreateForm && (
          <div style={styles.form}>
            <div style={styles.formMeta}><strong>Selection:</strong> {selectedGlobalId || 'None selected'}</div>
            <div style={styles.formMeta}><strong>Context:</strong> {selectedElement?.name || 'Unnamed'} {selectedElement?.type ? `(${selectedElement.type})` : ''}</div>
            <input
              value={createForm.title}
              onChange={(event) => setCreateForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="Work order title"
              style={styles.input}
              disabled={!selectedGlobalId || createPending}
            />
            <div style={styles.formRow}>
              <select value={createForm.category} onChange={(event) => setCreateForm((prev) => ({ ...prev, category: event.target.value }))} style={styles.select}>
                {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
              <select value={createForm.priority} onChange={(event) => setCreateForm((prev) => ({ ...prev, priority: event.target.value }))} style={styles.select}>
                {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
              </select>
            </div>
            <div style={styles.formRow}>
              <input value={createForm.assigned_to} onChange={(event) => setCreateForm((prev) => ({ ...prev, assigned_to: event.target.value }))} placeholder="Assigned to" style={styles.input} />
              <input type="date" value={createForm.due_date} onChange={(event) => setCreateForm((prev) => ({ ...prev, due_date: event.target.value }))} style={styles.input} />
            </div>
            <textarea value={createForm.description} onChange={(event) => setCreateForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="Description" style={styles.textarea} />
            <button type="button" style={styles.primaryButton} onClick={handleCreate} disabled={!selectedGlobalId || createPending}>
              {createPending ? 'Creating...' : 'Create from Selection'}
            </button>
          </div>
        )}

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.bodyGrid}>
          <div style={styles.column}>
            {loading && <div style={styles.info}>Loading...</div>}
            {!loading && items.length === 0 && <div style={styles.info}>No work orders for current filters.</div>}
            {!loading && items.length > 0 && (
              <div style={styles.list}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      ...styles.card,
                      ...(item.id === selectedWorkOrderId ? styles.cardSelected : {}),
                      ...(isOverdue(item) ? styles.cardOverdue : {}),
                    }}
                    onClick={() => setSelectedWorkOrderId(item.id)}
                  >
                    <div style={styles.cardTop}>
                      <span style={styles.workOrderNo}>{item.work_order_no}</span>
                      <span style={{ ...styles.priorityDot, background: PRIORITY_COLORS[item.priority] || '#8e8e93' }} />
                      <strong style={styles.cardTitle}>{item.title}</strong>
                    </div>
                    <div style={styles.meta}>{item.category} | {item.element_type || 'Unknown'} | {formatRelativeTime(item.updated_at)}</div>
                    <div style={styles.row}>
                      <button
                        type="button"
                        style={styles.linkButton}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (onSelectWorkOrder && item.global_id) {
                            onSelectWorkOrder(item.global_id)
                          }
                        }}
                      >
                        Locate in model
                      </button>
                      <button
                        type="button"
                        style={styles.statusButton}
                        onClick={(event) => {
                          event.stopPropagation()
                          handleCycleStatus(item)
                        }}
                        disabled={statusUpdateId === item.id}
                      >
                        {item.status}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={styles.column}>
            {!selectedWorkOrder && <div style={styles.info}>Select a work order to edit details.</div>}
            {selectedWorkOrder && editorState && (
              <div style={styles.form}>
                <div style={styles.row}>
                  <strong>{selectedWorkOrder.work_order_no}</strong>
                  <button type="button" style={styles.deleteButton} onClick={handleDeleteSelected} disabled={deletingId === selectedWorkOrder.id}>
                    {deletingId === selectedWorkOrder.id ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
                <input value={editorState.title} onChange={(event) => setEditorState((prev) => ({ ...prev, title: event.target.value }))} style={styles.input} />
                <textarea value={editorState.description} onChange={(event) => setEditorState((prev) => ({ ...prev, description: event.target.value }))} style={styles.textarea} />
                <div style={styles.formRow}>
                  <select value={editorState.status} onChange={(event) => setEditorState((prev) => ({ ...prev, status: event.target.value }))} style={styles.select}>
                    {STATUS_CYCLE.map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                  <select value={editorState.priority} onChange={(event) => setEditorState((prev) => ({ ...prev, priority: event.target.value }))} style={styles.select}>
                    {PRIORITY_OPTIONS.map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                  </select>
                </div>
                <div style={styles.formRow}>
                  <select value={editorState.category} onChange={(event) => setEditorState((prev) => ({ ...prev, category: event.target.value }))} style={styles.select}>
                    {CATEGORY_OPTIONS.map((category) => <option key={category} value={category}>{category}</option>)}
                  </select>
                  <input value={editorState.assigned_to} onChange={(event) => setEditorState((prev) => ({ ...prev, assigned_to: event.target.value }))} placeholder="Assigned to" style={styles.input} />
                </div>
                <div style={styles.formRow}>
                  <input type="date" value={editorState.due_date} onChange={(event) => setEditorState((prev) => ({ ...prev, due_date: event.target.value }))} style={styles.input} />
                  <input type="number" min="0" step="0.25" value={editorState.estimated_hours} onChange={(event) => setEditorState((prev) => ({ ...prev, estimated_hours: event.target.value }))} placeholder="Est hours" style={styles.input} />
                </div>
                <div style={styles.formRow}>
                  <input type="number" min="0" step="0.25" value={editorState.actual_hours} onChange={(event) => setEditorState((prev) => ({ ...prev, actual_hours: event.target.value }))} placeholder="Actual hours" style={styles.input} />
                  <input type="number" min="0" step="0.01" value={editorState.cost} onChange={(event) => setEditorState((prev) => ({ ...prev, cost: event.target.value }))} placeholder="Cost" style={styles.input} />
                </div>
                <div style={styles.formRow}>
                  <select value={editorState.external_system} onChange={(event) => setEditorState((prev) => ({ ...prev, external_system: event.target.value }))} style={styles.select}>
                    {EXTERNAL_SYSTEM_OPTIONS.map((value) => <option key={value} value={value}>{value === 'none' ? 'None' : value}</option>)}
                  </select>
                  <select value={editorState.external_sync_status} onChange={(event) => setEditorState((prev) => ({ ...prev, external_sync_status: event.target.value }))} style={styles.select}>
                    {SYNC_STATUS_OPTIONS.map((value) => <option key={value} value={value}>{value === 'none' ? 'None' : value}</option>)}
                  </select>
                </div>
                <input value={editorState.external_work_order_id} onChange={(event) => setEditorState((prev) => ({ ...prev, external_work_order_id: event.target.value }))} placeholder="External ID" style={styles.input} />
                <button type="button" style={styles.primaryButton} onClick={handleSaveDetails} disabled={savingDetails}>
                  {savingDetails ? 'Saving...' : 'Save Work Order'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </DraggablePanel>
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
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px' },
  dragIcon: { color: '#b0b0b4', fontSize: '13px' },
  title: { margin: 0, fontSize: '14px', fontWeight: 600, color: '#1d1d1f' },
  badge: { padding: '3px 8px', borderRadius: '999px', background: '#eef6ff', color: '#0071e3', fontSize: '11px', fontWeight: 600 },
  closeButton: { border: 'none', background: 'transparent', color: '#86868b', cursor: 'pointer', padding: '4px' },
  content: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px', minHeight: 0, overflow: 'hidden' },
  summaryRow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' },
  summaryPill: { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #d9d9de', borderRadius: '999px', padding: '5px 8px', fontSize: '11px', color: '#1d1d1f' },
  summaryDot: { width: '8px', height: '8px', borderRadius: '999px' },
  summaryLabel: { color: '#6e6e73' },
  filterGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' },
  controlRow: { display: 'flex', gap: '8px', alignItems: 'center' },
  select: { width: '100%', border: '1px solid #d2d2d7', borderRadius: '8px', padding: '7px 8px', fontSize: '12px', background: '#fff', color: '#1d1d1f' },
  input: { width: '100%', border: '1px solid #d2d2d7', borderRadius: '8px', padding: '8px', fontSize: '12px', color: '#1d1d1f', background: '#fff' },
  formRow: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' },
  textarea: { border: '1px solid #d2d2d7', borderRadius: '8px', padding: '8px', fontSize: '12px', minHeight: '70px', resize: 'vertical', fontFamily: 'inherit' },
  secondaryButton: { border: '1px solid #d2d2d7', borderRadius: '8px', padding: '7px 10px', fontSize: '12px', color: '#1d1d1f', background: '#fff', cursor: 'pointer' },
  secondaryActive: { background: '#eef6ff', color: '#0071e3', borderColor: '#c8e2ff' },
  secondaryDisabled: { opacity: 0.55, cursor: 'not-allowed' },
  primarySmall: { marginLeft: 'auto', border: 'none', borderRadius: '8px', padding: '7px 11px', background: '#1d1d1f', color: '#fff', fontSize: '12px', cursor: 'pointer' },
  primaryButton: { border: 'none', borderRadius: '8px', padding: '9px 12px', background: '#0071e3', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: 'pointer' },
  deleteButton: { border: '1px solid #f2b8b5', background: '#fff1f1', color: '#b42318', borderRadius: '8px', fontSize: '11px', padding: '5px 8px', cursor: 'pointer' },
  error: { borderRadius: '8px', border: '1px solid #f5c2c0', background: '#fff1f1', color: '#b42318', fontSize: '12px', padding: '8px 10px' },
  bodyGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', minHeight: 0, flex: 1 },
  column: { minHeight: 0, display: 'flex', flexDirection: 'column' },
  info: { border: '1px dashed #d2d2d7', borderRadius: '10px', padding: '14px', fontSize: '12px', color: '#86868b', textAlign: 'center' },
  list: { display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: 0, paddingRight: '2px' },
  card: { border: '1px solid #e5e5e7', borderRadius: '10px', padding: '9px 10px', background: '#fff', display: 'flex', flexDirection: 'column', gap: '6px', cursor: 'pointer' },
  cardSelected: { borderColor: '#0071e3', boxShadow: '0 0 0 1px rgba(0, 113, 227, 0.18)' },
  cardOverdue: { borderColor: '#ff3b30' },
  cardTop: { display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 },
  workOrderNo: { color: '#0071e3', fontSize: '11px', fontWeight: 700 },
  priorityDot: { width: '8px', height: '8px', borderRadius: '999px', flexShrink: 0 },
  cardTitle: { fontSize: '12px', color: '#1d1d1f', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  meta: { color: '#6e6e73', fontSize: '11px' },
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' },
  linkButton: { border: 'none', background: 'transparent', color: '#0071e3', fontSize: '11px', fontWeight: 600, padding: 0, cursor: 'pointer' },
  statusButton: { border: '1px solid #d2d2d7', borderRadius: '999px', background: '#f5f5f7', color: '#1d1d1f', padding: '3px 9px', fontSize: '11px', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '8px', border: '1px solid #e5e5e7', borderRadius: '10px', padding: '10px', background: '#fff', overflowY: 'auto' },
  formMeta: { fontSize: '11px', color: '#6e6e73' },
}

export default WorkOrdersPanel
