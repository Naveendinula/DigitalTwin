import React from 'react'

/**
 * SectionModeHint Component
 * 
 * Displays contextual guidance text when section mode is active.
 * Shows at the bottom of the viewer as a supplementary hint.
 * 
 * Note: The main controls are in SectionPlanePanel. This hint provides
 * a quick contextual reminder at the bottom of the viewport.
 * 
 * @param {boolean} sectionModeEnabled - Whether section mode is currently active
 * @param {boolean} hasSectionPlane - Whether a section plane exists
 * @param {boolean} [pickingEnabled] - Whether plane picking is currently enabled
 * @param {string} [sourceLabel] - Label of the source element (IFC type/name)
 */
function SectionModeHint({ sectionModeEnabled, hasSectionPlane, pickingEnabled, sourceLabel }) {
  // Don't show anything if section mode is disabled
  if (!sectionModeEnabled) return null

  // Determine the hint text based on state
  let hintText
  if (!hasSectionPlane) {
    hintText = 'Click a building surface to create a section plane.'
  } else if (pickingEnabled) {
    hintText = 'Click or Shift+Click a surface to pick new section plane.'
  } else {
    // Plane exists and is locked
    hintText = `Plane locked • Shift+Click to change surface`
  }

  return (
    <div style={styles.container}>
      <div style={styles.hint}>
        <SectionHintIcon active={hasSectionPlane} picking={pickingEnabled} />
        <span style={styles.text}>{hintText}</span>
      </div>
    </div>
  )
}

/**
 * Small hint icon
 */
function SectionHintIcon({ active, picking }) {
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
      style={{ flexShrink: 0 }}
    >
      {active && !picking ? (
        // Lock icon when plane is locked
        <>
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </>
      ) : picking ? (
        // Cursor/pointer when picking is enabled
        <>
          <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          <path d="M13 13l6 6" />
        </>
      ) : (
        // Info icon when waiting for first click
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </>
      )}
    </svg>
  )
}

/**
 * Styles
 */
const styles = {
  container: {
    position: 'absolute',
    bottom: '16px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 10,
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 16px',
    background: '#1d1d1f',
    color: '#ffffff',
    borderRadius: '10px',
    fontSize: '13px',
    fontWeight: 500,
    fontFamily: 'inherit',
    boxShadow: 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.4) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.3) 2px 2px 6px',
    maxWidth: '500px',
  },
  text: {
    opacity: 0.95,
  },
}

export default SectionModeHint
