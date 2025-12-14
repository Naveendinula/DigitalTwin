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
  const [showDetails, setShowDetails] = useState(false)
  
  // Draggable state
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const [size, setSize] = useState({ width: 360, height: 500 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  
  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: 0, height: 0 })
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

  // Resize handlers
  const handleResizeMouseDown = (e) => {
    e.stopPropagation()
    setIsResizing(true)
    resizeStart.current = { x: e.clientX, y: e.clientY }
    startSize.current = { width: size.width, height: size.height }
  }

  const handleResizeMouseMove = (e) => {
    if (isResizing) {
      e.preventDefault()
      const dx = e.clientX - resizeStart.current.x
      const dy = e.clientY - resizeStart.current.y
      
      setSize({
        width: Math.max(300, startSize.current.width + dx),
        height: Math.max(300, startSize.current.height + dy)
      })
    }
  }

  const handleResizeMouseUp = () => {
    setIsResizing(false)
  }

  // Global mouse listeners for drag and resize
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    } else if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove)
      window.addEventListener('mouseup', handleResizeMouseUp)
    }
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleResizeMouseMove)
      window.removeEventListener('mouseup', handleResizeMouseUp)
    }
  }, [isDragging, isResizing])

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
        width: `${size.width}px`,
        height: `${size.height}px`,
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
              <span style={styles.subValue}>({result.summary.total.avg_tCO2e.toFixed(2)} tCO2e)</span>
            </div>

            <button 
              onClick={() => setShowDetails(!showDetails)}
              style={styles.secondaryButton}
            >
              {showDetails ? 'Hide Breakdown' : 'Show Breakdown'}
            </button>

            {showDetails && (
              <div style={styles.detailsContainer}>
                {result.quality && (
                  <div style={styles.qualityContainer}>
                    <h4 style={styles.subtitle}>Data Coverage</h4>
                    <div style={styles.qualityBarContainer}>
                      <div 
                        style={{
                          ...styles.qualityFill, 
                          width: `${(result.quality.rows_with_factors / result.quality.rows_total) * 100}%`,
                          backgroundColor: (result.quality.rows_with_factors / result.quality.rows_total) > 0.8 ? '#34c759' : '#ff9500'
                        }} 
                      />
                    </div>
                    <p style={styles.qualityText}>
                      {result.quality.rows_with_factors} / {result.quality.rows_total} elements mapped
                    </p>
                    
                    {result.quality.rows_missing_factors > 0 && (
                      <div style={styles.missingInfo}>
                        <p style={styles.missingLabel}>Missing impacts for:</p>
                        <ul style={styles.missingList}>
                          {result.quality.missing_material_names_top.map((item, i) => (
                            <li key={i}>{item.name} ({item.count})</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <h4 style={styles.subtitle}>By Material Class</h4>
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Material</th>
                        <th style={styles.th}>EC (kgCO2e)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.summary.by_material_class.map((item, idx) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{item.material_class}</td>
                          <td style={styles.td}>{item.ec_avg_kgCO2e.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <h4 style={{...styles.subtitle, marginTop: '16px'}}>By IFC Type</h4>
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Type</th>
                        <th style={styles.th}>Mass (kg)</th>
                        <th style={styles.th}>EC (kgCO2e)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.summary.by_ifc_type.map((item, idx) => (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{item.ifc_type.replace('Ifc', '')}</td>
                          <td style={styles.td}>{item.mass_kg.toFixed(0)}</td>
                          <td style={styles.td}>{item.ec_avg_kgCO2e.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
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

      {/* Resize Handle */}
      <div 
        style={styles.resizeHandle}
        onMouseDown={handleResizeMouseDown}
      />
    </div>
  )
}

const styles = {
  panel: {
    position: 'absolute',
    // width: '360px', // Removed fixed width
    // maxHeight: 'calc(100vh - 100px)', // Removed fixed max height
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
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
    flex: 1, // Take remaining space
    // maxHeight: '600px', // Removed fixed max height
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '20px',
    height: '20px',
    cursor: 'nwse-resize',
    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.1) 50%)',
    borderBottomRightRadius: '12px',
    zIndex: 10,
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
  subValue: {
    fontSize: '13px',
    color: '#86868b',
    marginTop: '4px',
  },
  secondaryButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    color: '#1d1d1f',
    border: 'none',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.2s',
  },
  detailsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animation: 'fadeIn 0.3s ease-in-out',
  },
  qualityContainer: {
    backgroundColor: 'rgba(0, 0, 0, 0.03)',
    padding: '12px',
    borderRadius: '8px',
    marginBottom: '8px',
  },
  qualityBarContainer: {
    height: '6px',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: '3px',
    overflow: 'hidden',
    margin: '8px 0 4px 0',
  },
  qualityFill: {
    height: '100%',
    borderRadius: '3px',
    transition: 'width 0.5s ease-out',
  },
  qualityText: {
    fontSize: '11px',
    color: '#86868b',
    textAlign: 'right',
    margin: 0,
  },
  missingInfo: {
    marginTop: '8px',
    paddingTop: '8px',
    borderTop: '1px solid rgba(0, 0, 0, 0.06)',
  },
  missingLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#1d1d1f',
    margin: '0 0 4px 0',
  },
  missingList: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '11px',
    color: '#424245',
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
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-5px); }
    to { opacity: 1; transform: translateY(0); }
  }
`
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet)
}

export default EcPanel
