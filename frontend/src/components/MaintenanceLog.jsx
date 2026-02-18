import React, { useEffect, useMemo, useState } from 'react'

const API_URL = 'http://localhost:8000'

const STATUS_CYCLE = ['open', 'in_progress', 'resolved', 'closed']
const CATEGORY_OPTIONS = ['inspection', 'repair', 'replacement', 'note', 'issue']
const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical']

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

function getNextStatus(status) {
  const index = STATUS_CYCLE.indexOf(status)
  if (index === -1) return 'open'
  return STATUS_CYCLE[(index + 1) % STATUS_CYCLE.length]
}

function MaintenanceLog({ jobId, globalId, elementName = '', elementType = '' }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [statusFilter, setStatusFilter] = useState('active')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [form, setForm] = useState({
    title: '',
    category: 'note',
    priority: 'medium',
    description: '',
  })

  const fetchLogs = async () => {
    if (!jobId || !globalId) {
      setLogs([])
      return
    }

    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        global_id: globalId,
        limit: '200',
        offset: '0',
      })
      const response = await fetch(`${API_URL}/api/maintenance/${jobId}?${params.toString()}`, {
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail || 'Failed to load maintenance logs')
      }
      const data = await response.json()
      setLogs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load maintenance logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
  }, [jobId, globalId])

  const openCount = useMemo(
    () => logs.filter(log => log.status === 'open' || log.status === 'in_progress').length,
    [logs]
  )

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesStatus = statusFilter === 'all'
        || (statusFilter === 'active'
          ? (log.status === 'open' || log.status === 'in_progress')
          : log.status === statusFilter)
      const matchesCategory = categoryFilter === 'all' || log.category === categoryFilter
      return matchesStatus && matchesCategory
    })
  }, [logs, statusFilter, categoryFilter])

  const onCreate = async () => {
    const title = form.title.trim()
    if (!title || !jobId || !globalId) return

    const nowIso = new Date().toISOString()
    const tempId = `temp-${Date.now()}`
    const optimisticLog = {
      id: tempId,
      job_id: jobId,
      global_id: globalId,
      element_name: elementName || '',
      element_type: elementType || '',
      category: form.category,
      title,
      description: form.description.trim(),
      priority: form.priority,
      status: 'open',
      created_at: nowIso,
      updated_at: nowIso,
    }

    setLogs(prev => [optimisticLog, ...prev])
    setShowForm(false)
    setForm({
      title: '',
      category: 'note',
      priority: 'medium',
      description: '',
    })
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/maintenance/${jobId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          global_id: globalId,
          element_name: elementName || '',
          element_type: elementType || '',
          category: form.category,
          title,
          description: form.description.trim(),
          priority: form.priority,
        }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail || 'Failed to create maintenance log')
      }

      const created = await response.json()
      setLogs(prev => prev.map(log => (log.id === tempId ? created : log)))
    } catch (err) {
      setLogs(prev => prev.filter(log => log.id !== tempId))
      setError(err.message || 'Failed to create maintenance log')
    }
  }

  const onCycleStatus = async (logItem) => {
    if (!jobId) return
    if (typeof logItem.id !== 'number') return
    const nextStatus = getNextStatus(logItem.status)

    setLogs(prev => prev.map(log => (
      log.id === logItem.id
        ? { ...log, status: nextStatus, updated_at: new Date().toISOString() }
        : log
    )))
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/maintenance/${jobId}/${logItem.id}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail || 'Failed to update status')
      }

      const updated = await response.json()
      setLogs(prev => prev.map(log => (log.id === logItem.id ? updated : log)))
    } catch (err) {
      setLogs(prev => prev.map(log => (log.id === logItem.id ? logItem : log)))
      setError(err.message || 'Failed to update status')
    }
  }

  const onDelete = async (logItem) => {
    if (!jobId) return
    const previous = logs
    setLogs(prev => prev.filter(log => log.id !== logItem.id))
    setError(null)

    if (typeof logItem.id !== 'number') {
      return
    }

    try {
      const response = await fetch(`${API_URL}/api/maintenance/${jobId}/${logItem.id}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.detail || 'Failed to delete maintenance log')
      }
    } catch (err) {
      setLogs(previous)
      setError(err.message || 'Failed to delete maintenance log')
    }
  }

  if (!globalId) return null

  return (
    <div style={styles.section}>
      <button style={styles.headerButton} onClick={() => setExpanded(prev => !prev)}>
        <div style={styles.headerLeft}>
          <span style={styles.chevron}>{expanded ? 'v' : '>'}</span>
          <h4 style={styles.title}>Maintenance Log</h4>
        </div>
        <span style={styles.badge}>{openCount} open</span>
      </button>

      {expanded && (
        <div style={styles.body}>
          <div style={styles.controls}>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={styles.select}
            >
              <option value="active">Open + In progress</option>
              <option value="all">All statuses</option>
              {STATUS_CYCLE.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              style={styles.select}
            >
              <option value="all">All categories</option>
              {CATEGORY_OPTIONS.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <button
              style={styles.actionButton}
              onClick={() => setShowForm(prev => !prev)}
              type="button"
            >
              {showForm ? 'Cancel' : 'Add Note'}
            </button>
          </div>

          {showForm && (
            <div style={styles.form}>
              <input
                type="text"
                value={form.title}
                onChange={(event) => setForm(prev => ({ ...prev, title: event.target.value }))}
                placeholder="Log title"
                style={styles.input}
                maxLength={200}
              />
              <div style={styles.formRow}>
                <select
                  value={form.category}
                  onChange={(event) => setForm(prev => ({ ...prev, category: event.target.value }))}
                  style={styles.select}
                >
                  {CATEGORY_OPTIONS.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <select
                  value={form.priority}
                  onChange={(event) => setForm(prev => ({ ...prev, priority: event.target.value }))}
                  style={styles.select}
                >
                  {PRIORITY_OPTIONS.map(priority => (
                    <option key={priority} value={priority}>{priority}</option>
                  ))}
                </select>
              </div>
              <textarea
                value={form.description}
                onChange={(event) => setForm(prev => ({ ...prev, description: event.target.value }))}
                placeholder="Description"
                style={styles.textarea}
                rows={3}
              />
              <button
                style={styles.saveButton}
                onClick={onCreate}
                type="button"
                disabled={!form.title.trim()}
              >
                Save
              </button>
            </div>
          )}

          {error && <p style={styles.error}>{error}</p>}
          {loading && <p style={styles.meta}>Loading logs...</p>}

          {!loading && filteredLogs.length === 0 && (
            <p style={styles.meta}>No maintenance logs for this element.</p>
          )}

          <div style={styles.list}>
            {filteredLogs.map(log => (
              <div key={log.id} style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <div style={styles.cardTitle}>{log.title}</div>
                    <div style={styles.meta}>
                      {log.category} - {formatRelativeTime(log.updated_at || log.created_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    style={{ ...styles.chip, ...styles[`status_${log.status}`] }}
                    onClick={() => onCycleStatus(log)}
                    title="Cycle status"
                  >
                    {log.status}
                  </button>
                </div>
                {log.description && <p style={styles.description}>{log.description}</p>}
                <div style={styles.cardFooter}>
                  <span style={{ ...styles.chip, ...styles[`priority_${log.priority}`] }}>
                    {log.priority}
                  </span>
                  <button
                    type="button"
                    style={styles.deleteButton}
                    onClick={() => onDelete(log)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  section: {
    marginBottom: '20px',
    background: '#e8e8ec',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  headerButton: {
    width: '100%',
    border: 'none',
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    cursor: 'pointer',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  chevron: {
    fontSize: '12px',
    color: '#86868b',
  },
  title: {
    margin: 0,
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
  },
  badge: {
    fontSize: '11px',
    color: '#1d1d1f',
    fontWeight: 600,
    background: 'rgba(0,0,0,0.08)',
    borderRadius: '999px',
    padding: '3px 8px',
  },
  body: {
    padding: '10px 12px 12px',
    borderTop: '1px solid rgba(0,0,0,0.05)',
    background: '#f4f4f4',
  },
  controls: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr auto',
    gap: '8px',
    marginBottom: '8px',
  },
  form: {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    padding: '8px',
    marginBottom: '8px',
    background: '#ffffff',
  },
  formRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '8px',
    marginBottom: '8px',
  },
  select: {
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '6px',
    padding: '6px',
    fontSize: '12px',
    background: '#fff',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '6px',
    padding: '6px',
    fontSize: '12px',
    marginBottom: '8px',
  },
  textarea: {
    width: '100%',
    boxSizing: 'border-box',
    border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: '6px',
    padding: '6px',
    fontSize: '12px',
    resize: 'vertical',
    marginBottom: '8px',
  },
  actionButton: {
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    padding: '6px 10px',
    cursor: 'pointer',
    background: '#1d1d1f',
    color: '#fff',
  },
  saveButton: {
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    padding: '6px 10px',
    cursor: 'pointer',
    background: '#0071e3',
    color: '#fff',
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    border: '1px solid rgba(0,0,0,0.08)',
    borderRadius: '8px',
    padding: '8px',
    background: '#fff',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
    wordBreak: 'break-word',
  },
  description: {
    margin: '8px 0',
    fontSize: '12px',
    color: '#424245',
    whiteSpace: 'pre-wrap',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    fontSize: '11px',
    borderRadius: '999px',
    padding: '3px 8px',
    border: 'none',
    cursor: 'pointer',
    textTransform: 'lowercase',
    fontWeight: 600,
  },
  deleteButton: {
    border: 'none',
    borderRadius: '6px',
    fontSize: '11px',
    padding: '4px 8px',
    cursor: 'pointer',
    background: 'rgba(255,59,48,0.12)',
    color: '#b42318',
  },
  meta: {
    margin: 0,
    fontSize: '11px',
    color: '#86868b',
  },
  error: {
    margin: '0 0 8px 0',
    fontSize: '12px',
    color: '#b42318',
  },
  status_open: {
    background: 'rgba(0,113,227,0.14)',
    color: '#005bb5',
  },
  status_in_progress: {
    background: 'rgba(255,149,0,0.16)',
    color: '#b45309',
  },
  status_resolved: {
    background: 'rgba(52,199,89,0.16)',
    color: '#166534',
  },
  status_closed: {
    background: 'rgba(107,114,128,0.2)',
    color: '#374151',
  },
  priority_low: {
    background: 'rgba(107,114,128,0.14)',
    color: '#374151',
  },
  priority_medium: {
    background: 'rgba(0,113,227,0.14)',
    color: '#005bb5',
  },
  priority_high: {
    background: 'rgba(255,149,0,0.16)',
    color: '#b45309',
  },
  priority_critical: {
    background: 'rgba(255,59,48,0.16)',
    color: '#b42318',
  },
}

export default MaintenanceLog
