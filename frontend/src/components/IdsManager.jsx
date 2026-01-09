import React, { useState, useEffect, useRef } from 'react'

/**
 * IDS Manager Component - Upload and manage IDS validation templates
 * 
 * Allows users to:
 * - View default IDS templates
 * - Upload custom IDS files for the current job
 * - Delete uploaded IDS files
 * - See specification previews
 * 
 * Arctic Zen minimalist design.
 */

const API_URL = 'http://localhost:8000'

function IdsManager({ jobId, onIdsChange }) {
  const [defaultTemplates, setDefaultTemplates] = useState([])
  const [jobTemplates, setJobTemplates] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const [expandedTemplate, setExpandedTemplate] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // Fetch templates on mount and when jobId changes
  useEffect(() => {
    if (!jobId) return
    fetchTemplates()
  }, [jobId])

  const fetchTemplates = async () => {
    setLoading(true)
    setError(null)
    try {
      // Fetch default templates
      const defaultRes = await fetch(`${API_URL}/validation/ids/templates/default`)
      if (defaultRes.ok) {
        const defaultData = await defaultRes.json()
        setDefaultTemplates(defaultData.templates || [])
      }

      // Fetch job-specific templates
      const jobRes = await fetch(`${API_URL}/validation/${jobId}/ids`)
      if (jobRes.ok) {
        const jobData = await jobRes.json()
        setJobTemplates(jobData.idsFiles || [])
      }
    } catch (err) {
      setError('Failed to load IDS templates')
      console.error('IDS fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return

    const file = files[0]
    if (!file.name.toLowerCase().endsWith('.ids')) {
      setError('Please select an .ids file')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/validation/${jobId}/ids/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.detail || 'Upload failed')
      }

      const result = await response.json()
      
      // Refresh templates list
      await fetchTemplates()
      
      // Notify parent that IDS files changed (triggers revalidation)
      if (onIdsChange) {
        onIdsChange(result)
      }
    } catch (err) {
      setError(err.message || 'Failed to upload IDS file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDelete = async (filename) => {
    if (!confirm(`Delete IDS file "${filename}"?`)) return

    try {
      const response = await fetch(`${API_URL}/validation/${jobId}/ids/${filename}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        throw new Error('Delete failed')
      }

      // Refresh templates list
      await fetchTemplates()
      
      // Notify parent
      if (onIdsChange) {
        onIdsChange({ deleted: filename })
      }
    } catch (err) {
      setError('Failed to delete IDS file')
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const files = e.dataTransfer.files
    handleFileSelect(files)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setDragOver(true)
  }

  const handleDragLeave = () => {
    setDragOver(false)
  }

  const toggleTemplate = (id) => {
    setExpandedTemplate(current => current === id ? null : id)
  }

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>
          <div style={styles.spinner} />
          <span>Loading IDS templates...</span>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerText}>
          <h3 style={styles.title}>IDS Templates</h3>
          <p style={styles.subtitle}>
            Information Delivery Specifications for validation
          </p>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div style={styles.errorBox}>
          <span>{error}</span>
          <button style={styles.dismissBtn} onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Upload zone */}
      <div
        style={{
          ...styles.uploadZone,
          ...(dragOver ? styles.uploadZoneDragOver : {}),
          ...(uploading ? styles.uploadZoneUploading : {}),
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".ids"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(e.target.files)}
        />
        {uploading ? (
          <>
            <div style={styles.spinner} />
            <span style={styles.uploadText}>Uploading...</span>
          </>
        ) : (
          <>
            <span style={styles.uploadText}>
              Drop .ids file here or click to browse
            </span>
          </>
        )}
      </div>

      {/* Job-specific templates */}
      {jobTemplates.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>UPLOADED FOR THIS MODEL</span>
            <span style={styles.badge}>{jobTemplates.length}</span>
          </div>
          <div style={styles.templateList}>
            {jobTemplates.map((template, idx) => (
              <TemplateCard
                key={`job-${idx}`}
                template={template}
                isExpanded={expandedTemplate === `job-${idx}`}
                onToggle={() => toggleTemplate(`job-${idx}`)}
                onDelete={() => handleDelete(template.filename)}
                canDelete={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Default templates */}
      {defaultTemplates.length > 0 && (
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionLabel}>DEFAULT TEMPLATES</span>
            <span style={styles.badge}>{defaultTemplates.length}</span>
          </div>
          <div style={styles.templateList}>
            {defaultTemplates.map((template, idx) => (
              <TemplateCard
                key={`default-${idx}`}
                template={template}
                isExpanded={expandedTemplate === `default-${idx}`}
                onToggle={() => toggleTemplate(`default-${idx}`)}
                canDelete={false}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {defaultTemplates.length === 0 && jobTemplates.length === 0 && (
        <div style={styles.emptyState}>
          <span style={styles.emptyText}>No IDS templates available</span>
          <span style={styles.emptyHint}>
            Upload an .ids file to add custom validation rules
          </span>
        </div>
      )}

      {/* Info box */}
      <div style={styles.infoBox}>
        <span style={styles.infoText}>
          IDS (Information Delivery Specification) files define requirements 
          for IFC models. Uploaded templates are validated against your model 
          automatically when you revalidate.
        </span>
      </div>
    </div>
  )
}

/**
 * Individual template card component
 */
function TemplateCard({ template, isExpanded, onToggle, onDelete, canDelete }) {
  return (
    <div style={styles.templateCard}>
      <button style={styles.templateHeader} onClick={onToggle}>
        <div style={styles.templateHeaderLeft}>
          <div style={styles.templateInfo}>
            <span style={styles.templateTitle}>{template.title || template.filename}</span>
            <span style={styles.templateFilename}>{template.filename}</span>
          </div>
        </div>
        <div style={styles.templateHeaderRight}>
          <span style={styles.specCount}>
            {template.specificationCount} spec{template.specificationCount !== 1 ? 's' : ''}
          </span>
          {canDelete && (
            <button
              style={styles.deleteBtn}
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Delete template"
            >
              Delete
            </button>
          )}
          <span style={{
            ...styles.expandIcon,
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'
          }}>
            v
          </span>
        </div>
      </button>

      {isExpanded && (
        <div style={styles.templateDetails}>
          {template.description && (
            <p style={styles.templateDesc}>{template.description}</p>
          )}
          
          <div style={styles.metaRow}>
            {template.version && (
              <span style={styles.metaItem}>v{template.version}</span>
            )}
            {template.author && (
              <span style={styles.metaItem}>by {template.author}</span>
            )}
          </div>

          {template.specifications?.length > 0 && (
            <div style={styles.specList}>
              <span style={styles.specListLabel}>Specifications:</span>
              {template.specifications.map((spec, idx) => (
                <div key={idx} style={styles.specItem}>
                  <span style={styles.specName}>{spec.name}</span>
                  <span style={styles.specOptional}>
                    {spec.minOccurs === 0 ? 'Optional' : 'Required'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const monoFont = "inherit"

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    padding: '16px',
    background: '#fafafa',
    borderRadius: '12px',
    fontFamily: monoFont,
  },

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
  },

  headerIcon: {
    fontSize: '24px',
    lineHeight: 1,
  },

  headerText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },

  title: {
    margin: 0,
    fontSize: '16px',
    fontWeight: 600,
    color: '#1a1a1a',
    fontFamily: monoFont,
  },

  subtitle: {
    margin: 0,
    fontSize: '12px',
    color: '#4b5563',
    fontFamily: monoFont,
  },

  errorBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#ef4444',
    fontFamily: monoFont,
  },

  errorIcon: {
    flexShrink: 0,
  },

  dismissBtn: {
    marginLeft: 'auto',
    background: 'none',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '11px',
    lineHeight: 1,
    padding: '2px 6px',
  },

  uploadZone: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px',
    border: '2px dashed rgba(0, 0, 0, 0.15)',
    borderRadius: '10px',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },

  uploadZoneDragOver: {
    borderColor: '#6366f1',
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
  },

  uploadZoneUploading: {
    opacity: 0.7,
    cursor: 'wait',
  },

  uploadIcon: {
    fontSize: '20px',
    color: '#9ca3af',
  },

  uploadText: {
    fontSize: '12px',
    color: '#4b5563',
    textAlign: 'center',
    fontFamily: monoFont,
  },

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },

  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#6b7280',
    fontFamily: monoFont,
  },

  badge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 6px',
    borderRadius: '10px',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    color: '#6366f1',
    fontFamily: monoFont,
  },

  templateList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },

  templateCard: {
    backgroundColor: '#ffffff',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  },

  templateHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 12px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },

  templateHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },

  templateIcon: {
    fontSize: '14px',
  },

  templateInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },

  templateTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1a1a1a',
    fontFamily: monoFont,
  },

  templateFilename: {
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: monoFont,
  },

  templateHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  specCount: {
    fontSize: '11px',
    color: '#4b5563',
    fontFamily: monoFont,
  },

  deleteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'auto',
    minWidth: '20px',
    height: '20px',
    padding: '0 6px',
    background: 'rgba(239, 68, 68, 0.08)',
    border: 'none',
    borderRadius: '4px',
    color: '#ef4444',
    cursor: 'pointer',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: 1,
    transition: 'background 0.15s',
  },

  expandIcon: {
    fontSize: '10px',
    color: '#9ca3af',
    transition: 'transform 0.15s ease',
  },

  templateDetails: {
    padding: '0 12px 12px 36px',
    borderTop: '1px solid rgba(0, 0, 0, 0.04)',
  },

  templateDesc: {
    margin: '10px 0 0 0',
    fontSize: '12px',
    color: '#4b5563',
    lineHeight: 1.5,
    fontFamily: monoFont,
  },

  metaRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },

  metaItem: {
    fontSize: '11px',
    color: '#6b7280',
    fontFamily: monoFont,
  },

  specList: {
    marginTop: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },

  specListLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#4b5563',
    marginBottom: '4px',
    fontFamily: monoFont,
  },

  specItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 8px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    borderRadius: '4px',
  },

  specName: {
    fontSize: '11px',
    color: '#111827',
    fontFamily: monoFont,
  },

  specOptional: {
    fontSize: '10px',
    color: '#6b7280',
    fontFamily: monoFont,
  },

  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '24px',
    color: '#9ca3af',
  },

  emptyIcon: {
    fontSize: '24px',
    opacity: 0.5,
  },

  emptyText: {
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: monoFont,
  },

  emptyHint: {
    fontSize: '11px',
    fontFamily: monoFont,
  },

  infoBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '10px 12px',
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#4b5563',
    lineHeight: 1.5,
  },

  infoIcon: {
    flexShrink: 0,
  },

  infoText: {
    fontFamily: monoFont,
  },

  loadingState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '32px',
    color: '#9ca3af',
    fontSize: '12px',
    fontFamily: monoFont,
  },

  spinner: {
    width: '20px',
    height: '20px',
    border: '2px solid rgba(99, 102, 241, 0.2)',
    borderTopColor: '#6366f1',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
}

// Inject keyframes for spinner
if (typeof document !== 'undefined') {
  const styleId = 'ids-manager-keyframes'
  if (!document.getElementById(styleId)) {
    const styleEl = document.createElement('style')
    styleEl.id = styleId
    styleEl.textContent = `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `
    document.head.appendChild(styleEl)
  }
}

export default IdsManager
