import React, { useState, useEffect } from 'react'

/**
 * Validation Status Badge Component - Arctic Zen Design
 * 
 * Shows validation status after model is loaded.
 * Clicking opens the full validation report modal.
 */

const SEVERITY_CONFIG = {
  pass: {
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.1)',
    icon: '✓',
    label: 'Valid'
  },
  warn: {
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.1)',
    icon: '⚠',
    label: 'Warnings'
  },
  fail: {
    color: '#ef4444',
    bgColor: 'rgba(239, 68, 68, 0.1)',
    icon: '✗',
    label: 'Issues'
  },
  loading: {
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: '◌',
    label: 'Validating...'
  },
  error: {
    color: '#6b7280',
    bgColor: 'rgba(107, 114, 128, 0.1)',
    icon: '?',
    label: 'Unknown'
  }
}

function ValidationBadge({ jobId, onOpenReport }) {
  const [validationData, setValidationData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const API_URL = 'http://localhost:8000'

  useEffect(() => {
    if (!jobId) return

    const fetchValidation = async () => {
      setLoading(true)
      setError(null)
      
      try {
        const response = await fetch(`${API_URL}/validation/${jobId}/summary`)
        if (!response.ok) {
          throw new Error('Validation not available')
        }
        const data = await response.json()
        setValidationData(data)
      } catch (err) {
        console.warn('Validation fetch error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    fetchValidation()
  }, [jobId])

  const status = loading ? 'loading' : 
                 error ? 'error' : 
                 validationData?.status || 'error'
  
  const config = SEVERITY_CONFIG[status] || SEVERITY_CONFIG.error

  const handleClick = () => {
    if (!loading && !error && onOpenReport) {
      onOpenReport()
    }
  }

  return (
    <button 
      style={{
        ...styles.badge,
        backgroundColor: config.bgColor,
        borderColor: config.color,
        cursor: loading ? 'default' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
      onClick={handleClick}
      title={loading ? 'Validating model...' : 'Click to view validation report'}
      disabled={loading}
    >
      <span style={{ ...styles.icon, color: config.color }}>
        {config.icon}
      </span>
      <span style={{ ...styles.label, color: config.color }}>
        {config.label}
      </span>
      {!loading && validationData?.summary && (
        <span style={styles.counts}>
          <span style={styles.passCount}>{validationData.summary.passCount}</span>
          {validationData.summary.warnCount > 0 && (
            <span style={styles.warnCount}>/{validationData.summary.warnCount}</span>
          )}
          {validationData.summary.failCount > 0 && (
            <span style={styles.failCount}>/{validationData.summary.failCount}</span>
          )}
        </span>
      )}
      {!loading && (
        <span style={styles.chevron}>›</span>
      )}
    </button>
  )
}

const styles = {
  badge: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    borderRadius: '20px',
    border: '1px solid',
    background: 'transparent',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'all 0.2s ease',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },

  icon: {
    fontSize: '14px',
    lineHeight: 1,
  },

  label: {
    letterSpacing: '-0.01em',
  },

  counts: {
    marginLeft: '4px',
    fontSize: '11px',
    opacity: 0.8,
  },

  passCount: {
    color: '#10b981',
  },

  warnCount: {
    color: '#f59e0b',
  },

  failCount: {
    color: '#ef4444',
  },

  chevron: {
    marginLeft: '2px',
    fontSize: '14px',
    opacity: 0.5,
  },
}

export default ValidationBadge
