import React, { useState, useEffect, useRef } from 'react'

/**
 * ViewerToolbar Component
 * 
 * Toolbar overlay for the 3D viewer with tool buttons.
 * Matches the existing UI aesthetic with clean, minimal design.
 * 
 * @param {boolean} sectionModeEnabled - Whether section mode is currently active
 * @param {function} onToggleSectionMode - Callback to toggle section mode
 * @param {boolean} hasSectionPlane - Whether a section plane is currently active
 * @param {function} onClearSectionPlane - Callback to clear the section plane
 * @param {function} onAlignCamera - Callback to align camera to section plane
 * @param {string} viewMode - Current view mode ('free', 'top', 'front', etc.)
 * @param {function} onSetViewMode - Callback to set view mode
 * @param {Array} availableViews - Array of { mode, label } for available views
 * @param {function} onResetView - Callback to reset view to default perspective
 * @param {function} onFitToModel - Callback to fit camera to model bounds
 */
function ViewerToolbar({ 
  sectionModeEnabled, 
  onToggleSectionMode,
  hasSectionPlane,
  onClearSectionPlane,
  onAlignCamera,
  viewMode = 'free',
  onSetViewMode,
  availableViews = [],
  onResetView,
  onFitToModel,
  onOpenEcPanel,
  onOpenHvacPanel,
  onToggleSpaceOverlay,
  spaceOverlayEnabled,
  onToggleOccupancy,
  occupancyEnabled,
  onOpenOccupancyPanel,
  hasModel
}) {
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef(null)
  
  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (viewMenuRef.current && !viewMenuRef.current.contains(event.target)) {
        setViewMenuOpen(false)
      }
    }
    
    if (viewMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [viewMenuOpen])
  return (
    <div style={styles.toolbar}>
      {/* View Mode Dropdown */}
      <div style={styles.viewModeContainer} ref={viewMenuRef}>
        <button
          style={{
            ...styles.toolButton,
            ...(viewMenuOpen ? styles.toolButtonActive : {})
          }}
          onClick={() => setViewMenuOpen(!viewMenuOpen)}
          title="View Presets"
        >
          <ViewCubeIcon />
          <span style={{
            ...styles.toolLabel,
            ...(viewMenuOpen ? styles.toolLabelActive : {})
          }}>
            {viewMode === 'free' ? 'View' : viewMode.charAt(0).toUpperCase() + viewMode.slice(1)}
          </span>
        </button>
        
        {/* Dropdown Menu */}
        {viewMenuOpen && (
          <div style={styles.viewMenu}>
            {availableViews.map(({ mode, label }) => (
              <button
                key={mode}
                style={{
                  ...styles.viewMenuItem,
                  ...(viewMode === mode ? styles.viewMenuItemActive : {})
                }}
                onClick={() => {
                  onSetViewMode?.(mode)
                  setViewMenuOpen(false)
                }}
              >
                {label}
                {viewMode === mode && <CheckIcon />}
              </button>
            ))}
            <div style={styles.viewMenuDivider} />
            <button
              style={styles.viewMenuItem}
              onClick={() => {
                onFitToModel?.()
                setViewMenuOpen(false)
              }}
            >
              <FitIcon />
              <span style={{ marginLeft: '8px' }}>Fit All</span>
            </button>
            <button
              style={styles.viewMenuItem}
              onClick={() => {
                onResetView?.()
                setViewMenuOpen(false)
              }}
            >
              <ResetIcon />
              <span style={{ marginLeft: '8px' }}>Reset View</span>
            </button>
          </div>
        )}
      </div>

      {/* Section Mode Button */}
      <button
        style={{
          ...styles.toolButton,
          ...(sectionModeEnabled ? styles.toolButtonActive : {})
        }}
        onClick={onToggleSectionMode}
        title={sectionModeEnabled ? 'Disable Section Mode' : 'Enable Section Mode'}
      >
        <SectionIcon active={sectionModeEnabled} />
        <span style={{
          ...styles.toolLabel,
          ...(sectionModeEnabled ? styles.toolLabelActive : {})
        }}>Section</span>
      </button>

      {/* Embodied Carbon Button */}
      {hasModel && (
        <button
          style={styles.toolButton}
          onClick={onOpenEcPanel}
          title="Calculate Embodied Carbon"
        >
          <LeafIcon />
          <span style={styles.toolLabel}>Carbon</span>
        </button>
      )}

      {/* HVAC/FM Button */}
      {hasModel && (
        <button
          style={styles.toolButton}
          onClick={onOpenHvacPanel}
          title="Analyze HVAC/FM"
        >
          <FanIcon />
          <span style={styles.toolLabel}>HVAC/FM</span>
        </button>
      )}

      {/* Spaces Overlay Toggle */}
      {hasModel && (
        <button
          style={{
            ...styles.toolButton,
            ...(spaceOverlayEnabled ? styles.toolButtonActive : {})
          }}
          onClick={onToggleSpaceOverlay}
          title="Show Spaces"
        >
          <BoxIcon active={spaceOverlayEnabled} />
          <span style={{
            ...styles.toolLabel,
            ...(spaceOverlayEnabled ? styles.toolLabelActive : {})
          }}>
            Spaces
          </span>
        </button>
      )}

      {/* Occupancy Toggle */}
      {hasModel && (
        <button
          style={{
            ...styles.toolButton,
            ...(occupancyEnabled ? styles.toolButtonActive : {})
          }}
          onClick={onToggleOccupancy}
          title={occupancyEnabled ? 'Stop Occupancy Simulation' : 'Start Occupancy Simulation'}
        >
          <PeopleIcon active={occupancyEnabled} />
          <span style={{
            ...styles.toolLabel,
            ...(occupancyEnabled ? styles.toolLabelActive : {})
          }}>
            Occupancy
          </span>
        </button>
      )}

      {/* Occupancy Panel Button */}
      {hasModel && occupancyEnabled && (
        <button
          style={styles.toolButton}
          onClick={onOpenOccupancyPanel}
          title="Occupancy Details"
        >
          <ChartIcon />
          <span style={styles.toolLabel}>Details</span>
        </button>
      )}

      {/* Clear Section Plane Button - only show when there's an active plane */}
      {hasSectionPlane && (
        <button
          style={styles.toolButton}
          onClick={onClearSectionPlane}
          title="Clear Section Plane"
        >
          <ClearIcon />
          <span style={styles.toolLabel}>Clear</span>
        </button>
      )}
    </div>
  )
}

