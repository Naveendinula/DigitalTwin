import React from 'react'

/**
 * OccupancyLegend Component
 *
 * Compact floating legend showing occupancy color scale and building totals.
 * Always visible when occupancy mode is enabled.
 */
function OccupancyLegend({ totals, timestamp, visible }) {
  if (!visible) return null

  const { totalOccupancy = 0, totalCapacity = 0 } = totals || {}
  const percent = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0

  // Format timestamp
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--'

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.liveIndicator}>
          <span style={styles.liveDot}></span>
          <span style={styles.liveText}>LIVE</span>
        </div>
        <span style={styles.time}>{timeStr}</span>
      </div>

      <div style={styles.totalsRow}>
        <span style={styles.peopleIcon}>👥</span>
        <span style={styles.totalValue}>{totalOccupancy.toLocaleString()}</span>
        <span style={styles.totalDivider}>/</span>
        <span style={styles.totalCapacity}>{totalCapacity.toLocaleString()}</span>
        <span style={styles.percentBadge}>{percent}%</span>
      </div>

      <div style={styles.gradientContainer}>
        <div style={styles.gradient}></div>
        <div style={styles.gradientLabels}>
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    borderRadius: '12px',
    padding: '12px 16px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
    border: '1px solid rgba(0, 0, 0, 0.08)',
    zIndex: 100,
    minWidth: '180px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  liveDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    backgroundColor: '#34c759',
    animation: 'pulse 2s infinite',
  },
  liveText: {
    fontSize: '10px',
    fontWeight: 700,
    color: '#34c759',
    letterSpacing: '0.5px',
  },
  time: {
    fontSize: '11px',
    color: '#86868b',
    fontVariantNumeric: 'tabular-nums',
  },
  totalsRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    marginBottom: '10px',
  },
  peopleIcon: {
    fontSize: '16px',
    marginRight: '4px',
  },
  totalValue: {
    fontSize: '22px',
    fontWeight: 600,
    color: '#1d1d1f',
    fontVariantNumeric: 'tabular-nums',
  },
  totalDivider: {
    fontSize: '16px',
    color: '#86868b',
  },
  totalCapacity: {
    fontSize: '16px',
    color: '#86868b',
    fontVariantNumeric: 'tabular-nums',
  },
  percentBadge: {
    marginLeft: '8px',
    padding: '2px 8px',
    borderRadius: '10px',
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    fontSize: '12px',
    fontWeight: 500,
    color: '#1d1d1f',
  },
  gradientContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  gradient: {
    height: '8px',
    borderRadius: '4px',
    background: 'linear-gradient(to right, #00c832, #c8c800, #ff3232)',
  },
  gradientLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    color: '#86868b',
  },
}

// Inject pulse animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `
  document.head.appendChild(styleSheet)
}

export default OccupancyLegend
