import React, { useState, useCallback } from 'react'

/**
 * UploadPanel Component
 * 
 * Handles IFC file upload and displays processing status.
 * Shows upload dropzone when no model is loaded.
 * 
 * @param {function} onModelReady - Callback when model is processed, receives URLs object
 * @param {boolean} hasModel - Whether a model is currently loaded
 */
function UploadPanel({ onModelReady, hasModel }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState('idle') // idle, uploading, processing, error
  const [progress, setProgress] = useState('')
  const [error, setError] = useState(null)

  const API_URL = 'http://localhost:8000'

  /**
   * Poll job status until complete
   */
  const pollJobStatus = useCallback(async (jobId) => {
    const maxAttempts = 120 // 2 minutes max
    let attempts = 0

    while (attempts < maxAttempts) {
      try {
        const response = await fetch(`${API_URL}/job/${jobId}`)
        const job = await response.json()

        if (job.status === 'completed') {
          setUploadState('idle')
          onModelReady?.({
            glbUrl: `${API_URL}${job.glb_url}`,
            metadataUrl: `${API_URL}${job.metadata_url}`,
            hierarchyUrl: `${API_URL}${job.hierarchy_url}`
          })
          return
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Processing failed')
        } else {
          setProgress(`Processing... (${job.status})`)
        }
      } catch (err) {
        throw err
      }

      attempts++
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Processing timeout')
  }, [API_URL, onModelReady])

  /**
   * Upload file to backend
   */
  const uploadFile = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.ifc')) {
      setError('Please upload an IFC file')
      return
    }

    setUploadState('uploading')
    setError(null)
    setProgress('Uploading...')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch(`${API_URL}/upload`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Upload failed')
      }

      const job = await response.json()
      setUploadState('processing')
      setProgress(`Processing ${file.name}...`)

      // Poll for completion
      await pollJobStatus(job.job_id)

    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Upload failed')
      setUploadState('error')
    }
  }, [API_URL, pollJobStatus])

  /**
   * Handle file drop
   */
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }, [uploadFile])

  /**
   * Handle file input change
   */
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (file) {
      uploadFile(file)
    }
  }, [uploadFile])

  /**
   * Handle drag events
   */
  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragging(false)
  }

  /**
   * Reset to upload new model
   */
  const handleReset = () => {
    setUploadState('idle')
    setError(null)
    setProgress('')
  }

  // If model is loaded, show minimal UI
  if (hasModel) {
    return (
      <div style={styles.miniPanel}>
        <button style={styles.newModelBtn} onClick={handleReset}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Load New Model
        </button>
      </div>
    )
  }

  return (
    <div style={styles.overlay}>
      {/* Header */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>◈</span>
          <span style={styles.logoText}>DIGITAL TWIN</span>
        </div>
        <nav style={styles.nav}>
          <a href="#" style={styles.navLinkActive}>Overview</a>
          <a href="#" style={styles.navLink}>Details</a>
          <a href="#" style={styles.navLink}>Reports</a>
          <a href="#" style={styles.navLink}>Contact</a>
        </nav>
        <div style={styles.headerRight}>
          <a href="#" style={styles.loginLink}>Log in</a>
          <button style={styles.signUpBtn}>Sign up</button>
        </div>
      </header>

      {/* Main Content */}
      <div style={styles.mainContent}>
        {/* Left side - Text */}
        <div style={styles.leftContent}>
          <h1 style={styles.title}>BUILDING<br/>INSIGHTS</h1>
          <p style={styles.subtitle}>
            Upload your IFC building model to explore<br/>
            detailed 3D visualization and metadata.
          </p>
          <button style={styles.learnMoreBtn}>
            Learn more
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginLeft: '8px'}}>
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
        </div>

        {/* Center - 3D Building Illustration */}
        <div style={styles.centerContent}>
          <div style={styles.buildingIllustration}>
            <svg viewBox="0 0 200 200" style={styles.buildingSvg}>
              {/* Simple isometric building */}
              <g transform="translate(100, 160)">
                {/* Base */}
                <polygon points="0,-120 60,-90 60,-30 0,-60 -60,-30 -60,-90" fill="#e8e8ed" stroke="#c7c7cc" strokeWidth="1"/>
                {/* Left face */}
                <polygon points="-60,-90 0,-60 0,0 -60,-30" fill="#f5f5f7" stroke="#c7c7cc" strokeWidth="1"/>
                {/* Right face */}
                <polygon points="0,-60 60,-90 60,-30 0,0" fill="#ffffff" stroke="#c7c7cc" strokeWidth="1"/>
                {/* Windows left */}
                <rect x="-45" y="-75" width="12" height="15" fill="#d1d1d6" transform="skewY(-30)"/>
                <rect x="-25" y="-75" width="12" height="15" fill="#d1d1d6" transform="skewY(-30)"/>
                <rect x="-45" y="-50" width="12" height="15" fill="#d1d1d6" transform="skewY(-30)"/>
                <rect x="-25" y="-50" width="12" height="15" fill="#d1d1d6" transform="skewY(-30)"/>
                {/* Windows right */}
                <rect x="15" y="-82" width="12" height="15" fill="#d1d1d6" transform="skewY(30)"/>
                <rect x="35" y="-82" width="12" height="15" fill="#d1d1d6" transform="skewY(30)"/>
                <rect x="15" y="-57" width="12" height="15" fill="#d1d1d6" transform="skewY(30)"/>
                <rect x="35" y="-57" width="12" height="15" fill="#d1d1d6" transform="skewY(30)"/>
              </g>
            </svg>
          </div>
        </div>

        {/* Right side - Upload Panel */}
        <div style={styles.rightContent}>
          <div style={styles.uploadCard}>
            {uploadState === 'idle' && (
              <>
                <div style={styles.cardHeader}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1d1d1f" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span style={styles.cardTitle}>Upload Model</span>
                </div>
                
                <div
                  style={{
                    ...styles.dropzone,
                    ...(isDragging ? styles.dropzoneActive : {})
                  }}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <div style={styles.dropIcon}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <p style={styles.dropText}>
                    Drag & drop your <strong>.ifc</strong> file
                  </p>
                  <span style={styles.dropOr}>or</span>
                  <label style={styles.browseBtn}>
                    Browse Files
                    <input
                      type="file"
                      accept=".ifc"
                      onChange={handleFileChange}
                      style={styles.fileInput}
                    />
                  </label>
                </div>

                <div style={styles.cardFooter}>
                  <p style={styles.supportText}>Supports IFC 2x3 and IFC 4</p>
                </div>
              </>
            )}

            {(uploadState === 'uploading' || uploadState === 'processing') && (
              <div style={styles.processing}>
                <div style={styles.spinner}></div>
                <p style={styles.progressText}>{progress}</p>
                <p style={styles.hint}>
                  {uploadState === 'processing' && 'Converting geometry and extracting metadata...'}
                </p>
              </div>
            )}

            {uploadState === 'error' && (
              <div style={styles.errorBox}>
                <div style={styles.errorIcon}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <p style={styles.errorText}>{error}</p>
                <button style={styles.retryBtn} onClick={handleReset}>
                  Try Again
                </button>
              </div>
            )}
          </div>

          {/* Stats Card */}
          <div style={styles.statsCard}>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Server Status</span>
              <div style={styles.statValue}>
                <span style={styles.statusDot}></span>
                Active
              </div>
            </div>
            <div style={styles.statItem}>
              <span style={styles.statLabel}>Port</span>
              <span style={styles.statValue}>8000</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Styles
 */
