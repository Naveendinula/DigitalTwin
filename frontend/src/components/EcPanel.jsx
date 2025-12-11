import React, { useState, useRef, useEffect } from 'react'

/**
 * EcPanel Component
 * 
 * Draggable panel for triggering and displaying Embodied Carbon calculations.
 * Matches the application's "Arctic Zen" aesthetic.
 */
function EcPanel({ isOpen, onClose, jobId }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  
  // Draggable state
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const panelRef = useRef(null)

  // Reset position if window resizes (optional safety)
  useEffect(() => {
    const handleResize = () => {
      // Keep panel within bounds if needed
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Drag handlers
  const handleMouseDown = (e) => {
    if (panelRef.current && e.target.closest('.drag-handle')) {
      setIsDragging(true)
      // Store initial mouse position
      dragStart.current = {
        x: e.clientX,
        y: e.clientY
      }
      // Store initial panel position
      startPos.current = {
        x: position.x,
        y: position.y
      }
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging) {
      e.preventDefault() // Prevent selection while dragging
      
      // Calculate delta
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      
      // Update position based on initial position + delta
      // This avoids issues with relative containers vs viewport coordinates
      setPosition({
        x: startPos.current.x + dx,
        y: startPos.current.y + dy
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Global mouse listeners for drag
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    } else {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  if (!isOpen) return null

  const handleCalculate = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`http://localhost:8000/api/ec/calculate/${jobId}`, {
        method: 'POST'
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Calculation failed')
      }
      const data = await response.json()
      setResult(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      ref={panelRef}
      style={{
        ...styles.panel,
        left: `${position.x}px`,
        top: `${position.y}px`,
        cursor: isDragging ? 'grabbing' : 'default'
      }}
      onMouseDown={handleMouseDown}
    >
      <div style={styles.header} className="drag-handle">
        <div style={styles.titleContainer}>
          <span style={styles.dragIcon}>⋮⋮</span>
          <h3 style={styles.title}>Embodied Carbon</h3>
        </div>
        <button onClick={onClose} style={styles.closeButton}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      
      <div style={styles.content}>
        {error && (
          <div style={styles.error}>
            <p style={styles.errorText}>{error}</p>
            <button onClick={handleCalculate} style={styles.retryButton}>Try Again</button>
          </div>
        )}

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <p>Calculating carbon footprint...</p>
          </div>
        )}

        {!loading && !result && !error && (
          <div style={styles.initial}>
            <p style={styles.description}>
              Calculate the embodied carbon for the current model based on material quantities.
            </p>
            <button onClick={handleCalculate} style={styles.primaryButton}>
              Calculate
            </button>
          </div>
        )}

        {!loading && result && (
          <div style={styles.result}>
            <div style={styles.summaryCard}>
              <span style={styles.label}>Total Embodied Carbon</span>
              <span style={styles.value}>{result.summary.total.avg_kgCO2e.toFixed(2)} kgCO2e</span>
            </div>
            
            <h4 style={styles.subtitle}>Top Contributors</h4>
            <div style={styles.tableContainer}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Element</th>
                    <th style={styles.th}>Material</th>
                    <th style={styles.th}>EC (kgCO2e)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.elements.map((el, idx) => (
                    <tr key={idx} style={styles.tr}>
                      <td style={styles.td}>{el.Name || 'Unnamed'}</td>
                      <td style={styles.td}>{el.MaterialName || 'Unknown'}</td>
                      <td style={styles.td}>{(el.EC_avg_kgCO2e || 0).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    width: '360px',
    maxHeight: 'calc(100vh - 100px)',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(20px)',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12)',
    border: '1px solid rgba(255, 255, 255, 0.4)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 1000,
    overflow: 'hidden',
    transition: 'box-shadow 0.2s',
  },
  header: {
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    cursor: 'grab',
    userSelect: 'none',
    background: 'rgba(255, 255, 255, 0.5)',
  },
  titleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  dragIcon: {
    color: '#86868b',
    fontSize: '12px',
    letterSpacing: '-2px',
    cursor: 'grab',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#86868b',
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
    transition: 'background 0.2s, color 0.2s',
  },
  content: {
    padding: '16px',
    overflowY: 'auto',
    maxHeight: '600px',
  },
  description: {
    color: '#424245',
    fontSize: '13px',
    lineHeight: '1.5',
    marginBottom: '16px',
    textAlign: 'center',
  },
  primaryButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#0071e3',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: '#86868b',
    fontSize: '13px',
  },
  spinner: {
    width: '24px',
    height: '24px',
    border: '2px solid #e5e5e7',
    borderTopColor: '#0071e3',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '12px',
  },
  result: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  summaryCard: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    padding: '16px',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
  },
  label: {
    fontSize: '11px',
    color: '#86868b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  value: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1d1d1f',
  },
  subtitle: {
    margin: '0 0 8px 0',
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  tableContainer: {
    border: '1px solid rgba(0, 0, 0, 0.06)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    textAlign: 'left',
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.02)',
    color: '#86868b',
    fontWeight: 500,
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  },
  tr: {
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
  },
  td: {
    padding: '8px 12px',
    color: '#1d1d1f',
  },
  error: {
    textAlign: 'center',
    color: '#ff3b30',
    fontSize: '13px',
  },
  errorText: {
    marginBottom: '12px',
  },
  retryButton: {
    padding: '6px 12px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    color: '#1d1d1f',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  }
}

// Add spinner animation
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet)
}

export default EcPanel
