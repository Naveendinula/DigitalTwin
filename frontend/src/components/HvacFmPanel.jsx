import React, { useState, useRef, useEffect, useMemo } from 'react'

const getSpaceLabel = (space) => {
  if (!space) return 'Unknown'
  const roomNo = space.room_no || ''
  const roomName = space.room_name || ''
  const label = `${roomNo} ${roomName}`.trim()
  return label || space.name || space.globalId || 'Unknown'
}

const getTerminalLabel = (terminal) => {
  if (!terminal) return 'Unknown'
  return terminal.name || terminal.tag || terminal.globalId || 'Unknown'
}

/**
 * HvacFmPanel Component
 *
 * Draggable panel for triggering and displaying HVAC/FM analysis results.
 * Matches the application's existing panel conventions.
 */
function HvacFmPanel({ isOpen, onClose, jobId, selectedId, onSelectEquipment, focusToken, zIndex, spaceOverlayLoading }) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [selectedEquipmentId, setSelectedEquipmentId] = useState(null)
  const [showEquipmentSpaces, setShowEquipmentSpaces] = useState(true)
  const [storeyFilter, setStoreyFilter] = useState('All')
  const [systemFilter, setSystemFilter] = useState('All')
  const [activeTab, setActiveTab] = useState('equipment')
  const [spaceSearch, setSpaceSearch] = useState('')
  const [selectedSpaceId, setSelectedSpaceId] = useState(null)

  // Draggable state
  const [position, setPosition] = useState({ x: 420, y: 80 })
  const [size, setSize] = useState({ width: 360, height: 500 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: 0, height: 0 })
  const panelRef = useRef(null)

  useEffect(() => {
    const handleResize = () => {}
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (!panelRef.current) return

    setPosition(prev => {
      const maxX = Math.max(20, window.innerWidth - size.width - 20)
      const maxY = Math.max(20, window.innerHeight - size.height - 20)
      const x = Math.min(Math.max(20, prev.x), maxX)
      const y = Math.min(Math.max(20, prev.y), maxY)
      return { x, y }
    })

    const el = panelRef.current
    const original = el.style.boxShadow
    el.style.boxShadow = '0 12px 40px rgba(0,0,0,0.18)'
    const t = setTimeout(() => { el.style.boxShadow = original }, 280)
    return () => clearTimeout(t)
  }, [focusToken, size.width, size.height])

  const handleMouseDown = (e) => {
    if (panelRef.current && e.target.closest('.drag-handle')) {
      setIsDragging(true)
      dragStart.current = { x: e.clientX, y: e.clientY }
      startPos.current = { x: position.x, y: position.y }
    }
  }

  const handleMouseMove = (e) => {
    if (isDragging) {
      e.preventDefault()
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPosition({ x: startPos.current.x + dx, y: startPos.current.y + dy })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

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

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      document.body.style.userSelect = 'none'
    } else if (isResizing) {
      window.addEventListener('mousemove', handleResizeMouseMove)
      window.addEventListener('mouseup', handleResizeMouseUp)
      document.body.style.userSelect = 'none'
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('mousemove', handleResizeMouseMove)
      window.removeEventListener('mouseup', handleResizeMouseUp)
      document.body.style.userSelect = ''
    }
  }, [isDragging, isResizing])

  const handleAnalyze = async () => {
    if (!jobId) {
      setError('Upload a model first.')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const analyzeRes = await fetch(`http://localhost:8000/api/fm/hvac/analyze/${jobId}`, {
        method: 'POST'
      })
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json()
        throw new Error(err.detail || 'Analysis failed')
      }

      const resultRes = await fetch(`http://localhost:8000/api/fm/hvac/${jobId}`)
      if (!resultRes.ok) {
        const err = await resultRes.json()
        throw new Error(err.detail || 'Failed to load HVAC/FM results')
      }

      const data = await resultRes.json()
      setResult(data)
      setSelectedEquipmentId(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const equipmentList = result?.equipment || []
  const availableStoreys = useMemo(() => {
    const storeys = new Set()
    equipmentList.forEach(item => {
      if (item.storey) storeys.add(item.storey)
    })
    return ['All', ...Array.from(storeys).sort()]
  }, [equipmentList])

  const availableSystems = useMemo(() => {
    const systems = new Set()
    equipmentList.forEach(item => {
      (item.systems || []).forEach(system => {
        if (system?.name) systems.add(system.name)
      })
    })
    return ['All', ...Array.from(systems).sort()]
  }, [equipmentList])

  const filteredEquipment = useMemo(() => {
    return equipmentList.filter(item => {
      const matchesStorey = storeyFilter === 'All' || item.storey === storeyFilter
      const matchesSystem = systemFilter === 'All'
        || (item.systems || []).some(system => system?.name === systemFilter)
      return matchesStorey && matchesSystem
    })
  }, [equipmentList, storeyFilter, systemFilter])
  const selectedEquipment = useMemo(
    () => equipmentList.find(item => item.globalId === selectedEquipmentId),
    [equipmentList, selectedEquipmentId]
  )

  const spacesMap = useMemo(() => {
    const map = {}
    if (!result?.equipment) return map

    result.equipment.forEach(equip => {
      if (!equip.servedSpaces) return
      equip.servedSpaces.forEach(space => {
        if (!map[space.globalId]) {
          map[space.globalId] = {
            spaceInfo: space,
            servedBy: [],
            terminals: []
          }
        }
        // Add equipment
        if (!map[space.globalId].servedBy.find(e => e.globalId === equip.globalId)) {
          map[space.globalId].servedBy.push(equip)
        }
        // Add terminals from this equipment
        if (equip.servedTerminals) {
           equip.servedTerminals.forEach(term => {
               if (!map[space.globalId].terminals.find(t => t.globalId === term.globalId)) {
                   map[space.globalId].terminals.push(term)
               }
           })
        }
      })
    })
    return map
  }, [result])

  const filteredSpaces = useMemo(() => {
    const allSpaces = Object.values(spacesMap)
    if (!spaceSearch) return allSpaces
    const lower = spaceSearch.toLowerCase()
    return allSpaces.filter(item => {
      const label = getSpaceLabel(item.spaceInfo).toLowerCase()
      return label.includes(lower)
    })
  }, [spacesMap, spaceSearch])

  const selectedSpace = useMemo(() => {
      return spacesMap[selectedSpaceId]
  }, [spacesMap, selectedSpaceId])

  useEffect(() => {
    if (!selectedId || !result?.equipment?.length) return
    const match = result.equipment.find(item => item.globalId === selectedId)
    if (match) {
      setSelectedEquipmentId(match.globalId)
      setActiveTab('equipment')
      return
    }

    if (spacesMap[selectedId]) {
        setSelectedSpaceId(selectedId)
        setActiveTab('spaces')
    }
  }, [selectedId, result, spacesMap])

  if (!isOpen) return null

  return (
    <div
      ref={panelRef}
      style={{
        ...styles.panel,
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: `${size.width}px`,
        height: `${size.height}px`,
        cursor: isDragging ? 'grabbing' : 'default',
        zIndex: zIndex || styles.panel.zIndex
      }}
      onMouseDown={handleMouseDown}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div style={styles.header} className="drag-handle">
        <div style={styles.titleContainer}>
          <span style={styles.dragIcon}>::: </span>
          <h3 style={styles.title}>HVAC/FM</h3>
        </div>
        <button onClick={onClose} style={styles.closeButton} className="hvac-close-btn">
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
            <button onClick={handleAnalyze} style={styles.retryButton} className="hvac-secondary-btn">Try Again</button>
          </div>
        )}

        {loading && (
          <div style={styles.loading}>
            <div style={styles.spinner}></div>
            <p>Analyzing HVAC/FM...</p>
          </div>
        )}

        {!loading && !result && !error && (
          <div style={styles.initial}>
            <p style={styles.description}>
              Analyze HVAC equipment to derive served terminals and impacted spaces.
            </p>
            <button onClick={handleAnalyze} style={styles.primaryButton} className="hvac-primary-btn">
              Analyze HVAC FM
            </button>
          </div>
        )}

        {!loading && result && (
          <div style={styles.result}>
            <div style={styles.tabContainer}>
              <div
                style={{...styles.tab, ...(activeTab === 'equipment' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('equipment')}
              >
                Equipment
              </div>
              <div
                style={{...styles.tab, ...(activeTab === 'spaces' ? styles.activeTab : {})}}
                onClick={() => setActiveTab('spaces')}
              >
                Spaces
              </div>
            </div>

            {activeTab === 'equipment' && (
              <>
                <div style={styles.summaryCard}>
                  <span style={styles.label}>Equipment</span>
                  <span style={styles.value}>{result.summary?.equipment_count || 0}</span>
                  <span style={styles.subValue}>
                    {result.summary?.served_terminal_count || 0} terminals, {result.summary?.served_space_count || 0} spaces
                  </span>
                </div>

                <div style={styles.filterRow}>
                  <div style={styles.filterGroup}>
                    <span style={styles.filterLabel}>Storey</span>
                    <select
                      style={styles.select}
                      value={storeyFilter}
                      onChange={(e) => setStoreyFilter(e.target.value)}
                    >
                      {availableStoreys.map(storey => (
                        <option key={storey} value={storey}>{storey}</option>
                      ))}
                    </select>
                  </div>
                  <div style={styles.filterGroup}>
                    <span style={styles.filterLabel}>System</span>
                    <select
                      style={styles.select}
                      value={systemFilter}
                      onChange={(e) => setSystemFilter(e.target.value)}
                    >
                      {availableSystems.map(system => (
                        <option key={system} value={system}>{system}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Mark/Tag</th>
                        <th style={styles.th}>Storey</th>
                        <th style={styles.th}>Systems</th>
                        <th style={styles.th}>Terminals</th>
                        <th style={styles.th}>Spaces</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEquipment.map((item) => {
                        const isSelected = item.globalId === selectedEquipmentId
                        const tagLabel = item.tag || item.name || 'Unnamed'
                        return (
                          <tr
                            key={item.globalId}
                            style={{
                              ...styles.tr,
                              backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #00D4FF' : '3px solid transparent'
                            }}
                            className="hvac-row-hover"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedEquipmentId(item.globalId)
                              setShowEquipmentSpaces(true)
                              onSelectEquipment?.({
                                equipmentId: item.globalId,
                                terminalIds: (item.servedTerminals || []).map(terminal => terminal.globalId).filter(Boolean),
                                spaceIds: (item.servedSpaces || []).map(space => space.globalId).filter(Boolean),
                              })
                            }}
                            title="Click to select in model"
                          >
                            <td style={styles.td}>{tagLabel}</td>
                            <td style={styles.td}>{item.storey || '-'}</td>
                            <td style={styles.td}>{item.systems?.length || 0}</td>
                            <td style={styles.td}>{item.servedTerminals?.length || 0}</td>
                            <td style={styles.td}>{item.servedSpaces?.length || 0}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedEquipment && (
                  <div style={styles.detailsContainer}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <h4 style={{ ...styles.subtitle, marginBottom: 0 }}>Impacted spaces</h4>
                      <button
                        disabled={spaceOverlayLoading}
                        className={!showEquipmentSpaces ? 'hvac-secondary-btn' : ''}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: showEquipmentSpaces ? 'rgba(0, 212, 255, 0.15)' : undefined,
                          color: showEquipmentSpaces ? '#008299' : undefined,
                          fontSize: '11px',
                          cursor: spaceOverlayLoading ? 'wait' : 'pointer',
                          fontWeight: 600,
                          opacity: spaceOverlayLoading ? 0.7 : 1,
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => {
                          const nextState = !showEquipmentSpaces
                          setShowEquipmentSpaces(nextState)
                          onSelectEquipment?.({
                            equipmentId: selectedEquipment.globalId,
                            terminalIds: (selectedEquipment.servedTerminals || []).map(t => t.globalId).filter(Boolean),
                            spaceIds: nextState ? (selectedEquipment.servedSpaces || []).map(s => s.globalId).filter(Boolean) : [],
                          })
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: showEquipmentSpaces ? 1 : 0.7 }}>
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        {spaceOverlayLoading ? 'Loading...' : (showEquipmentSpaces ? 'Spaces Visible' : 'Show Spaces')}
                      </button>
                    </div>
                    {selectedEquipment.servedSpaces?.length ? (
                      <ul style={styles.list}>
                        {selectedEquipment.servedSpaces.map((space) => (
                          <li key={space.globalId || space.name} style={styles.listItem}>
                            {getSpaceLabel(space)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={styles.emptyText}>No spaces linked.</p>
                    )}

                    <h4 style={{ ...styles.subtitle, marginTop: '12px' }}>Impacted terminals</h4>
                    {selectedEquipment.servedTerminals?.length ? (
                      <ul style={styles.list}>
                        {selectedEquipment.servedTerminals.map((terminal) => (
                          <li key={terminal.globalId} style={styles.listItem}>
                            {getTerminalLabel(terminal)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p style={styles.emptyText}>No terminals linked.</p>
                    )}
                  </div>
                )}
              </>
            )}

            {activeTab === 'spaces' && (
              <>
                <input
                  style={styles.searchInput}
                  placeholder="Search spaces..."
                  value={spaceSearch}
                  onChange={(e) => setSpaceSearch(e.target.value)}
                />
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Space</th>
                        <th style={styles.th}>Served By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSpaces.map((item) => {
                        const isSelected = item.spaceInfo.globalId === selectedSpaceId
                        return (
                          <tr
                            key={item.spaceInfo.globalId}
                            style={{
                              ...styles.tr,
                              backgroundColor: isSelected ? 'rgba(0, 212, 255, 0.15)' : 'transparent',
                              borderLeft: isSelected ? '3px solid #00D4FF' : '3px solid transparent'
                            }}
                            className="hvac-row-hover"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedSpaceId(item.spaceInfo.globalId)
                              onSelectEquipment?.({
                                equipmentId: null,
                                terminalIds: [
                                  ...item.servedBy.map(e => e.globalId),
                                  ...item.terminals.map(t => t.globalId)
                                ].filter(Boolean),
                                spaceIds: [item.spaceInfo.globalId],
                              })
                            }}
                          >
                            <td style={styles.td}>{getSpaceLabel(item.spaceInfo)}</td>
                            <td style={styles.td}>{item.servedBy.length} equip</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedSpace && (
                  <div style={styles.detailsContainer}>
                    <h4 style={styles.subtitle}>Served By</h4>
                    <ul style={styles.list}>
                      {selectedSpace.servedBy.map(equip => (
                        <li key={equip.globalId} style={styles.listItem}>
                          {equip.tag || equip.name}
                        </li>
                      ))}
                    </ul>
                    <h4 style={{...styles.subtitle, marginTop: '12px'}}>Terminals</h4>
                    <ul style={styles.list}>
                      {selectedSpace.terminals.map(term => (
                        <li key={term.globalId} style={styles.listItem}>
                          {getTerminalLabel(term)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

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
    letterSpacing: '-1px',
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
    padding: '4px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '4px',
  },
  content: {
    padding: '16px',
    overflowY: 'auto',
    flex: 1,
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
  initial: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '12px',
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
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
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
  tabContainer: {
    display: 'flex',
    borderBottom: '1px solid rgba(0,0,0,0.1)',
    marginBottom: '16px',
  },
  tab: {
    flex: 1,
    padding: '10px',
    textAlign: 'center',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#86868b',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
  },
  activeTab: {
    color: '#0071e3',
    borderBottom: '2px solid #0071e3',
    fontWeight: 600,
  },
  searchInput: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid #d2d2d7',
    fontSize: '13px',
    marginBottom: '12px',
    outline: 'none',
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
  detailsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    animation: 'fadeIn 0.3s ease-in-out',
  },
  subtitle: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
  },
  list: {
    margin: 0,
    paddingLeft: '16px',
    fontSize: '12px',
    color: '#424245',
  },
  listItem: {
    marginBottom: '4px',
  },
  emptyText: {
    margin: 0,
    color: '#86868b',
    fontSize: '12px',
  },
  filterRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
  },
  filterGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    flex: 1,
    minWidth: '140px',
  },
  filterLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#86868b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  select: {
    padding: '8px',
    borderRadius: '6px',
    border: '1px solid #d2d2d7',
    fontSize: '12px',
    color: '#1d1d1f',
    background: '#ffffff',
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
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
  },
}

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
  .hvac-row-hover:hover {
    background-color: rgba(0, 113, 227, 0.08) !important;
    cursor: pointer;
  }
  .hvac-primary-btn {
    background-color: #0071e3;
    color: #ffffff;
    transition: background-color 0.2s ease;
  }
  .hvac-primary-btn:hover {
    background-color: #005bb5 !important;
  }
  .hvac-secondary-btn {
    background-color: rgba(0, 0, 0, 0.05);
    color: #1d1d1f;
    transition: background-color 0.2s ease;
  }
  .hvac-secondary-btn:hover {
    background-color: rgba(0, 0, 0, 0.12) !important;
  }
  .hvac-close-btn {
    color: #86868b;
    transition: background-color 0.2s, color 0.2s;
  }
  .hvac-close-btn:hover {
    background-color: rgba(0, 0, 0, 0.05);
    color: #1d1d1f !important;
  }
`
if (typeof document !== 'undefined') {
  document.head.appendChild(styleSheet)
}

export default HvacFmPanel
