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
        setMetadata(data)
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
          <div style={styles.message}>Loading metadata...</div>
        )}

        {error && (
          <div style={styles.errorMessage}>
            <span style={styles.errorIcon}>⚠️</span>
            {error}
          </div>
        )}

        {!loading && !error && !selectedId && (
          <div style={styles.message}>
            <span style={styles.selectIcon}>👆</span>
            <p>Select an element</p>
            <p style={styles.hint}>Click on a 3D element to view its properties</p>
          </div>
        )}

        {!loading && !error && selectedId && !elementData && (
          <div style={styles.message}>
            <span style={styles.errorIcon}>❓</span>
            <p>No data found</p>
            <p style={styles.hint}>ID: {selectedId}</p>
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
        <span style={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
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
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Styles
 */
const styles = {
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: '320px',
    height: '100%',
    background: 'rgba(26, 26, 46, 0.95)',
    borderLeft: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#ffffff',
    backdropFilter: 'blur(10px)',
  },
  header: {
    padding: '16px 20px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
  },
  title: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.7)',
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
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    padding: '20px',
  },
  selectIcon: {
    fontSize: '32px',
    marginBottom: '12px',
  },
  errorIcon: {
    fontSize: '24px',
    marginBottom: '8px',
  },
  hint: {
    fontSize: '12px',
    marginTop: '4px',
    opacity: 0.6,
  },
  errorMessage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '20px',
    color: '#ff6b6b',
    textAlign: 'center',
  },
  elementInfo: {
    padding: '0 16px',
  },
  elementHeader: {
    marginBottom: '20px',
  },
  typeTag: {
    display: 'inline-block',
    padding: '4px 8px',
    background: 'rgba(100, 108, 255, 0.2)',
    color: '#a5a8ff',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  elementName: {
    margin: '0 0 4px 0',
    fontSize: '18px',
    fontWeight: 600,
    color: '#ffffff',
    wordBreak: 'break-word',
  },
  description: {
    margin: 0,
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
  },
  section: {
    marginBottom: '20px',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'rgba(255, 255, 255, 0.5)',
  },
  propertyList: {
    background: 'rgba(255, 255, 255, 0.03)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  propertyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: '10px 12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    gap: '12px',
  },
  propertyLabel: {
    fontSize: '13px',
    color: 'rgba(255, 255, 255, 0.6)',
    flexShrink: 0,
  },
  propertyValue: {
    fontSize: '13px',
    color: '#ffffff',
    textAlign: 'right',
    wordBreak: 'break-word',
  },
  monoText: {
    fontFamily: 'ui-monospace, monospace',
    fontSize: '11px',
  },
  materialList: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  materialTag: {
    padding: '4px 10px',
    background: 'rgba(255, 255, 255, 0.08)',
    borderRadius: '12px',
    fontSize: '12px',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  pset: {
    marginBottom: '8px',
    background: 'rgba(255, 255, 255, 0.03)',
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
    color: '#ffffff',
    cursor: 'pointer',
    textAlign: 'left',
    gap: '8px',
  },
  expandIcon: {
    fontSize: '10px',
    color: 'rgba(255, 255, 255, 0.4)',
  },
  psetName: {
    flex: 1,
    fontSize: '13px',
    fontWeight: 500,
  },
  psetCount: {
    fontSize: '11px',
    color: 'rgba(255, 255, 255, 0.4)',
    background: 'rgba(255, 255, 255, 0.1)',
    padding: '2px 6px',
    borderRadius: '10px',
  },
  psetContent: {
    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
  },
}

export default PropertyPanel
