import React, { useState, useRef, useEffect } from 'react'
import DraggablePanel from './DraggablePanel'

/**
 * IdsValidationPanel Component
 * 
 * Draggable panel for IDS (Information Delivery Specification) validation.
 * Allows uploading IDS files and validating the loaded IFC model against them.
 * Matches the application's "Arctic Zen" aesthetic.
 */
function IdsValidationPanel({ isOpen, onClose, jobId, focusToken, zIndex }) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [idsFiles, setIdsFiles] = useState([])
  const [defaultTemplates, setDefaultTemplates] = useState([])
  const [validationResult, setValidationResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('uploaded')
  
  // Floating panel state
  const [position, setPosition] = useState({ x: 80, y: 80 })
  const [size, setSize] = useState({ width: 420, height: 520 })
  const fileInputRef = useRef(null)

  const API_URL = 'http://localhost:8000'

  // Load IDS files when panel opens
  useEffect(() => {
    if (isOpen && jobId) {
      fetchIdsFiles()
    }
  }, [isOpen, jobId])

  useEffect(() => {
    if (isOpen) {
      fetchDefaultTemplates()
    }
  }, [isOpen])

  const fetchIdsFiles = async () => {
    if (!jobId) return
    try {
      const response = await fetch(`${API_URL}/validation/${jobId}/ids`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setIdsFiles(data.idsFiles || [])
      }
    } catch (err) {
      console.error('Error fetching IDS files:', err)
    }
  }

  const fetchDefaultTemplates = async () => {
    try {
      const response = await fetch(`${API_URL}/validation/ids/templates/default`, {
        credentials: 'include',
      })
      if (response.ok) {
        const data = await response.json()
        setDefaultTemplates(data.templates || [])
      }
    } catch (err) {
      console.error('Error fetching default IDS templates:', err)
    }
  }

  const handleUploadIdsFile = async (file) => {
    if (!file || !jobId) return
    
    if (!file.name.toLowerCase().endsWith('.ids')) {
      setError('Please upload an IDS file (.ids extension)')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/validation/${jobId}/ids/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        const errorMsg = data.detail?.message || data.detail || 'Upload failed'
        throw new Error(errorMsg)
      }

      // Refresh the list
      await fetchIdsFiles()
      
    } catch (err) {
      console.error('IDS upload error:', err)
      setError(err.message || 'Failed to upload IDS file')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      handleUploadIdsFile(file)
    }
  }

  const handleValidate = async (idsFilename = null) => {
    if (!jobId) return

    setLoading(true)
    setError(null)
    setValidationResult(null)

    try {
      let url = `${API_URL}/validation/${jobId}/ids/validate`
      if (idsFilename) {
        url += `?ids_filename=${encodeURIComponent(idsFilename)}`
      }

      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail?.message || data.detail || 'Validation failed')
      }

      setValidationResult(data)
    } catch (err) {
      console.error('Validation error:', err)
      setError(err.message || 'Validation failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteIds = async (filename) => {
    if (!jobId || !filename) return

    try {
      const response = await fetch(`${API_URL}/validation/${jobId}/ids/${encodeURIComponent(filename)}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (response.ok) {
        await fetchIdsFiles()
        // Clear validation if it was for this file
        if (validationResult?.results?.some(r => r.idsFilename === filename)) {
          setValidationResult(null)
        }
      }
    } catch (err) {
      console.error('Error deleting IDS file:', err)
    }
  }

  if (!isOpen) return null

  return (
    <DraggablePanel
      position={position}
      setPosition={setPosition}
      size={size}
      setSize={setSize}
      minWidth={340}
      minHeight={300}
      panelStyle={styles.panel}
      resizeHandleStyle={styles.resizeHandle}
      zIndex={zIndex || 1000}
      focusToken={focusToken}
    >
      {/* Header */}
      <div className="drag-handle" style={styles.header}>
        <div style={styles.headerLeft}>
          <ValidationIcon />
          <span style={styles.title}>IDS Validation</span>
        </div>
        <button style={styles.closeBtn} onClick={onClose} title="Close">
          <CloseIcon />
        </button>
      </div>

      {/* Content */}
      <div style={styles.content}>
        <div style={styles.tabContainer}>
          <button
            style={{ ...styles.tab, ...(activeTab === 'uploaded' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('uploaded')}
            type="button"
          >
            Uploaded IDS
          </button>
          <button
            style={{ ...styles.tab, ...(activeTab === 'defaults' ? styles.activeTab : {}) }}
            onClick={() => setActiveTab('defaults')}
            type="button"
          >
            Default Templates
          </button>
        </div>
        {activeTab === 'uploaded' && (
          <>
            {/* Upload Section */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>Upload IDS File</span>
          </div>
          <div style={styles.uploadArea}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ids"
              onChange={handleFileInputChange}
              style={{ display: 'none' }}
            />
            <button
              style={styles.uploadBtn}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Choose IDS File'}
            </button>
            <span style={styles.uploadHint}>
              Upload an Information Delivery Specification (.ids) file
            </span>
          </div>
        </div>

        {/* IDS Files List */}
        <div style={styles.section}>
          <div style={styles.sectionHeader}>
            <span style={styles.sectionTitle}>IDS Files ({idsFiles.length})</span>
            {idsFiles.length > 0 && (
              <button
                style={styles.validateAllBtn}
                onClick={() => handleValidate()}
                disabled={loading}
              >
                {loading ? 'Validating...' : 'Validate All'}
              </button>
            )}
          </div>
          
          {idsFiles.length === 0 ? (
            <div style={styles.emptyState}>
              No IDS files uploaded yet
            </div>
          ) : (
            <div style={styles.fileList}>
              {idsFiles.map((ids, idx) => (
                <div key={idx} style={styles.fileItem}>
                  <div style={styles.fileInfo}>
                    <span style={styles.fileName}>{ids.filename}</span>
                    {ids.title && <span style={styles.fileDesc}>{ids.title}</span>}
                    {ids.audit && (
                      <span style={{
                        ...styles.auditBadge,
                        background: ids.audit.overallPassed ? '#e8f5e9' : '#fff3e0',
                        color: ids.audit.overallPassed ? '#2e7d32' : '#ef6c00'
                      }}>
                        {ids.audit.overallPassed ? 'Valid' : 'Has warnings'}
                      </span>
                    )}
                  </div>
                  <div style={styles.fileActions}>
                    <button
                      style={styles.fileActionBtn}
                      onClick={() => handleValidate(ids.filename)}
                      disabled={loading}
                      title="Validate against this IDS"
                    >
                      ▶
                    </button>
                    <button
                      style={styles.fileActionBtn}
                      onClick={() => handleDeleteIds(ids.filename)}
                      title="Delete"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          </>
        )}

        {activeTab === 'defaults' && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Default IDS Templates ({defaultTemplates.length})</span>
            </div>
            {defaultTemplates.length === 0 ? (
              <div style={styles.emptyState}>
                No default IDS templates found
              </div>
            ) : (
              <div style={styles.fileList}>
                {defaultTemplates.map((template, idx) => (
                  <div key={idx} style={styles.fileItem}>
                    <div style={styles.fileInfo}>
                      <span style={styles.fileName}>{template.filename}</span>
                      {template.title && <span style={styles.fileDesc}>{template.title}</span>}
                      {!template.title && template.description && (
                        <span style={styles.fileDesc}>{template.description}</span>
                      )}
                    </div>
                    <div style={styles.fileActions}>
                      <button
                        style={styles.fileActionBtn}
                        onClick={() => handleValidate(template.filename)}
                        disabled={loading || !jobId}
                        title={jobId ? 'Validate against this IDS' : 'Upload a model first'}
                      >
                        ▶
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div style={styles.errorBox}>
            {error}
          </div>
        )}

        {/* Validation Results */}
        {validationResult && (
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionTitle}>Validation Results</span>
            </div>
            
            <div style={{
              ...styles.resultSummary,
              borderColor: validationResult.overallPassed ? '#4caf50' : '#f44336'
            }}>
              <div style={styles.resultStatus}>
                <span style={{
                  ...styles.statusIcon,
                  color: validationResult.overallPassed ? '#4caf50' : '#f44336'
                }}>
                  {validationResult.overallPassed ? '✓' : '✕'}
                </span>
                <span style={styles.statusText}>
                  {validationResult.overallPassed ? 'PASSED' : 'FAILED'}
                </span>
              </div>
              <div style={styles.resultStats}>
                <div style={styles.statItem}>
                  <span style={styles.statValue}>{validationResult.totalSpecs || 0}</span>
                  <span style={styles.statLabel}>Total Specs</span>
                </div>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: '#4caf50' }}>{validationResult.passedSpecs || 0}</span>
                  <span style={styles.statLabel}>Passed</span>
                </div>
                <div style={styles.statItem}>
                  <span style={{ ...styles.statValue, color: '#f44336' }}>{validationResult.failedSpecs || 0}</span>
                  <span style={styles.statLabel}>Failed</span>
                </div>
              </div>
            </div>

            {/* Detailed Results */}
            {validationResult.results?.map((result, idx) => (
              <div key={idx} style={styles.idsResultCard}>
                <div style={styles.idsResultHeader}>
                  <span style={styles.idsFileName}>{result.idsFilename || `IDS ${idx + 1}`}</span>
                  <span style={{
                    ...styles.idsResultBadge,
                    background: result.failedSpecs === 0 ? '#e8f5e9' : '#ffebee',
                    color: result.failedSpecs === 0 ? '#2e7d32' : '#c62828'
                  }}>
                    {result.failedSpecs === 0 ? 'PASS' : `${result.failedSpecs} failed`}
                  </span>
                </div>
                
                {result.specifications?.slice(0, 5).map((spec, specIdx) => (
                  <div key={specIdx} style={styles.specItem}>
                    <span style={{
                      ...styles.specStatus,
                      color: spec.status === 'pass' ? '#4caf50' : '#f44336'
                    }}>
                      {spec.status === 'pass' ? '✓' : '✕'}
                    </span>
                    <span style={styles.specName}>{spec.name || spec.description || `Spec ${specIdx + 1}`}</span>
                  </div>
                ))}
                
                {result.specifications?.length > 5 && (
                  <div style={styles.moreSpecs}>
                    +{result.specifications.length - 5} more specifications
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

    </DraggablePanel>
  )
}

// Icons
function ValidationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

const styles = {
  panel: {
    position: 'fixed',
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid #e5e5e7',
    cursor: 'grab',
    background: '#fafafa',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  title: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#1d1d1f',
  },
  closeBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    background: 'transparent',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#86868b',
    transition: 'all 0.15s ease',
  },
  content: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  tabContainer: {
    display: 'flex',
    gap: '6px',
    marginBottom: '16px',
    padding: '4px',
    background: '#f5f5f7',
    borderRadius: '8px',
  },
  tab: {
    flex: 1,
    padding: '6px 8px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: '600',
    color: '#86868b',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    background: 'transparent',
  },
  activeTab: {
    color: '#1d1d1f',
    background: '#ffffff',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
  },
  section: {
    marginBottom: '20px',
  },
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  sectionTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#86868b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  uploadArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    padding: '16px',
    border: '2px dashed #e5e5e7',
    borderRadius: '8px',
    background: '#fafafa',
  },
  uploadBtn: {
    padding: '8px 16px',
    background: '#0071e3',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.15s ease',
  },
  uploadHint: {
    fontSize: '11px',
    color: '#86868b',
    textAlign: 'center',
  },
  validateAllBtn: {
    padding: '6px 12px',
    background: '#34c759',
    color: '#fff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    cursor: 'pointer',
  },
  emptyState: {
    padding: '20px',
    textAlign: 'center',
    color: '#86868b',
    fontSize: '13px',
  },
  fileList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  fileItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    background: '#f5f5f7',
    borderRadius: '8px',
  },
  fileInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  },
  fileName: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1d1d1f',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  fileDesc: {
    fontSize: '11px',
    color: '#86868b',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  auditBadge: {
    alignSelf: 'flex-start',
    padding: '2px 6px',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: '500',
    marginTop: '4px',
  },
  fileActions: {
    display: 'flex',
    gap: '4px',
    marginLeft: '8px',
  },
  fileActionBtn: {
    width: '28px',
    height: '28px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: '#fff',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#86868b',
    transition: 'all 0.15s ease',
  },
  errorBox: {
    padding: '12px',
    background: '#ffebee',
    color: '#c62828',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '16px',
  },
  resultSummary: {
    padding: '16px',
    border: '2px solid',
    borderRadius: '8px',
    marginBottom: '16px',
  },
  resultStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  statusIcon: {
    fontSize: '24px',
    fontWeight: 'bold',
  },
  statusText: {
    fontSize: '18px',
    fontWeight: '600',
    color: '#1d1d1f',
  },
  resultStats: {
    display: 'flex',
    gap: '24px',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '600',
    color: '#1d1d1f',
  },
  statLabel: {
    fontSize: '11px',
    color: '#86868b',
    textTransform: 'uppercase',
  },
  idsResultCard: {
    padding: '12px',
    background: '#f5f5f7',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  idsResultHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  idsFileName: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#1d1d1f',
  },
  idsResultBadge: {
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
  },
  specItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  specStatus: {
    fontSize: '14px',
    fontWeight: 'bold',
  },
  specName: {
    fontSize: '12px',
    color: '#1d1d1f',
  },
  moreSpecs: {
    fontSize: '11px',
    color: '#86868b',
    fontStyle: 'italic',
    marginTop: '4px',
  },
  resizeHandle: {
    position: 'absolute',
    right: '0',
    bottom: '0',
    width: '16px',
    height: '16px',
    cursor: 'se-resize',
    background: 'linear-gradient(135deg, transparent 50%, #e5e5e7 50%)',
    borderRadius: '0 0 12px 0',
  },
}

export default IdsValidationPanel