const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#f5f5f7',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    height: '60px',
    background: '#ffffff',
    borderBottom: '1px solid #e5e5e7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  logoIcon: {
    fontSize: '20px',
    color: '#1d1d1f',
  },
  logoText: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '1.5px',
    color: '#1d1d1f',
  },
  nav: {
    display: 'flex',
    gap: '32px',
  },
  navLink: {
    fontSize: '14px',
    color: '#86868b',
    textDecoration: 'none',
    fontWeight: 500,
    transition: 'color 0.2s',
  },
  navLinkActive: {
    fontSize: '14px',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontWeight: 500,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  loginLink: {
    fontSize: '14px',
    color: '#1d1d1f',
    textDecoration: 'none',
    fontWeight: 500,
  },
  signUpBtn: {
    padding: '8px 16px',
    background: '#1d1d1f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '40px 60px',
    gap: '40px',
  },
  leftContent: {
    flex: '0 0 auto',
    maxWidth: '400px',
  },
  title: {
    fontSize: '56px',
    fontWeight: 700,
    lineHeight: 1.1,
    color: '#1d1d1f',
    margin: '0 0 20px 0',
    letterSpacing: '-1px',
  },
  subtitle: {
    fontSize: '16px',
    color: '#86868b',
    lineHeight: 1.6,
    margin: '0 0 32px 0',
  },
  learnMoreBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '12px 20px',
    background: '#1d1d1f',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  centerContent: {
    flex: '1 1 auto',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buildingIllustration: {
    width: '300px',
    height: '300px',
  },
  buildingSvg: {
    width: '100%',
    height: '100%',
  },
  rightContent: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    width: '320px',
  },
  uploadCard: {
    background: '#ffffff',
    borderRadius: '16px',
    padding: '24px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 24px rgba(0, 0, 0, 0.04)',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  dropzone: {
    border: '2px dashed #d1d1d6',
    borderRadius: '12px',
    padding: '32px 20px',
    textAlign: 'center',
    transition: 'all 0.2s ease',
    background: '#fafafa',
    cursor: 'pointer',
  },
  dropzoneActive: {
    borderColor: '#1d1d1f',
    background: '#f0f0f2',
  },
  dropIcon: {
    marginBottom: '12px',
  },
  dropText: {
    margin: '0 0 8px 0',
    color: '#1d1d1f',
    fontSize: '14px',
  },
  dropOr: {
    display: 'block',
    margin: '12px 0',
    color: '#86868b',
    fontSize: '12px',
  },
  browseBtn: {
    display: 'inline-block',
    padding: '10px 20px',
    background: '#1d1d1f',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  fileInput: {
    display: 'none',
  },
  cardFooter: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #f0f0f2',
  },
  supportText: {
    margin: 0,
    fontSize: '12px',
    color: '#86868b',
    textAlign: 'center',
  },
  processing: {
    padding: '40px 20px',
    textAlign: 'center',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #f0f0f2',
    borderTopColor: '#1d1d1f',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'spin 1s linear infinite',
  },
  progressText: {
    margin: '0 0 8px 0',
    color: '#1d1d1f',
    fontSize: '14px',
    fontWeight: 500,
  },
  hint: {
    margin: 0,
    color: '#86868b',
    fontSize: '13px',
  },
  errorBox: {
    padding: '32px 20px',
    textAlign: 'center',
  },
  errorIcon: {
    marginBottom: '12px',
  },
  errorText: {
    margin: '0 0 16px 0',
    color: '#ff3b30',
    fontSize: '14px',
  },
  retryBtn: {
    padding: '10px 20px',
    background: '#f5f5f7',
    border: '1px solid #d1d1d6',
    borderRadius: '8px',
    color: '#1d1d1f',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
  },
  statsCard: {
    background: '#ffffff',
    borderRadius: '12px',
    padding: '16px 20px',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)',
  },
  statItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 0',
  },
  statLabel: {
    fontSize: '13px',
    color: '#86868b',
  },
  statValue: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#1d1d1f',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#34c759',
  },
  miniPanel: {
    position: 'absolute',
    bottom: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
  },
  newModelBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#ffffff',
    border: '1px solid #e5e5e7',
    borderRadius: '8px',
    color: '#1d1d1f',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
  },
}

export default UploadPanel