/**
 * View Cube Icon - 3D cube for view presets
 */
function ViewCubeIcon() {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 3D Cube */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
      <path d="M12 22V12" />
      <path d="M2 7v10" />
      <path d="M22 7v10" />
    </svg>
  )
}

/**
 * Check Icon - Checkmark for selected item
 */
function CheckIcon() {
  return (
    <svg 
      width="14" 
      height="14" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/**
 * Leaf Icon - For Embodied Carbon
 */
function LeafIcon() {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  )
}

/**
 * Fan Icon - For HVAC/FM
 */
function FanIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="2" />
      <path d="M12 4c2 0 3 1 3 3-2 0-3 1-3 3-2 0-3-1-3-3 0-2 1-3 3-3Z" />
      <path d="M20 12c0 2-1 3-3 3 0-2-1-3-3-3 0-2 1-3 3-3 2 0 3 1 3 3Z" />
      <path d="M12 20c-2 0-3-1-3-3 2 0 3-1 3-3 2 0 3 1 3 3 0 2-1 3-3 3Z" />
      <path d="M4 12c0-2 1-3 3-3 0 2 1 3 3 3 0 2-1 3-3 3-2 0-3-1-3-3Z" />
    </svg>
  )
}

/**
 * Box Icon - For space overlays
 */
function BoxIcon({ active }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#ffffff' : '#1d1d1f'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  )
}

/**
 * Fit Icon - Arrows pointing out/maximize
 */
function FitIcon() {
  return (
    <svg 
      width="14" 
      height="14" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  )
}

/**
 * Reset Icon - Return/reset arrow
 */
function ResetIcon() {
  return (
    <svg 
      width="14" 
      height="14" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  )
}

/**
 * Section Icon - Slice/cutting plane icon
 */
function SectionIcon({ active }) {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke={active ? '#ffffff' : '#1d1d1f'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Cube outline */}
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
      {/* Cutting plane line */}
      <line x1="4" y1="9.5" x2="20" y2="9.5" strokeWidth="2" strokeDasharray="2 2" />
    </svg>
  )
}

/**
 * Align View Icon - Camera/eye looking at plane
 */
function AlignViewIcon() {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Eye/camera */}
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {/* Arrow indicating direction */}
      <line x1="12" y1="5" x2="12" y2="2" />
      <polyline points="9 4 12 1 15 4" />
    </svg>
  )
}

/**
 * Clear Icon - X/remove icon
 */
function ClearIcon() {
  return (
    <svg 
      width="20" 
      height="20" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/**
 * People Icon - For occupancy visualization
 */
function PeopleIcon({ active }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? '#ffffff' : '#1d1d1f'}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

/**
 * Chart Icon - For occupancy details panel
 */
function ChartIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#1d1d1f"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

/**
 * Styles
 */
const styles = {
  toolbar: {
    position: 'absolute',
    top: '16px',
    left: '16px',
    display: 'flex',
    gap: '8px',
    zIndex: 10,
  },
  viewModeContainer: {
    position: 'relative',
  },
  viewMenu: {
    position: 'absolute',
    top: 'calc(100% + 8px)',
    left: '0',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '8px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
    padding: '4px',
    minWidth: '120px',
    zIndex: 20,
  },
  viewMenuItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '8px 12px',
    background: 'transparent',
    borderWidth: '0',
    borderStyle: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: 500,
    color: '#1d1d1f',
    textAlign: 'left',
    transition: 'background 0.15s ease',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  viewMenuItemActive: {
    background: '#f0f0f2',
    color: '#1d1d1f',
  },
  viewMenuDivider: {
    height: '1px',
    background: '#e5e5e7',
    margin: '4px 0',
  },
  toolButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '10px 14px',
    background: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#e5e5e7',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  toolButtonActive: {
    background: '#1d1d1f',
    borderColor: '#1d1d1f',
  },
  toolLabel: {
    fontSize: '11px',
    fontWeight: 500,
    color: '#1d1d1f',
  },
  toolLabelActive: {
    color: '#ffffff',
  },
}

// Add hover styles via CSS-in-JS workaround
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  .viewer-tool-button:hover {
    background: #f5f5f7 !important;
    border-color: #d1d1d6 !important;
  }
  .viewer-tool-button.active:hover {
    background: #333333 !important;
    border-color: #333333 !important;
  }
  /* View menu item hover */
  [data-view-menu-item]:hover {
    background: #f5f5f7 !important;
  }
`
if (typeof document !== 'undefined' && !document.querySelector('#viewer-toolbar-styles')) {
  styleSheet.id = 'viewer-toolbar-styles'
  document.head.appendChild(styleSheet)
}

export default ViewerToolbar
