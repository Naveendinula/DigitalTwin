import React from 'react'

/**
 * AxisViewWidget Component
 * 
 * A small interactive 3D axis indicator that allows users to click
 * on axis directions to change the camera view mode.
 * 
 * Positioned in the bottom-right corner of the viewport.
 * Matches the existing UI aesthetic with clean, minimal design.
 * 
 * Coordinate system (BIM/architectural convention, Z-up):
 * - X: Left(-) / Right(+) - Red
 * - Y: Back(-) / Front(+) - Green  
 * - Z: Down(-) / Up(+) - Blue
 * 
 * @param {string} viewMode - Current view mode ('free', 'top', 'front', etc.)
 * @param {function} onSetViewMode - Callback to set view mode
 */
function AxisViewWidget({ viewMode = 'free', onSetViewMode }) {
  
  /**
   * Handle click on an axis face/direction
   */
  const handleAxisClick = (mode) => {
    onSetViewMode?.(mode)
  }

  /**
   * Get highlight style for active view
   */
  const isActive = (mode) => viewMode === mode

  return (
    <div style={styles.container}>
      {/* Main cube widget */}
      <div style={styles.widget}>
        {/* SVG-based axis cube visualization */}
        <svg 
          width="100" 
          height="100" 
          viewBox="0 0 100 100"
          style={styles.svg}
        >
          {/* Background circle */}
          <circle 
            cx="50" 
            cy="50" 
            r="48" 
            fill="#ffffff"
            stroke="#e5e5e7"
            strokeWidth="1"
          />
          
          {/* Cube faces - clickable regions */}
          {/* These are positioned to create an isometric-like cube view */}
          
          {/* Top face (+Z) - Blue */}
          <g 
            style={styles.clickableGroup}
            onClick={() => handleAxisClick('top')}
          >
            <polygon
              points="50,15 75,30 50,45 25,30"
              fill={isActive('top') ? '#3B82F6' : '#93C5FD'}
              stroke="#2563EB"
              strokeWidth="1.5"
              style={styles.face}
            />
            <text
              x="50"
              y="33"
              textAnchor="middle"
              style={styles.faceLabel}
              fill={isActive('top') ? '#ffffff' : '#1E40AF'}
            >
              TOP
            </text>
          </g>
          
          {/* Front face (-Y) - Green */}
          <g 
            style={styles.clickableGroup}
            onClick={() => handleAxisClick('front')}
          >
            <polygon
              points="25,30 50,45 50,70 25,55"
              fill={isActive('front') ? '#22C55E' : '#86EFAC'}
              stroke="#16A34A"
              strokeWidth="1.5"
              style={styles.face}
            />
            <text
              x="37"
              y="52"
              textAnchor="middle"
              style={{...styles.faceLabel, fontSize: '7px'}}
              fill={isActive('front') ? '#ffffff' : '#166534'}
            >
              FRONT
            </text>
          </g>
          
          {/* Right face (+X) - Red */}
          <g 
            style={styles.clickableGroup}
            onClick={() => handleAxisClick('right')}
          >
            <polygon
              points="50,45 75,30 75,55 50,70"
              fill={isActive('right') ? '#EF4444' : '#FCA5A5'}
              stroke="#DC2626"
              strokeWidth="1.5"
              style={styles.face}
            />
            <text
              x="63"
              y="52"
              textAnchor="middle"
              style={{...styles.faceLabel, fontSize: '7px'}}
              fill={isActive('right') ? '#ffffff' : '#991B1B'}
            >
              RIGHT
            </text>
          </g>
        </svg>
        
        {/* Axis labels around the cube */}
        <div style={styles.axisLabels}>
          {/* +X (Right) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonRight,
              ...(isActive('right') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('right') ? '#EF4444' : undefined,
            }}
            onClick={() => handleAxisClick('right')}
            title="Right view (+X) — Press 4"
          >
            +X
          </button>
          
          {/* -X (Left) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonLeft,
              ...(isActive('left') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('left') ? '#EF4444' : undefined,
            }}
            onClick={() => handleAxisClick('left')}
            title="Left view (-X) — Press 5"
          >
            -X
          </button>
          
          {/* +Y (Back) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonBack,
              ...(isActive('back') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('back') ? '#22C55E' : undefined,
            }}
            onClick={() => handleAxisClick('back')}
            title="Back view (+Y) — Press 6"
          >
            +Y
          </button>
          
          {/* -Y (Front) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonFront,
              ...(isActive('front') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('front') ? '#22C55E' : undefined,
            }}
            onClick={() => handleAxisClick('front')}
            title="Front view (-Y) — Press 3"
          >
            -Y
          </button>
          
          {/* +Z (Top) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonTop,
              ...(isActive('top') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('top') ? '#3B82F6' : undefined,
            }}
            onClick={() => handleAxisClick('top')}
            title="Top view (+Z) — Press 2"
          >
            +Z
          </button>
          
          {/* -Z (Bottom) */}
          <button
            style={{
              ...styles.axisButton,
              ...styles.axisButtonBottom,
              ...(isActive('bottom') ? styles.axisButtonActive : {}),
              backgroundColor: isActive('bottom') ? '#3B82F6' : undefined,
            }}
            onClick={() => handleAxisClick('bottom')}
            title="Bottom view (-Z) — Press 7"
          >
            -Z
          </button>
        </div>
      </div>
      
      {/* Current view label - clickable to return to free mode */}
      <button 
        style={{
          ...styles.viewLabel,
          ...(viewMode === 'free' ? styles.viewLabelActive : {}),
        }}
        onClick={() => handleAxisClick('free')}
        title="Return to Free Orbit view — Press 1"
      >
        {viewMode === 'free' ? '🔄 Free View' : viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
        {viewMode !== 'free' && <span style={styles.returnHint}> (click for free)</span>}
      </button>
    </div>
  )
}

/**
 * Styles following the existing UI patterns
 */
const styles = {
  container: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    zIndex: 10,
    pointerEvents: 'none', // Allow clicks to pass through container
  },
  widget: {
    position: 'relative',
    width: '120px',
    height: '120px',
    pointerEvents: 'auto', // Re-enable pointer events on widget
  },
  svg: {
    position: 'absolute',
    top: '10px',
    left: '10px',
    filter: 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))',
  },
  clickableGroup: {
    cursor: 'pointer',
  },
  face: {
    transition: 'fill 0.15s ease, transform 0.15s ease',
    cursor: 'pointer',
  },
  faceLabel: {
    fontSize: '8px',
    fontWeight: 600,
    fontFamily: 'inherit',
    pointerEvents: 'none',
    userSelect: 'none',
  },
  axisLabels: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  axisButton: {
    position: 'absolute',
    width: '24px',
    height: '18px',
    padding: '2px 4px',
    fontSize: '9px',
    fontWeight: 600,
    fontFamily: 'inherit',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '4px',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    color: '#1d1d1f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  axisButtonActive: {
    color: '#ffffff',
    borderColor: 'transparent',
  },
  axisButtonRight: {
    right: '0',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  axisButtonLeft: {
    left: '0',
    top: '50%',
    transform: 'translateY(-50%)',
  },
  axisButtonTop: {
    top: '0',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  axisButtonBottom: {
    bottom: '0',
    left: '50%',
    transform: 'translateX(-50%)',
  },
  axisButtonFront: {
    bottom: '20px',
    left: '8px',
  },
  axisButtonBack: {
    top: '20px',
    right: '8px',
  },
  viewLabel: {
    padding: '4px 10px',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 500,
    color: '#6b7280',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
    fontFamily: 'inherit',
    pointerEvents: 'auto',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  viewLabelActive: {
    background: '#1d1d1f',
    color: '#ffffff',
    borderColor: '#1d1d1f',
  },
  returnHint: {
    fontSize: '9px',
    opacity: 0.6,
  },
}

// Add hover styles
if (typeof document !== 'undefined' && !document.querySelector('#axis-widget-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'axis-widget-styles'
  styleSheet.textContent = `
    /* Hover effects for axis buttons */
    [title*="view"]:hover {
      transform: scale(1.1) !important;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15) !important;
    }
    
    /* Hover effects for cube faces */
    svg g[style*="cursor"]:hover polygon {
      filter: brightness(0.95);
    }
  `
  document.head.appendChild(styleSheet)
}

export default AxisViewWidget
