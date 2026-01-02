import React, { useState, useEffect } from 'react'

/**
 * PropertyPanel Component
 * 
 * Displays BIM metadata for a selected element.
 * Fetches metadata from a JSON file and shows properties in a sidebar.
 * 
 * @param {string|null} selectedId - The GlobalId of the selected element
 * @param {string} metadataUrl - URL to the metadata JSON file (default: '/metadata.json')
 */
function PropertyPanel({ selectedId, metadataUrl = '/metadata.json' }) {
  const [metadata, setMetadata] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Load metadata JSON on mount
  useEffect(() => {
    fetch(metadataUrl)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load metadata')
        return res.json()
      })
      .then(data => {
        // Handle both schema v2 (wrapped with "elements" key) and v1 (flat dict)
        // Schema v2: { schemaVersion: 2, orientation: {...}, elements: {...} }
        // Schema v1: { globalId: {...}, ... }
        const elements = data.elements || data
        setMetadata(elements)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error loading metadata:', err)
        setError(err.message)
        setLoading(false)
      })
  }, [metadataUrl])

  // Get data for selected element
  const elementData = selectedId && metadata ? metadata[selectedId] : null

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <h2 style={styles.title}>Properties</h2>
      </div>

      <div style={styles.content}>
        {loading && (
          <div style={styles.message}>
            <div style={styles.loadingSpinner}></div>
            <p>Loading metadata...</p>
          </div>
        )}

        {error && (
          <div style={styles.errorMessage}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ff3b30" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && !selectedId && (
          <div style={styles.message}>
            <div style={styles.selectIconWrapper}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5">
                <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
                <path d="M13 13l6 6" />
              </svg>
            </div>
            <p style={styles.messageTitle}>Select an element</p>
            <p style={styles.hint}>Click on a 3D element to view its properties</p>
          </div>
        )}

        {!loading && !error && selectedId && !elementData && (
          <div style={styles.message}>
            <div style={styles.selectIconWrapper}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#86868b" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <p style={styles.messageTitle}>No data found</p>
            <p style={styles.hint}>ID: {selectedId}</p>
            <p style={styles.hint}>
              {metadata ? `${Object.keys(metadata).length} elements in metadata` : 'Metadata not loaded'}
            </p>
            <details style={styles.debugDetails}>
              <summary style={styles.debugSummary}>Debug Info</summary>
              <p style={styles.debugText}>
                Available IDs (first 5):<br/>
                {metadata ? Object.keys(metadata).slice(0, 5).map(id => (
                  <code key={id} style={styles.debugCode}>{id}</code>
                )) : 'None'}
              </p>
            </details>
          </div>
        )}

        {elementData && (
          <div style={styles.elementInfo}>
            {/* Element Header */}
            <div style={styles.elementHeader}>
              <span style={styles.typeTag}>{elementData.type}</span>
              <h3 style={styles.elementName}>
                {elementData.name || 'Unnamed Element'}
              </h3>
              {elementData.description && (
                <p style={styles.description}>{elementData.description}</p>
              )}
            </div>

            {/* Basic Info */}
            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Basic Info</h4>
              <div style={styles.propertyList}>
                <PropertyRow label="GlobalId" value={selectedId} mono />
                {elementData.objectType && (
                  <PropertyRow label="Object Type" value={elementData.objectType} />
                )}
                {elementData.storey && (
                  <PropertyRow label="Storey" value={elementData.storey} />
                )}
              </div>
            </div>

            {/* Materials */}
            {elementData.materials && elementData.materials.length > 0 && (
              <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Materials</h4>
                <div style={styles.materialList}>
                  {elementData.materials.map((material, index) => (
                    <span key={index} style={styles.materialTag}>
                      {material}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Location */}
            {elementData.location && (
              <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Location</h4>
                <div style={styles.propertyList}>
                  <PropertyRow label="X" value={elementData.location.x?.toFixed(3)} />
                  <PropertyRow label="Y" value={elementData.location.y?.toFixed(3)} />
                  <PropertyRow label="Z" value={elementData.location.z?.toFixed(3)} />
                </div>
              </div>
            )}

            {/* Property Sets */}
            {elementData.properties && Object.keys(elementData.properties).length > 0 && (
              <div style={styles.section}>
                <h4 style={styles.sectionTitle}>Property Sets</h4>
                {Object.entries(elementData.properties).map(([psetName, properties]) => (
                  <PropertySet key={psetName} name={psetName} properties={properties} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * PropertySet Component - Collapsible property set
 */
function PropertySet({ name, properties }) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div style={styles.pset}>
      <button 
        style={styles.psetHeader}
        onClick={() => setExpanded(!expanded)}
      >
        <svg 
          width="12" 
          height="12" 
          viewBox="0 0 24 24" 
          fill="none" 
          stroke="currentColor" 
          strokeWidth="2"
          style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <span style={styles.psetName}>{name}</span>
        <span style={styles.psetCount}>{Object.keys(properties).length}</span>
      </button>
      {expanded && (
        <div style={styles.psetContent}>
          {Object.entries(properties).map(([key, value]) => (
            <PropertyRow key={key} label={key} value={value} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * PropertyRow Component - Single property display
 */
function PropertyRow({ label, value, mono = false }) {
  const displayValue = formatValue(value)
  
  // Check if value is a complex object (like material layers)
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    // Check if it's a special IFC quantity object
    if (value.type && value.type.includes('IfcPhysical')) {
      return (
        <div style={styles.complexPropertyRow}>
          <div style={styles.complexPropertyHeader}>
            <span style={styles.propertyLabel}>{label}</span>
            <span style={styles.complexTypeTag}>{value.Discrimination || 'Layer'}</span>
          </div>
          {value.properties && (
            <div style={styles.nestedProperties}>
              {Object.entries(value.properties).map(([key, val]) => (
                <div key={key} style={styles.nestedProperty}>
                  <span style={styles.nestedLabel}>{key}</span>
                  <span style={styles.nestedValue}>{formatValue(val)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
    
    // For other objects, show as nested properties
    return (
      <div style={styles.complexPropertyRow}>
        <span style={styles.propertyLabel}>{label}</span>
        <div style={styles.nestedProperties}>
          {Object.entries(value).map(([key, val]) => (
            <div key={key} style={styles.nestedProperty}>
              <span style={styles.nestedLabel}>{key}</span>
              <span style={styles.nestedValue}>{formatValue(val)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }
  
  return (
    <div style={styles.propertyRow}>
      <span style={styles.propertyLabel}>{label}</span>
      <span style={{
        ...styles.propertyValue,
        ...(mono ? styles.monoText : {})
      }}>
        {displayValue}
      </span>
    </div>
  )
}

/**
 * Format a property value for display
 */
function formatValue(value) {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? '✓ Yes' : '✗ No'
  if (typeof value === 'number') {
    // Format numbers nicely
    if (Number.isInteger(value)) return value.toString()
    return value.toFixed(3)
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') {
    // For objects, just show a summary instead of raw JSON
    const keys = Object.keys(value)
    if (keys.length === 0) return '—'
    return `{${keys.length} properties}`
  }
  return String(value)
}

/**
 * Styles
 */
const styles = {
  panel: {
    width: '320px',
    height: '100%',
    background: '#ffffff',
    borderLeft: '1px solid #e5e5e7',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    color: '#1d1d1f',
    flexShrink: 0,
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid #e5e5e7',
    background: '#fafafa',
  },
  title: {
    margin: 0,
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: '16px 0',
  },
  message: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '200px',
    color: '#86868b',
    textAlign: 'center',
    padding: '20px',
  },
  selectIconWrapper: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: '#f5f5f7',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px',
  },
  messageTitle: {
    margin: '0 0 4px 0',
    fontSize: '15px',
    fontWeight: 500,
    color: '#1d1d1f',
  },
  hint: {
    margin: 0,
    fontSize: '13px',
    color: '#86868b',
  },
  loadingSpinner: {
    width: '32px',
    height: '32px',
    border: '3px solid #f0f0f2',
    borderTopColor: '#1d1d1f',
    borderRadius: '50%',
    marginBottom: '16px',
    animation: 'spin 1s linear infinite',
  },
  errorMessage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    color: '#ff3b30',
    textAlign: 'center',
    gap: '12px',
  },
  elementInfo: {
    padding: '0 16px',
  },
  elementHeader: {
    marginBottom: '20px',
    padding: '16px',
    background: '#f5f5f7',
    borderRadius: '12px',
  },
  typeTag: {
    display: 'inline-block',
    padding: '4px 8px',
    background: '#1d1d1f',
    color: '#ffffff',
    borderRadius: '4px',
    fontSize: '10px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  elementName: {
    margin: '0 0 4px 0',
    fontSize: '16px',
    fontWeight: 600,
    color: '#1d1d1f',
    wordBreak: 'break-word',
  },
  description: {
    margin: 0,
    fontSize: '13px',
    color: '#86868b',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#86868b',
    paddingLeft: '4px',
  },
  propertyList: {
    background: '#f5f5f7',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  propertyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 12px',
    borderBottom: '1px solid #e5e5e7',
    gap: '12px',
  },
  complexPropertyRow: {
    padding: '10px 12px',
    borderBottom: '1px solid #e5e5e7',
  },
  complexPropertyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  complexTypeTag: {
    fontSize: '10px',
    color: '#86868b',
    background: '#e5e5e7',
    padding: '2px 6px',
    borderRadius: '4px',
    textTransform: 'uppercase',
  },
  nestedProperties: {
    background: '#ffffff',
    borderRadius: '6px',
    border: '1px solid #e5e5e7',
    overflow: 'hidden',
  },
  nestedProperty: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 10px',
    borderBottom: '1px solid #f0f0f2',
    fontSize: '12px',
  },
  nestedLabel: {
    color: '#86868b',
  },
  nestedValue: {
    color: '#1d1d1f',
    fontWeight: 500,
  },
  propertyLabel: {
    fontSize: '13px',
    color: '#86868b',
    flexShrink: 0,
  },
  propertyValue: {
    fontSize: '13px',
    color: '#1d1d1f',
    textAlign: 'right',
    wordBreak: 'break-word',
    fontWeight: 500,
  },
  monoText: {
    fontFamily: "'SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', monospace",
    fontSize: '11px',
  },
  materialList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  materialTag: {
    padding: '6px 12px',
    background: '#f5f5f7',
    borderRadius: '16px',
    fontSize: '12px',
    color: '#1d1d1f',
    fontWeight: 500,
  },
  pset: {
    marginBottom: '8px',
    background: '#f5f5f7',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  psetHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    padding: '10px 12px',
    background: 'none',
    border: 'none',
    color: '#1d1d1f',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '8px',
    fontFamily: 'inherit',
  },
  psetName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
  },
  psetCount: {
    fontSize: '11px',
    color: '#86868b',
    background: '#e5e5e7',
    padding: '2px 8px',
    borderRadius: '10px',
  },
  psetContent: {
    borderTop: '1px solid #e5e5e7',
    background: '#ffffff',
  },
  debugDetails: {
    marginTop: '12px',
    textAlign: 'left',
    width: '100%',
  },
  debugSummary: {
    cursor: 'pointer',
    fontSize: '11px',
    color: '#86868b',
  },
  debugText: {
    fontSize: '10px',
    color: '#86868b',
    marginTop: '8px',
    lineHeight: '1.6',
  },
  debugCode: {
    display: 'block',
    fontFamily: "'SF Mono', 'Monaco', monospace",
    fontSize: '9px',
    background: '#f5f5f7',
    padding: '2px 4px',
    borderRadius: '2px',
    marginTop: '2px',
    wordBreak: 'break-all',
  },
}

export default PropertyPanel
