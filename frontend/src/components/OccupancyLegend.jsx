import React from 'react'

/**
 * OccupancyLegend Component
 *
 * Compact floating legend showing occupancy color scale and building totals.
 * Always visible when occupancy mode is enabled.
 * 
 * Follows the "Arctic Zen" aesthetic - clean, minimal, translucent.
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
        <span style={styles.totalValue}>{totalOccupancy.toLocaleString()}</span>
        <span style={styles.totalDivider}>/</span>
        <span style={styles.totalCapacity}>{totalCapacity.toLocaleString()}</span>
        <span style={styles.percentBadge}>{percent}%</span>
      </div>

      <div style={styles.gradientContainer}>
        <div style={styles.gradient}></div>
        <div style={styles.gradientLabels}>
          <span>Empty</span>
          <span>Full</span>
        </div>
      </div>
    </div>
  )
}

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';

const styles = {
  container: {
    position: 'absolute',
    bottom: '20px',
    left: '20px',
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    padding: '14px 18px',
    boxShadow: softShadow,
    zIndex: 100,
    minWidth: '160px',
    fontFamily: 'inherit',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
  },
  liveIndicator: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  liveDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: '#34c759',
    boxShadow: '0 0 6px rgba(52, 199, 89, 0.4)',
    animation: 'occupancy-pulse 2s ease-in-out infinite',
  },
  liveText: {
    fontSize: '9px',
    fontWeight: 600,
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
    gap: '3px',
    marginBottom: '12px',
  },
  totalValue: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1d1d1f',
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '-0.5px',
  },
  totalDivider: {
    fontSize: '16px',
    color: '#c7c7cc',
    marginLeft: '2px',
    marginRight: '2px',
  },
  totalCapacity: {
    fontSize: '14px',
    color: '#86868b',
    fontVariantNumeric: 'tabular-nums',
  },
  percentBadge: {
    marginLeft: 'auto',
    padding: '3px 8px',
    borderRadius: '6px',
    backgroundColor: '#e8e8ec',
    fontSize: '12px',
    fontWeight: 500,
    color: '#424245',
    fontVariantNumeric: 'tabular-nums',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.08)',
  },
  gradientContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
  },
  gradient: {
    height: '6px',
    borderRadius: '3px',
    background: 'linear-gradient(to right, #4cd964, #ffcc00, #ff3b30)',
    opacity: 0.85,
  },
  gradientLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '9px',
    color: '#86868b',
    fontWeight: 500,
  },
}

// Inject pulse animation
if (typeof document !== 'undefined' && !document.querySelector('#occupancy-legend-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'occupancy-legend-styles'
  styleSheet.textContent = `
    @keyframes occupancy-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.6; transform: scale(0.9); }
    }
  `
  document.head.appendChild(styleSheet)
}

export default OccupancyLegend
