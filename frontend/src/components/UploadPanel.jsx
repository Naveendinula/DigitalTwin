import React, { useState, useCallback } from 'react'

const STAGE_LABELS = {
  queued: 'Queued for processing...',
  converting_glb: 'Converting geometry to GLB...',
  extracting_metadata: 'Extracting metadata...',
  extracting_hierarchy: 'Building spatial hierarchy...',
  finalizing: 'Finalizing outputs...',
  completed: 'Finalizing outputs...'
}

const STAGE_HINTS = {
  queued: 'Waiting for a worker to start...',
  converting_glb: 'Generating viewable geometry from the IFC file.',
  extracting_metadata: 'Reading BIM properties and attributes.',
  extracting_hierarchy: 'Building the navigation tree.',
  finalizing: 'Writing output files to disk.'
}

const normalizeStage = (stage, status) => {
  if (stage) return stage
  if (status === 'pending') return 'queued'
  return null
}

const getStageLabel = (stage, status) => {
  if (stage && STAGE_LABELS[stage]) return STAGE_LABELS[stage]
  return `Processing... (${status})`
}

/**
 * UploadPanel Component - Arctic Zen Minimalist Design
 * 
 * Handles IFC file upload and displays processing status.
 * Features a clean, minimal hero with the arctic pavilion image.
 * 
 * @param {function} onModelReady - Callback when model is processed, receives URLs object
 * @param {boolean} hasModel - Whether a model is currently loaded
 * @param {function} onReset - Callback to reset the model state in parent
 */
