import React from 'react'

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
 */
function ViewerToolbar({ 
  sectionModeEnabled, 
  onToggleSectionMode,
  hasSectionPlane,
  onClearSectionPlane,
  onAlignCamera
}) {
  return (
    <div style={styles.toolbar}>
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

      {/* Align View Button - only show when there's an active plane */}
      {hasSectionPlane && (
        <button
          style={styles.toolButton}
          onClick={onAlignCamera}
          title="Align Camera to Section Plane"
        >
          <AlignViewIcon />
          <span style={styles.toolLabel}>Align View</span>
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
  toolButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '10px 14px',
    background: '#ffffff',
    border: '1px solid #e5e5e7',
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
`
if (typeof document !== 'undefined' && !document.querySelector('#viewer-toolbar-styles')) {
  styleSheet.id = 'viewer-toolbar-styles'
  document.head.appendChild(styleSheet)
}

export default ViewerToolbar
