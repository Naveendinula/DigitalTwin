import React, { useState, useRef, useEffect, useMemo } from 'react'

/**
 * Get color string for occupancy percentage using iOS-style gradient
 */
const getOccupancyColorStr = (percent) => {
  const p = Math.max(0, Math.min(100, percent))
  
  // iOS colors: #4cd964 (green) -> #ffcc00 (yellow) -> #ff3b30 (red)
  let r, g, b

  if (p <= 50) {
    const t = p / 50
    r = Math.round(76 + t * (255 - 76))
    g = Math.round(217 + t * (204 - 217))
    b = Math.round(100 - t * 100)
  } else {
    const t = (p - 50) / 50
    r = 255
    g = Math.round(204 - t * (204 - 59))
    b = Math.round(t * 48)
  }

  return `rgb(${r}, ${g}, ${b})`
}

/**
 * OccupancyPanel Component
 *
 * Draggable panel showing detailed occupancy breakdown by space.
 * Follows the "Arctic Zen" aesthetic - clean, minimal, translucent.
 */
function OccupancyPanel({ isOpen, onClose, occupancyData, totals, timestamp, onReset, onSpaceSelect, zIndex }) {
  const [sortBy, setSortBy] = useState('occupancy') // 'occupancy', 'percent', 'name'
  const [sortDir, setSortDir] = useState('desc')
  const [storeyFilter, setStoreyFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Draggable state
  const [position, setPosition] = useState({ x: 20, y: 80 })
  const [size, setSize] = useState({ width: 380, height: 520 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)

  const dragStart = useRef({ x: 0, y: 0 })
  const startPos = useRef({ x: 0, y: 0 })
  const resizeStart = useRef({ x: 0, y: 0 })
  const startSize = useRef({ width: 0, height: 0 })
  const panelRef = useRef(null)

  // Drag handlers
  const handleDragStart = (e) => {
    if (e.target.closest('.resize-handle')) return
    setIsDragging(true)
    dragStart.current = { x: e.clientX, y: e.clientY }
    startPos.current = { ...position }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e) => {
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      setPosition({
        x: Math.max(0, startPos.current.x + dx),
        y: Math.max(0, startPos.current.y + dy)
      })
    }

    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // Resize handlers
  const handleResizeStart = (e) => {
    e.stopPropagation()
    setIsResizing(true)
    resizeStart.current = { x: e.clientX, y: e.clientY }
    startSize.current = { ...size }
  }

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e) => {
      const dx = e.clientX - resizeStart.current.x
      const dy = e.clientY - resizeStart.current.y
      setSize({
        width: Math.max(320, startSize.current.width + dx),
        height: Math.max(300, startSize.current.height + dy)
      })
    }

    const handleMouseUp = () => setIsResizing(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  // Get sorted and filtered spaces
  const processedSpaces = useMemo(() => {
    if (!occupancyData || occupancyData.size === 0) return []

    let spaces = Array.from(occupancyData.values())

    // Filter by storey
    if (storeyFilter !== 'All') {
      spaces = spaces.filter(s => s.storey === storeyFilter)
    }

    // Filter by search
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      spaces = spaces.filter(s =>
        (s.name || '').toLowerCase().includes(q) ||
        (s.room_no || '').toLowerCase().includes(q) ||
        (s.room_name || '').toLowerCase().includes(q)
      )
    }

    // Sort
    spaces.sort((a, b) => {
      let cmp = 0
      if (sortBy === 'occupancy') {
        cmp = a.occupancy - b.occupancy
      } else if (sortBy === 'percent') {
        cmp = a.percent - b.percent
      } else if (sortBy === 'name') {
        const nameA = `${a.room_no} ${a.room_name}`.trim() || a.name || ''
        const nameB = `${b.room_no} ${b.room_name}`.trim() || b.name || ''
        cmp = nameA.localeCompare(nameB)
      }
      return sortDir === 'desc' ? -cmp : cmp
    })

    return spaces
  }, [occupancyData, storeyFilter, searchQuery, sortBy, sortDir])

  // Get unique storeys
  const storeys = useMemo(() => {
    if (!occupancyData || occupancyData.size === 0) return []
    const set = new Set()
    for (const space of occupancyData.values()) {
      if (space.storey) set.add(space.storey)
    }
    return Array.from(set).sort()
  }, [occupancyData])

  // Aggregates
  const aggregates = useMemo(() => {
    let occ = 0, cap = 0
    for (const s of processedSpaces) {
      occ += s.occupancy
      cap += s.capacity
    }
    return { occupancy: occ, capacity: cap, percent: cap > 0 ? Math.round((occ / cap) * 100) : 0 }
  }, [processedSpaces])

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  if (!isOpen) return null

  const { totalOccupancy = 0, totalCapacity = 0 } = totals || {}
  const totalPercent = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0

  return (
    <div
      ref={panelRef}
      style={{
        ...styles.panel,
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: zIndex || 200
      }}
    >
      <div style={styles.header} className="drag-handle" onMouseDown={handleDragStart}>
        <div style={styles.titleContainer}>
          <span style={styles.dragIcon}>:::</span>
          <h3 style={styles.title}>Occupancy</h3>
          <span style={styles.liveBadge}>LIVE</span>
        </div>
        <button onClick={onClose} style={styles.closeButton} className="occ-close-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div style={styles.content}>
        {/* Summary Card */}
        <div style={styles.summaryCard}>
          <div style={styles.summaryMain}>
            <span style={styles.summaryValue}>{totalOccupancy.toLocaleString()}</span>
            <span style={styles.summaryDivider}>/</span>
            <span style={styles.summaryCapacity}>{totalCapacity.toLocaleString()}</span>
          </div>
          <div style={styles.summaryMeta}>
            <span style={styles.summaryPercent}>{totalPercent}% building occupancy</span>
            <button onClick={onReset} style={styles.resetButton} className="occ-secondary-btn">
              Reset Sim
            </button>
          </div>
        </div>

        {/* Filters */}
        <div style={styles.filters}>
          <select
            value={storeyFilter}
            onChange={(e) => setStoreyFilter(e.target.value)}
            style={styles.select}
          >
            <option value="All">All Storeys</option>
            {storeys.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <input
            type="text"
            placeholder="Search spaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>

        {/* Filtered aggregate */}
        {storeyFilter !== 'All' && (
          <div style={styles.filteredAggregate}>
            Filtered: {aggregates.occupancy} / {aggregates.capacity} ({aggregates.percent}%)
          </div>
        )}

        {/* Table */}
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th} onClick={() => handleSort('name')}>
                  Space {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ ...styles.th, ...styles.thRight }} onClick={() => handleSort('occupancy')}>
                  Count {sortBy === 'occupancy' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th style={{ ...styles.th, ...styles.thRight }} onClick={() => handleSort('percent')}>
                  % {sortBy === 'percent' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
              </tr>
            </thead>
            <tbody>
              {processedSpaces.map((space) => {
                const label = `${space.room_no || ''} ${space.room_name || ''}`.trim() || space.name || space.globalId
                const colorStr = getOccupancyColorStr(space.percent)
                return (
                  <tr
                    key={space.globalId}
                    style={styles.tr}
                    className="occ-row-hover"
                    onClick={() => onSpaceSelect?.(space.globalId)}
                  >
                    <td style={styles.td}>
                      <div style={styles.spaceCell}>
                        <span
                          style={{
                            ...styles.colorDot,
                            backgroundColor: colorStr
                          }}
                        />
                        <span style={styles.spaceName} title={label}>{label}</span>
                      </div>
                    </td>
                    <td style={{ ...styles.td, ...styles.tdRight }}>
                      <span style={styles.countValue}>{space.occupancy}</span>
                      <span style={styles.countCapacity}>/{space.capacity}</span>
                    </td>
                    <td style={{ ...styles.td, ...styles.tdRight }}>
                      <span style={{
                        ...styles.percentBadge,
                        backgroundColor: `${colorStr}18`,
                        color: '#424245'
                      }}>
                        {space.percent}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={styles.footer}>
          {processedSpaces.length} spaces
        </div>
      </div>

      {/* Resize handle */}
      <div
        style={styles.resizeHandle}
        className="resize-handle"
        onMouseDown={handleResizeStart}
      />
    </div>
  )
}

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';

const styles = {
  panel: {
    position: 'fixed',
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    boxShadow: softShadow,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    fontFamily: 'inherit',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
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
  liveBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: 'rgba(52, 199, 89, 0.12)',
    color: '#34c759',
    fontSize: '9px',
    fontWeight: 600,
    letterSpacing: '0.3px',
  },
  closeButton: {
    background: '#e8e8ec',
    border: 'none',
    cursor: 'pointer',
    color: '#86868b',
    padding: '6px',
    borderRadius: '6px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '16px',
    gap: '14px',
    background: 'rgba(255, 255, 255, 0.3)',
  },
  summaryCard: {
    padding: '14px 16px',
    backgroundColor: '#e8e8ec',
    borderRadius: '10px',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  summaryMain: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px',
  },
  summaryValue: {
    fontSize: '28px',
    fontWeight: 600,
    color: '#1d1d1f',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.5px',
  },
  summaryDivider: {
    fontSize: '18px',
    color: '#c7c7cc',
    marginLeft: '2px',
    marginRight: '2px',
  },
  summaryCapacity: {
    fontSize: '18px',
    color: '#86868b',
    fontVariantNumeric: 'tabular-nums',
  },
  summaryMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '10px',
  },
  summaryPercent: {
    fontSize: '12px',
    color: '#86868b',
  },
  resetButton: {
    padding: '5px 12px',
    borderRadius: '6px',
    border: 'none',
    backgroundColor: '#e8e8ec',
    fontSize: '11px',
    fontWeight: 500,
    color: '#424245',
    cursor: 'pointer',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  filters: {
    display: 'flex',
    gap: '8px',
  },
  select: {
    flex: '0 0 130px',
    padding: '8px 10px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '12px',
    backgroundColor: '#e8e8ec',
    color: '#1d1d1f',
    cursor: 'pointer',
    outline: 'none',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.1), inset -1px -1px 2px rgba(255,255,255,0.5)',
  },
  searchInput: {
    flex: 1,
    padding: '8px 12px',
    borderRadius: '8px',
    border: 'none',
    fontSize: '12px',
    backgroundColor: '#e8e8ec',
    outline: 'none',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.1), inset -1px -1px 2px rgba(255,255,255,0.5)',
  },
  filteredAggregate: {
    padding: '8px 12px',
    backgroundColor: 'rgba(0, 113, 227, 0.08)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#0071e3',
    fontWeight: 500,
  },
  tableContainer: {
    flex: 1,
    overflow: 'auto',
    borderRadius: '10px',
    backgroundColor: '#e8e8ec',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '12px',
  },
  th: {
    position: 'sticky',
    top: 0,
    padding: '10px 12px',
    backgroundColor: 'rgba(250, 250, 250, 0.95)',
    borderBottom: '1px solid rgba(0, 0, 0, 0.06)',
    textAlign: 'left',
    fontWeight: 600,
    color: '#86868b',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    cursor: 'pointer',
    userSelect: 'none',
    backdropFilter: 'blur(10px)',
  },
  thRight: {
    textAlign: 'right',
  },
  tr: {
    cursor: 'pointer',
    transition: 'background-color 0.12s',
  },
  td: {
    padding: '10px 12px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.04)',
    verticalAlign: 'middle',
  },
  tdRight: {
    textAlign: 'right',
  },
  spaceCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  colorDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  spaceName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '140px',
    color: '#1d1d1f',
  },
  countValue: {
    fontWeight: 600,
    color: '#1d1d1f',
    fontVariantNumeric: 'tabular-nums',
  },
  countCapacity: {
    color: '#86868b',
    fontVariantNumeric: 'tabular-nums',
  },
  percentBadge: {
    display: 'inline-block',
    padding: '3px 7px',
    borderRadius: '5px',
    fontSize: '11px',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  footer: {
    fontSize: '11px',
    color: '#86868b',
    textAlign: 'center',
    paddingTop: '4px',
  },
  resizeHandle: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: '20px',
    height: '20px',
    cursor: 'nwse-resize',
    background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.08) 50%)',
    borderBottomRightRadius: '12px',
    zIndex: 10,
  },
}

// Inject hover styles
if (typeof document !== 'undefined' && !document.querySelector('#occupancy-panel-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'occupancy-panel-styles'
  styleSheet.textContent = `
    .occ-row-hover:hover {
      background-color: rgba(0, 0, 0, 0.03) !important;
    }
    .occ-close-btn:hover {
      background-color: rgba(0, 0, 0, 0.05);
      color: #1d1d1f !important;
    }
    .occ-secondary-btn:hover {
      background-color: rgba(0, 0, 0, 0.08) !important;
    }
  `
  document.head.appendChild(styleSheet)
}

export default OccupancyPanel