function UploadPanel({ onModelReady, hasModel, onReset }) {
  const [isDragging, setIsDragging] = useState(false)
  const [uploadState, setUploadState] = useState('idle') // idle, uploading, processing, error
  const [progress, setProgress] = useState('')
  const [jobStage, setJobStage] = useState(null)
  const [error, setError] = useState(null)

  const API_URL = 'http://localhost:8000'

  /**
   * Poll job status until complete
   */
  const pollJobStatus = useCallback(async (jobId) => {
    const maxDurationMs = 30 * 60 * 1000 // 30 minutes max
    const startTime = Date.now()

    while (Date.now() - startTime < maxDurationMs) {
      try {
        const response = await fetch(`${API_URL}/job/${jobId}`)
        const job = await response.json()

        if (job.status === 'completed') {
          setUploadState('idle')
          onModelReady?.({
            glbUrl: `${API_URL}${job.glb_url}`,
            metadataUrl: `${API_URL}${job.metadata_url}`,
            hierarchyUrl: `${API_URL}${job.hierarchy_url}`,
            jobId: jobId,
            filename: job.ifc_filename,
            ifcSchema: job.ifc_schema
          })
          return
        } else if (job.status === 'failed') {
          throw new Error(job.error || 'Processing failed')
        } else {
          const normalizedStage = normalizeStage(job.stage, job.status)
          setJobStage(normalizedStage)
          setProgress(getStageLabel(normalizedStage, job.status))
        }
      } catch (err) {
        throw err
      }

      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    throw new Error('Processing timeout after 30 minutes')
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
    setJobStage(null)

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
      setJobStage('queued')

      // Poll for completion
      await pollJobStatus(job.job_id)

    } catch (err) {
      console.error('Upload error:', err)
      setError(err.message || 'Upload failed')
      setUploadState('error')
      setJobStage(null)
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
    setJobStage(null)
    if (onReset) onReset()
  }

  // If model is loaded, show minimal floating button
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
    <div style={styles.page}>
      {/* Minimal Navbar */}
      <header style={styles.navbar}>
        <div style={styles.navContent}>
          {/* Logo */}
          <div style={styles.logo}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#111827" strokeWidth="2">
              <polygon points="12 2 22 8.5 22 15.5 12 22 2 15.5 2 8.5 12 2" />
              <line x1="12" y1="22" x2="12" y2="15.5" />
              <polyline points="22 8.5 12 15.5 2 8.5" />
            </svg>
            <span style={styles.logoText}>Digital Twin</span>
          </div>

          {/* Nav Links */}
          <nav style={styles.navLinks}>
            <a href="#" style={styles.navLink}>Overview</a>
            <span style={styles.navDot}>·</span>
            <a href="#" style={styles.navLink}>Details</a>
            <span style={styles.navDot}>·</span>
            <a href="#" style={styles.navLink}>Reports</a>
            <span style={styles.navDot}>·</span>
            <a href="#" style={styles.navLink}>Contact</a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <main style={styles.hero}>
        <div style={styles.heroContainer}>
          {/* Left Column - Text */}
          <div style={styles.textColumn}>
            <span style={styles.eyebrow}>IFC Viewer</span>
            <h1 style={styles.heading}>Building Insights</h1>
            <p style={styles.subheading}>
              Upload your IFC model to explore detailed 3D visualization, 
              metadata inspection, and spatial hierarchy navigation.
            </p>
            <a href="#how" style={styles.howItWorks}>How it works →</a>
          </div>

          {/* Right Column - Image + Upload Card */}
          <div style={styles.visualColumn}>
            {/* Hero Image with glow effect */}
            <div style={styles.imageWrapper}>
              <div style={styles.imageGlow}></div>
              <img 
                src="/src/assets/images/landing_page.png" 
                alt="Minimal arctic pavilion visualization"
                style={styles.heroImage}
              />
            </div>

            {/* Upload Card - Floating over image */}
            <div style={styles.uploadCard}>
              {uploadState === 'idle' && (
                <>
                  <h3 style={styles.cardTitle}>Upload IFC Model</h3>
                  
                  <div
                    style={{
                      ...styles.dropzone,
                      ...(isDragging ? styles.dropzoneActive : {})
                    }}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="1.5" style={styles.dropIcon}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <p style={styles.dropText}>
                      Drag & drop your <strong>.ifc</strong> file or
                    </p>
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
                    <span style={styles.supportText}>Supports IFC 2x3 and IFC 4</span>
                    <div style={styles.statusPill}>
                      <span style={styles.statusDot}></span>
                      Active
                    </div>
                  </div>
                </>
              )}

              {(uploadState === 'uploading' || uploadState === 'processing') && (
                <div style={styles.processing}>
                  <div style={styles.spinner}></div>
                  <p style={styles.progressText}>{progress}</p>
                  {uploadState === 'processing' && (
                    <p style={styles.hint}>
                      {jobStage && STAGE_HINTS[jobStage]
                        ? STAGE_HINTS[jobStage]
                        : 'Processing can take several minutes for large models.'}
                    </p>
                  )}
                </div>
              )}

              {uploadState === 'error' && (
                <div style={styles.errorBox}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" style={styles.errorIcon}>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  <p style={styles.errorText}>{error}</p>
                  <button style={styles.retryBtn} onClick={handleReset}>
                    Try Again
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

/**
 * Arctic Zen Minimalist Styles
 */
const styles = {
  // Page Container
  page: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#F7F8FB',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    overflowY: 'auto',
  },

  // Navbar
  navbar: {
    position: 'sticky',
    top: 0,
    background: '#FFFFFF',
    borderBottom: '1px solid #E5E7EB',
    zIndex: 100,
  },
  navContent: {
    maxWidth: '1280px',
    margin: '0 auto',
    padding: '0 32px',
    height: '64px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  logoText: {
    fontSize: '16px',
    fontWeight: 400,
    color: '#111827',
    letterSpacing: '-0.01em',
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  navLink: {
    fontSize: '14px',
    color: '#6B7280',
    textDecoration: 'none',
    fontWeight: 400,
    padding: '8px 12px',
    borderRadius: '6px',
    transition: 'color 0.15s ease',
  },
  navDot: {
    color: '#D1D5DB',
    fontSize: '14px',
  },

  // Hero Section
  hero: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '60px 32px',
  },
  heroContainer: {
    maxWidth: '1200px',
    width: '100%',
    display: 'grid',
    gridTemplateColumns: '45% 55%',
    gap: '60px',
    alignItems: 'center',
  },

  // Text Column
  textColumn: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  eyebrow: {
    fontSize: '13px',
    fontWeight: 500,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  heading: {
    fontSize: '48px',
    fontWeight: 600,
    color: '#111827',
    margin: 0,
    lineHeight: 1.1,
    letterSpacing: '-0.02em',
  },
  subheading: {
    fontSize: '17px',
    color: '#6B7280',
    margin: '8px 0 0 0',
    lineHeight: 1.6,
    maxWidth: '400px',
  },
  howItWorks: {
    fontSize: '14px',
    color: '#9CA3AF',
    textDecoration: 'none',
    marginTop: '8px',
    transition: 'color 0.15s ease',
  },

  // Visual Column
  visualColumn: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },

  // Hero Image
  imageWrapper: {
    position: 'relative',
    width: '100%',
    maxWidth: '560px',
  },
  imageGlow: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80%',
    height: '80%',
    background: 'radial-gradient(ellipse at center, rgba(200, 210, 230, 0.4) 0%, transparent 70%)',
    filter: 'blur(40px)',
    zIndex: 0,
  },
  heroImage: {
    position: 'relative',
    width: '100%',
    height: 'auto',
    borderRadius: '16px',
    boxShadow: '0 25px 80px -20px rgba(0, 0, 0, 0.12), 0 10px 40px -15px rgba(0, 0, 0, 0.08)',
    zIndex: 1,
  },

  // Upload Card
  uploadCard: {
    position: 'relative',
    marginTop: '-40px',
    marginRight: '-20px',
    alignSelf: 'flex-end',
    width: '320px',
    background: '#FFFFFF',
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid #E5E7EB',
    boxShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.1), 0 4px 20px -5px rgba(0, 0, 0, 0.05)',
    zIndex: 2,
  },
  cardTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#111827',
    margin: '0 0 16px 0',
  },

  // Dropzone
  dropzone: {
    border: '2px dashed #E5E7EB',
    borderRadius: '12px',
    padding: '24px 16px',
    textAlign: 'center',
    transition: 'all 0.2s ease',
    background: '#FAFAFA',
    cursor: 'pointer',
  },
  dropzoneActive: {
    borderColor: '#111827',
    background: '#F3F4F6',
  },
  dropIcon: {
    marginBottom: '8px',
  },
  dropText: {
    margin: '0 0 12px 0',
    color: '#6B7280',
    fontSize: '14px',
  },
  browseBtn: {
    display: 'inline-block',
    padding: '10px 20px',
    background: '#111827',
    color: '#FFFFFF',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    boxShadow: '0 2px 8px rgba(17, 24, 39, 0.15)',
    transition: 'all 0.15s ease',
  },
  fileInput: {
    display: 'none',
  },

  // Card Footer
  cardFooter: {
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #F3F4F6',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  supportText: {
    fontSize: '12px',
    color: '#9CA3AF',
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 10px',
    background: '#F0FDF4',
    borderRadius: '100px',
    fontSize: '12px',
    fontWeight: 500,
    color: '#166534',
  },
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: '#22C55E',
  },

  // Processing State
  processing: {
    padding: '40px 16px',
    textAlign: 'center',
  },
  spinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #F3F4F6',
    borderTopColor: '#111827',
    borderRadius: '50%',
    margin: '0 auto 16px',
    animation: 'spin 1s linear infinite',
  },
  progressText: {
    margin: '0 0 4px 0',
    color: '#111827',
    fontSize: '14px',
    fontWeight: 500,
  },
  hint: {
    margin: 0,
    color: '#9CA3AF',
    fontSize: '13px',
  },

  // Error State
  errorBox: {
    padding: '32px 16px',
    textAlign: 'center',
  },
  errorIcon: {
    marginBottom: '12px',
  },
  errorText: {
    margin: '0 0 16px 0',
    color: '#EF4444',
    fontSize: '14px',
  },
  retryBtn: {
    padding: '10px 20px',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    transition: 'all 0.15s ease',
  },

  // Mini Panel (when model is loaded)
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
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: '8px',
    color: '#111827',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.15s ease',
  },
}

// Add CSS animations and hover effects
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    /* Hover effects for nav links */
    nav a:hover {
      color: #111827 !important;
    }
    
    /* Hover for "How it works" link */
    a[href="#how"]:hover {
      color: #6B7280 !important;
    }
    
    /* Browse button hover */
    label[style*="Browse"]:hover {
      background: #1F2937 !important;
    }
    
    /* Retry button hover */
    button:hover {
      background: #F9FAFB !important;
    }
    
    /* New model button hover */
    button[style*="Load New"]:hover {
      background: #F9FAFB !important;
      border-color: #D1D5DB !important;
    }
  `
  document.head.appendChild(styleSheet)
}

export default UploadPanel
