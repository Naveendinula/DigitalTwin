import React, { useState, useEffect, useRef } from 'react'

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
 * @param {Array} spaces - List of all spaces
 * @param {Array} selectedIds - List of currently selected space IDs
 * @param {function} onSelectionChange - Callback when selection changes
 */
function SpaceNavigator({ 
  currentIndex, 
  totalCount, 
  currentName, 
  onNext, 
  onPrev,
  spaces = [],
  selectedIds = [],
  onSelectionChange
}) {
  const [hoverPrev, setHoverPrev] = useState(false)
  const [hoverNext, setHoverNext] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    if (showDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDropdown])

  // Determine selection state
  // If selectedIds is empty, it means ALL are selected (default behavior of SpaceBboxOverlay)
  // If selectedIds has '__NONE__', it means NONE are selected
  const isAllSelected = selectedIds.length === 0
  const isNoneSelected = selectedIds.length === 1 && selectedIds[0] === '__NONE__'
  
  const effectiveSelection = isAllSelected 
    ? new Set(spaces.map(s => s.globalId))
    : isNoneSelected 
      ? new Set()
      : new Set(selectedIds)

  const handleToggleAll = () => {
    if (effectiveSelection.size === spaces.length) {
      // Deselect all
      onSelectionChange?.(['__NONE__'])
    } else {
      // Select all
      onSelectionChange?.([])
    }
  }

  const handleToggleSpace = (id) => {
    const newSelection = new Set(effectiveSelection)
    if (newSelection.has(id)) {
      newSelection.delete(id)
    } else {
      newSelection.add(id)
    }

    if (newSelection.size === 0) {
      onSelectionChange?.(['__NONE__'])
    } else if (newSelection.size === spaces.length) {
      onSelectionChange?.([])
    } else {
      onSelectionChange?.(Array.from(newSelection))
    }
  }

  // Display text logic
  let displayText = currentName
  let subText = `Space ${currentIndex} of ${totalCount}`
  
  if (spaces.length > 0) {
    if (isAllSelected) {
      // Default view: show current stepper name
    } else if (isNoneSelected) {
      displayText = "No Spaces Selected"
    } else {
      const count = effectiveSelection.size
      if (count > 1) {
        displayText = `${count} Spaces Selected`
      }
    }
  }

  return (
    <div style={styles.container} ref={dropdownRef}>
      {showDropdown && (
        <div style={styles.dropdown}>
          <div style={styles.dropdownHeader}>
            <label style={styles.checkboxRow}>
              <input 
                type="checkbox" 
                checked={effectiveSelection.size === spaces.length}
                onChange={handleToggleAll}
                style={styles.checkbox}
              />
              <span style={styles.checkboxLabel}>Select All</span>
            </label>
          </div>
          <div style={styles.dropdownList}>
            {spaces.map(space => {
               const label = `${space.room_no || ''} ${space.room_name || space.name || ''}`.trim() || space.globalId
               return (
                <label key={space.globalId} style={styles.checkboxRow}>
                  <input 
                    type="checkbox" 
                    checked={effectiveSelection.has(space.globalId)}
                    onChange={() => handleToggleSpace(space.globalId)}
                    style={styles.checkbox}
                  />
                  <span style={styles.checkboxLabel} title={label}>{label}</span>
                </label>
               )
            })}
          </div>
        </div>
      )}

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
      
      <div 
        style={{...styles.info, cursor: 'pointer'}} 
        onClick={() => setShowDropdown(!showDropdown)}
        title="Click to select spaces"
      >
        <div style={styles.counter}>{subText}</div>
        <div style={styles.name}>
          {displayText}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginLeft: '6px', opacity: 0.5}}>
            <polyline points={showDropdown ? "18 15 12 9 6 15" : "6 9 12 15 18 9"}></polyline>
          </svg>
        </div>
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

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px';

const styles = {
  container: {
    position: 'absolute',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: '8px 12px',
    borderRadius: '12px',
    boxShadow: softShadow,
    zIndex: 100,
    gap: '16px',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    border: 'none',
    backgroundColor: '#e8e8ec',
    cursor: 'pointer',
    color: '#1d1d1f',
    boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.8), inset -1px -1px 2px rgba(0,0,0,0.1), 0.5px 0.5px 1px rgba(0,0,0,0.15)',
  },
  buttonHover: {
    backgroundColor: '#e0e0e4',
  },
  info: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    minWidth: '180px',
    userSelect: 'none',
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
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdown: {
    position: 'absolute',
    bottom: '100%',
    left: '0',
    right: '0',
    marginBottom: '8px',
    backgroundColor: '#f4f4f4',
    borderRadius: '12px',
    boxShadow: softShadow,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '300px',
  },
  dropdownHeader: {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(0, 0, 0, 0.05)',
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  dropdownList: {
    overflowY: 'auto',
    padding: '4px 0',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    color: '#1d1d1f',
    userSelect: 'none',
    transition: 'background-color 0.1s ease',
  },
  checkbox: {
    marginRight: '8px',
    accentColor: '#0071e3',
    cursor: 'pointer',
  },
  checkboxLabel: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  }
}

export default SpaceNavigator
