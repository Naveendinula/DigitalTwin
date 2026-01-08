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
    color: '#d97706',
    bgColor: '#f0f0f2',
    labelColor: '#6b7280',
    icon: '!',
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
  const [hasError, setHasError] = useState(false)

  const API_URL = 'http://localhost:8000'

  useEffect(() => {
    if (!jobId) return

    const fetchValidation = async () => {
      setLoading(true)
      setHasError(false)
      
      try {
        const response = await fetch(`${API_URL}/validation/${jobId}/summary`)
        if (!response.ok) {
          throw new Error('Validation not available')
        }
        const data = await response.json()
        setValidationData(data)
      } catch (err) {
        console.warn('Validation fetch error:', err)
        setHasError(true)
      } finally {
        setLoading(false)
      }
    }

    fetchValidation()
  }, [jobId])

  const status = loading ? 'loading' : 
                 hasError ? 'error' : 
                 validationData?.status || 'error'
  
  const config = SEVERITY_CONFIG[status] || SEVERITY_CONFIG.error
  const iconColor = config.iconColor || config.color
  const labelColor = config.labelColor || config.color
  const badgeStyle = {
    ...styles.badge,
    ...(status === 'warn' ? { background: config.bgColor } : {}),
  }
  const warnCountStyle = status === 'warn'
    ? { ...styles.warnCount, color: config.color }
    : styles.warnCount

  const handleClick = () => {
    if (!loading && !hasError && onOpenReport) {
      onOpenReport()
    }
  }

  return (
    <button 
      style={{
        ...badgeStyle,
        cursor: loading ? 'default' : 'pointer',
        opacity: loading ? 0.7 : 1,
      }}
      onClick={handleClick}
      title={loading ? 'Validating model...' : 'Click to view validation report'}
      disabled={loading}
    >
      <span style={{ ...styles.icon, color: iconColor }}>
        {config.icon}
      </span>
      <span style={{ ...styles.label, color: labelColor }}>
        {config.label}
      </span>
      {!loading && validationData?.summary && (
        <span style={styles.counts}>
          <span style={styles.passCount}>{validationData.summary.passCount}</span>
          {validationData.summary.warnCount > 0 && (
            <span style={warnCountStyle}>/{validationData.summary.warnCount}</span>
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
    border: 'none',
    background: '#e8e8ec',
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: 'inherit',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
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
