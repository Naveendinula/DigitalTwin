import React, { useEffect, useCallback, useState } from 'react'

/**
 * SectionPlanePanel Component
 * 
 * Compact control panel for section plane manipulation.
 * Provides nudge controls, align view, change plane, and reset functionality.
 * Matches the existing UI aesthetic.
 * 
 * @param {boolean} sectionModeEnabled - Whether section mode is active
 * @param {boolean} sectionPlanePickingEnabled - Whether clicking can pick a new plane
 * @param {object} activeSectionPlane - Current section plane state
 * @param {function} onNudge - Callback to nudge plane (delta)
 * @param {function} onAlignCamera - Callback to align camera to section
 * @param {function} onReset - Callback to clear section plane
 * @param {function} onResetOffset - Callback to reset offset to 0
 * @param {function} onToggleSectionMode - Callback to toggle section mode
 * @param {function} onChangePlane - Callback to enable plane picking mode
 * @param {boolean} sectionPlaneVisible - Whether plane visualization is visible
 * @param {function} onTogglePlaneVisibility - Callback to toggle plane visualization
 * @param {number} nudgeStep - Step size for nudge operations
 */
function SectionPlanePanel({
  sectionModeEnabled,
  sectionPlanePickingEnabled,
  activeSectionPlane,
  onNudge,
  onAlignCamera,
  onReset,
  onResetOffset,
  onToggleSectionMode,
  onChangePlane,
  sectionPlaneVisible,
  onTogglePlaneVisibility,
  sectionPlaneSize,
  onSectionPlaneSizeChange,
  nudgeStep = 0.5
}) {
  // Local state for custom step input
  const [customStep, setCustomStep] = useState(nudgeStep)
  
  // Update custom step when prop changes
  useEffect(() => {
    setCustomStep(nudgeStep)
  }, [nudgeStep])

  // Keyboard shortcut handler
  const handleKeyDown = useCallback((event) => {
    // Ignore if typing in an input
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return
    }

    // 'S' to toggle section mode
    if (event.key === 's' || event.key === 'S') {
      event.preventDefault()
      onToggleSectionMode?.()
      return
    }

    // Only handle other shortcuts if section mode is enabled
    if (!sectionModeEnabled) return

    switch (event.key) {
      case '[':
      case '{':
        // Nudge backward
        event.preventDefault()
        onNudge?.(-customStep)
        break
      case ']':
      case '}':
        // Nudge forward
        event.preventDefault()
        onNudge?.(customStep)
        break
      case 'Escape':
        // Reset/clear plane
        if (activeSectionPlane) {
          event.preventDefault()
          onReset?.()
        }
        break
      default:
        break
    }
  }, [sectionModeEnabled, activeSectionPlane, customStep, onToggleSectionMode, onNudge, onReset])

  // Register keyboard listener
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // Don't render if section mode is disabled
  if (!sectionModeEnabled) return null

  const hasPlane = !!activeSectionPlane
  const isLocked = hasPlane && !sectionPlanePickingEnabled
  const sourceLabel = activeSectionPlane?.sourceLabel || 'Surface'
  const currentOffset = activeSectionPlane?.offset || 0

  // Determine status message based on state
  const getStatusMessage = () => {
    if (!hasPlane) {
      return 'Click a surface to create a section plane.'
    }
    if (sectionPlanePickingEnabled) {
      return 'Shift+Click a surface to choose a new section plane.'
    }
    // Plane exists and is locked
    return (
      <>
        Plane locked from <strong>{sourceLabel}</strong>. 
        {' '}Use controls below, or <em>Shift+Click</em> to pick new surface.
      </>
    )
  }

  return (
    <div style={styles.panel}>
      {/* Panel Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <SectionIcon />
          <span style={styles.title}>Section Plane</span>
          {isLocked && (
            <span style={styles.lockedBadge} title="Plane is locked. Shift+Click to change.">
              <LockIcon />
            </span>
          )}
        </div>
        <button
          style={styles.closeButton}
          onClick={onToggleSectionMode}
          title="Close Section Mode (S)"
          aria-label="Close Section Mode"
        >
          <CloseIcon />
        </button>
      </div>

      {/* Status Line */}
      <div style={styles.status}>
        {hasPlane ? (
          <>
            <span style={isLocked ? styles.statusDotLocked : styles.statusDot} />
            <span style={styles.statusText}>{getStatusMessage()}</span>
          </>
        ) : (
          <>
            <span style={sectionPlanePickingEnabled ? styles.statusDotPicking : styles.statusDotInactive} />
            <span style={styles.statusText}>{getStatusMessage()}</span>
          </>
        )}
      </div>

      {/* Controls - only show when plane exists */}
      {hasPlane && (
        <>
          {/* Nudge Controls */}
          <div style={styles.controlGroup}>
            <span style={styles.controlLabel}>Move Plane</span>
            <div style={styles.nudgeControls}>
              <button
                style={styles.nudgeButton}
                onClick={() => onNudge?.(-customStep)}
                title={`Move plane backward by ${customStep.toFixed(1)} ([ key)`}
                aria-label="Move plane backward"
              >
                <MinusIcon />
                <span style={styles.nudgeLabel}>Back</span>
              </button>
              
              <div style={styles.offsetDisplay}>
                <span style={styles.offsetValue}>{currentOffset.toFixed(2)}</span>
                <span style={styles.offsetUnit}>offset</span>
              </div>
              
              <button
                style={styles.nudgeButton}
                onClick={() => onNudge?.(customStep)}
                title={`Move plane forward by ${customStep.toFixed(1)} (] key)`}
                aria-label="Move plane forward"
              >
                <PlusIcon />
                <span style={styles.nudgeLabel}>Fwd</span>
              </button>
            </div>
          </div>

          {/* Step Size Control */}
          <div style={styles.stepControl}>
            <span style={styles.stepLabel}>Step:</span>
            <input
              type="number"
              style={styles.stepInput}
              value={customStep}
              onChange={(e) => setCustomStep(Math.max(0.01, parseFloat(e.target.value) || 0.1))}
              min="0.01"
              step="0.1"
              title="Nudge step size"
            />
          </div>

          {/* Plane Size Control */}
          <div style={styles.stepControl}>
            <span style={styles.stepLabel}>Size:</span>
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={sectionPlaneSize || 100}
              onChange={(e) => onSectionPlaneSizeChange?.(parseFloat(e.target.value))}
              style={{ flex: 1, margin: '0 8px', cursor: 'pointer' }}
              title="Adjust plane visualization size"
            />
            <span style={styles.stepLabel} style={{ minWidth: '30px', textAlign: 'right' }}>
              {Math.round(sectionPlaneSize || 100)}
            </span>
          </div>

          {/* Action Buttons - Row 1 */}
          <div style={styles.actions}>
            <button
              style={styles.actionButton}
              onClick={onResetOffset}
              title="Reset offset to original position"
              aria-label="Reset plane offset"
            >
              <ResetOffsetIcon />
              <span>Reset Offset</span>
            </button>
          </div>
          
          {/* Action Buttons - Row 2 */}
          <div style={styles.actionsSecondary}>
            <button
              style={sectionPlanePickingEnabled ? styles.actionButtonActive : styles.actionButtonPrimary}
              onClick={onChangePlane}
              title="Pick a new section plane surface (Shift+Click also works)"
              aria-label="Change section plane"
            >
              <PickIcon />
              <span>{sectionPlanePickingEnabled ? 'Click Surface...' : 'Change Plane'}</span>
            </button>
            
            <button
              style={styles.actionButton}
              onClick={onTogglePlaneVisibility}
              title={sectionPlaneVisible ? "Hide plane visualization" : "Show plane visualization"}
              aria-label="Toggle plane visibility"
            >
              {sectionPlaneVisible ? <EyeIcon /> : <EyeOffIcon />}
              <span>{sectionPlaneVisible ? 'Hide Plane' : 'Show Plane'}</span>
            </button>

            <button
              style={styles.actionButtonDanger}
              onClick={onReset}
              title="Clear section plane (Esc key)"
              aria-label="Clear section plane"
            >
              <ClearIcon />
              <span>Clear</span>
            </button>
          </div>
        </>
      )}

      {/* Keyboard Shortcuts Help */}
      <div style={styles.shortcuts}>
        <span style={styles.shortcutHint}>
          <kbd style={styles.kbd}>S</kbd> toggle
          {hasPlane && (
            <>
              {' · '}
              <kbd style={styles.kbd}>[</kbd><kbd style={styles.kbd}>]</kbd> move
              {' · '}
              <kbd style={styles.kbd}>Esc</kbd> clear
            </>
          )}
        </span>
      </div>
    </div>
  )
}

