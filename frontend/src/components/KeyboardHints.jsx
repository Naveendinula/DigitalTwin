import React, { useState, useEffect } from 'react'

/**
 * KeyboardHints Component
 * 
 * Shows available keyboard shortcuts in a subtle tooltip.
 * Auto-hides after first interaction.
 */
function KeyboardHints() {
  const [visible, setVisible] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  
  // Auto-hide after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false)
    }, 10000)
    return () => clearTimeout(timer)
  }, [])
  
  // Hide on any keypress
  useEffect(() => {
    const handleKeyDown = () => {
      setDismissed(true)
      setVisible(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
  
  if (dismissed || !visible) return null
  
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="M6 8h.01M10 8h.01M14 8h.01M18 8h.01" />
          <path d="M6 12h.01M10 12h.01M14 12h.01M18 12h.01" />
          <path d="M6 16h12" />
        </svg>
        <span>Keyboard Shortcuts</span>
      </div>
      <div style={styles.shortcuts}>
        <div style={styles.shortcut}>
          <kbd style={styles.key}>Esc</kbd>
          <span style={styles.desc}>Clear selection & X-Ray</span>
        </div>
        <div style={styles.shortcut}>
          <kbd style={styles.key}>F</kbd>
          <span style={styles.desc}>Focus on selected</span>
        </div>
        <div style={styles.divider} />
        <div style={styles.shortcut}>
          <kbd style={styles.key}>1</kbd>
          <span style={styles.desc}>Free Orbit view</span>
        </div>
        <div style={styles.shortcut}>
          <div style={styles.keyGroup}>
            <kbd style={styles.keySmall}>2</kbd>
            <kbd style={styles.keySmall}>3</kbd>
            <kbd style={styles.keySmall}>4</kbd>
            <kbd style={styles.keySmall}>5</kbd>
            <kbd style={styles.keySmall}>6</kbd>
            <kbd style={styles.keySmall}>7</kbd>
          </div>
          <span style={styles.desc}>View presets (Top/Front/Right/Left/Back/Bottom)</span>
        </div>
      </div>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    bottom: '16px',
    left: '16px',
    background: '#1d1d1f',
    borderRadius: '10px',
    padding: '12px 16px',
    color: '#ffffff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '12px',
    zIndex: 100,
    animation: 'fadeIn 0.3s ease-out',
    boxShadow: 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.4) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.3) 2px 2px 6px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
    fontWeight: 600,
    color: '#aeaeb2',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontSize: '10px',
  },
  shortcuts: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  shortcut: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  key: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '32px',
    padding: '4px 8px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: 'none',
    borderRadius: '6px',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: 600,
    color: '#ffffff',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.3)',
  },
  keySmall: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    padding: '2px 5px',
    background: 'rgba(255, 255, 255, 0.08)',
    border: 'none',
    borderRadius: '4px',
    fontFamily: 'inherit',
    fontSize: '10px',
    fontWeight: 600,
    color: '#ffffff',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.15), inset -1px -1px 2px rgba(0,0,0,0.3)',
  },
  keyGroup: {
    display: 'flex',
    gap: '3px',
  },
  divider: {
    height: '1px',
    background: 'rgba(255, 255, 255, 0.1)',
    margin: '4px 0',
  },
  desc: {
    color: '#d1d1d6',
  },
}

// Add animation keyframes
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = `
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `
  document.head.appendChild(styleSheet)
}

export default KeyboardHints
