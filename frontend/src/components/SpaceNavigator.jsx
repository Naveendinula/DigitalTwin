import React, { useState } from 'react'

/**
 * SpaceNavigator Component
 * 
 * A floating UI component to navigate through spaces.
 * Matches the application's clean, minimal aesthetic.
 * 
 * @param {number} currentIndex - 1-based index of the current space
 * @param {number} totalCount - Total number of spaces
 * @param {string} currentName - Name of the current space
 * @param {function} onNext - Callback for next button
 * @param {function} onPrev - Callback for previous button
 */
function SpaceNavigator({ currentIndex, totalCount, currentName, onNext, onPrev }) {
  const [hoverPrev, setHoverPrev] = useState(false)
  const [hoverNext, setHoverNext] = useState(false)

  return (
    <div style={styles.container}>
      <button 
        onClick={onPrev} 
        style={{
          ...styles.button,
          ...(hoverPrev ? styles.buttonHover : {})
        }}
        onMouseEnter={() => setHoverPrev(true)}
        onMouseLeave={() => setHoverPrev(false)}
        title="Previous Space"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>
      
      <div style={styles.info}>
        <div style={styles.counter}>Space {currentIndex} of {totalCount}</div>
        <div style={styles.name} title={currentName}>{currentName}</div>
      </div>
      
      <button 
        onClick={onNext} 
        style={{
          ...styles.button,
          ...(hoverNext ? styles.buttonHover : {})
        }}
        onMouseEnter={() => setHoverNext(true)}
        onMouseLeave={() => setHoverNext(false)}
        title="Next Space"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  )
}

const styles = {
  container: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    padding: '8px 12px',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    zIndex: 100,
    gap: '16px',
    border: '1px solid #e5e5e7',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: '1px solid transparent',
    backgroundColor: '#f5f5f7',
    cursor: 'pointer',
    color: '#1d1d1f',
    transition: 'all 0.2s ease',
  },
  buttonHover: {
    backgroundColor: '#e5e5e7',
    transform: 'scale(1.05)',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '180px',
  },
  counter: {
    fontSize: '10px',
    color: '#86868b',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '2px',
  },
  name: {
    fontSize: '13px',
    fontWeight: 600,
    color: '#1d1d1f',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    maxWidth: '220px',
    textAlign: 'center',
  }
}

export default SpaceNavigator