// Icons
function SectionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
      <line x1="4" y1="9.5" x2="20" y2="9.5" strokeWidth="2" strokeDasharray="2 2" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

function PickIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
      <path d="M13 13l6 6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function AlignViewIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function ResetOffsetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  )
}

function ClearIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

// Styles
const styles = {
  panel: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    width: '260px',
    background: '#ffffff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.12)',
    border: '1px solid #e5e5e7',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    zIndex: 20,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid #e5e5e7',
    background: '#fafafa',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: '#1d1d1f',
  },
  title: {
    fontSize: '13px',
    fontWeight: 600,
    letterSpacing: '0.3px',
  },
  lockedBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2px',
    color: '#86868b',
  },
  closeButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    background: 'transparent',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    color: '#86868b',
    transition: 'all 0.15s ease',
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 14px',
    borderBottom: '1px solid #f0f0f2',
  },
  statusDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#34c759',
    flexShrink: 0,
  },
  statusDotLocked: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#007aff',
    flexShrink: 0,
  },
  statusDotPicking: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#ff9500',
    flexShrink: 0,
    animation: 'pulse 1.5s infinite',
  },
  statusDotInactive: {
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    background: '#86868b',
    flexShrink: 0,
  },
  statusText: {
    fontSize: '12px',
    color: '#1d1d1f',
    lineHeight: 1.4,
  },
  controlGroup: {
    padding: '12px 14px',
    borderBottom: '1px solid #f0f0f2',
  },
  controlLabel: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
    marginBottom: '8px',
  },
  nudgeControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  nudgeButton: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '8px 12px',
    background: '#f5f5f7',
    border: '1px solid #e5e5e7',
    borderRadius: '6px',
    cursor: 'pointer',
    color: '#1d1d1f',
    transition: 'all 0.15s ease',
    minWidth: '60px',
  },
  nudgeLabel: {
    fontSize: '10px',
    fontWeight: 500,
    color: '#86868b',
  },
  offsetDisplay: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '4px 8px',
    background: '#f5f5f7',
    borderRadius: '4px',
    minWidth: '60px',
  },
  offsetValue: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1d1d1f',
    fontFamily: "'SF Mono', 'Monaco', monospace",
  },
  offsetUnit: {
    fontSize: '9px',
    color: '#86868b',
    textTransform: 'uppercase',
  },
  stepControl: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 14px',
    borderBottom: '1px solid #f0f0f2',
  },
  stepLabel: {
    fontSize: '11px',
    color: '#86868b',
  },
  stepInput: {
    width: '60px',
    padding: '4px 8px',
    fontSize: '12px',
    border: '1px solid #e5e5e7',
    borderRadius: '4px',
    fontFamily: "'SF Mono', 'Monaco', monospace",
    textAlign: 'center',
  },
  actions: {
    display: 'flex',
    gap: '6px',
    padding: '12px 14px 6px 14px',
  },
  actionsSecondary: {
    display: 'flex',
    gap: '6px',
    padding: '6px 14px 12px 14px',
    borderBottom: '1px solid #f0f0f2',
  },
  actionButton: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 6px',
    background: '#f5f5f7',
    border: '1px solid #e5e5e7',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    color: '#1d1d1f',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  actionButtonPrimary: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 6px',
    background: '#e8f4fd',
    border: '1px solid #90caf9',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    color: '#1565c0',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  actionButtonActive: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 6px',
    background: '#1565c0',
    border: '1px solid #1565c0',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    color: '#ffffff',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  actionButtonDanger: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '8px 6px',
    background: '#fff5f5',
    border: '1px solid #ffcdd2',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 500,
    color: '#d32f2f',
    transition: 'all 0.15s ease',
    fontFamily: 'inherit',
  },
  shortcuts: {
    padding: '8px 14px',
    background: '#fafafa',
  },
  shortcutHint: {
    fontSize: '10px',
    color: '#86868b',
  },
  kbd: {
    display: 'inline-block',
    padding: '1px 4px',
    background: '#e5e5e7',
    borderRadius: '3px',
    fontSize: '9px',
    fontFamily: "'SF Mono', 'Monaco', monospace",
    fontWeight: 500,
    color: '#1d1d1f',
    marginRight: '2px',
  },
}

// Add hover styles
const styleSheet = document.createElement('style')
styleSheet.textContent = `
  .section-panel-btn:hover {
    background: #e8e8ed !important;
    border-color: #d1d1d6 !important;
  }
  .section-panel-btn:active {
    transform: scale(0.98);
  }
  .section-panel-close:hover {
    background: #e5e5e7 !important;
    color: #1d1d1f !important;
  }
  .section-panel-danger:hover {
    background: #ffebee !important;
    border-color: #ef9a9a !important;
  }
`
if (typeof document !== 'undefined' && !document.querySelector('#section-panel-styles')) {
  styleSheet.id = 'section-panel-styles'
  document.head.appendChild(styleSheet)
}

export default SectionPlanePanel
