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
          📁 Load New Model
        </button>
      </div>
    )
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.panel}>
        <h1 style={styles.title}>🏗️ Digital Twin Viewer</h1>
        <p style={styles.subtitle}>Upload an IFC file to get started</p>

        {uploadState === 'idle' && (
          <div
            style={{
              ...styles.dropzone,
              ...(isDragging ? styles.dropzoneActive : {})
            }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <span style={styles.dropIcon}>📄</span>
            <p style={styles.dropText}>
              Drag & drop your <strong>.ifc</strong> file here
            </p>
            <p style={styles.dropOr}>or</p>
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
            <p style={styles.errorText}>❌ {error}</p>
            <button style={styles.retryBtn} onClick={handleReset}>
              Try Again
            </button>
          </div>
        )}

        <div style={styles.footer}>
          <p style={styles.footerText}>
            Supports IFC 2x3 and IFC 4 files
          </p>
          <p style={styles.footerHint}>
            Make sure the backend server is running on port 8000
          </p>
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
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  panel: {
    background: 'rgba(255, 255, 255, 0.05)',
    borderRadius: '16px',
    padding: '40px',
    maxWidth: '480px',
    width: '90%',
    textAlign: 'center',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  },
  title: {
    margin: '0 0 8px 0',
    fontSize: '28px',
    color: '#ffffff',
    fontWeight: 600,
  },
  subtitle: {
    margin: '0 0 32px 0',
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: '16px',
  },
  dropzone: {
    border: '2px dashed rgba(255, 255, 255, 0.3)',
    borderRadius: '12px',
    padding: '40px 20px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    background: 'rgba(255, 255, 255, 0.02)',
  },
  dropzoneActive: {
    borderColor: '#646cff',
    background: 'rgba(100, 108, 255, 0.1)',
  },
  dropIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '16px',
  },
  dropText: {
    margin: '0 0 8px 0',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '16px',
  },
  dropOr: {
    margin: '16px 0',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '14px',
  },
  browseBtn: {
    display: 'inline-block',
    padding: '12px 24px',
    background: '#646cff',
    color: '#ffffff',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: 500,
    transition: 'background 0.2s',
  },
  fileInput: {
    display: 'none',
  },
  processing: {
    padding: '40px 20px',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255, 255, 255, 0.1)',
    borderTopColor: '#646cff',
    borderRadius: '50%',
    margin: '0 auto 20px',
    animation: 'spin 1s linear infinite',
  },
  progressText: {
    margin: '0 0 8px 0',
    color: '#ffffff',
    fontSize: '16px',
  },
  hint: {
    margin: 0,
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '14px',
  },
  errorBox: {
    padding: '20px',
    background: 'rgba(255, 107, 107, 0.1)',
    borderRadius: '8px',
    border: '1px solid rgba(255, 107, 107, 0.3)',
  },
  errorText: {
    margin: '0 0 16px 0',
    color: '#ff6b6b',
    fontSize: '14px',
  },
  retryBtn: {
    padding: '10px 20px',
    background: 'rgba(255, 255, 255, 0.1)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
  },
  footer: {
    marginTop: '32px',
    paddingTop: '20px',
    borderTop: '1px solid rgba(255, 255, 255, 0.1)',
  },
  footerText: {
    margin: '0 0 4px 0',
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: '12px',
  },
  footerHint: {
    margin: 0,
    color: 'rgba(255, 255, 255, 0.3)',
    fontSize: '11px',
  },
  miniPanel: {
    position: 'absolute',
    top: 20,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 100,
  },
  newModelBtn: {
    padding: '8px 16px',
    background: 'rgba(26, 26, 46, 0.9)',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    borderRadius: '6px',
    color: '#ffffff',
    cursor: 'pointer',
    fontSize: '13px',
    backdropFilter: 'blur(10px)',
  },
}

// Add CSS animation for spinner
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `
  document.head.appendChild(styleSheet)
}

export default UploadPanel
