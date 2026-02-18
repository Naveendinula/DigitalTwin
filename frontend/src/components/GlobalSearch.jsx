import { useEffect, useMemo, useRef, useState } from 'react'

const MAX_RESULTS = 20
const MAX_PROPERTY_ENTRIES = 30

function flattenPropertyValue(value, depth = 0) {
  if (value === null || value === undefined) return ''
  if (depth > 2) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    return value
      .slice(0, 6)
      .map(item => flattenPropertyValue(item, depth + 1))
      .filter(Boolean)
      .join(' ')
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .slice(0, 6)
      .map(([key, nested]) => `${key} ${flattenPropertyValue(nested, depth + 1)}`)
      .join(' ')
  }
  return String(value)
}

function buildSearchIndex(rawMetadata) {
  if (!rawMetadata) return []

  // Supports both schema v2 ({ elements: { ... }}) and v1 ({ ... }).
  const elements = rawMetadata.elements || rawMetadata
  if (!elements || typeof elements !== 'object') return []

  return Object.entries(elements).map(([globalId, element]) => {
    const materials = Array.isArray(element?.materials) ? element.materials.filter(Boolean) : []
    const properties = element?.properties && typeof element.properties === 'object' ? element.properties : {}
    const propertyTerms = []
    let propertyCount = 0

    Object.entries(properties).forEach(([psetName, psetValue]) => {
      if (propertyCount >= MAX_PROPERTY_ENTRIES) return
      propertyTerms.push(psetName)

      if (psetValue && typeof psetValue === 'object' && !Array.isArray(psetValue)) {
        Object.entries(psetValue).forEach(([propName, propValue]) => {
          if (propertyCount >= MAX_PROPERTY_ENTRIES) return
          const valueText = flattenPropertyValue(propValue)
          propertyTerms.push(propName)
          if (valueText) {
            propertyTerms.push(valueText)
          }
          propertyCount += 1
        })
      }
    })

    const type = element?.type || ''
    const name = element?.name || ''
    const objectType = element?.objectType || ''
    const storey = element?.storey || ''

    const searchText = [
      globalId,
      type,
      name,
      objectType,
      storey,
      ...materials,
      ...propertyTerms
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return {
      globalId,
      type,
      name,
      objectType,
      storey,
      materials,
      searchText
    }
  })
}

function scoreResult(item, query) {
  const name = (item.name || '').toLowerCase()
  const globalId = (item.globalId || '').toLowerCase()
  const objectType = (item.objectType || '').toLowerCase()
  const type = (item.type || '').toLowerCase()

  let score = 0
  if (globalId === query) score += 200
  if (globalId.startsWith(query)) score += 120
  if (name === query) score += 110
  if (name.startsWith(query)) score += 90
  if (name.includes(query)) score += 70
  if (objectType.startsWith(query)) score += 55
  if (objectType.includes(query)) score += 45
  if (type.startsWith(query)) score += 35
  if (type.includes(query)) score += 25
  if (item.searchText.includes(query)) score += 10
  return score
}

function getTypeTag(type) {
  if (!type) return 'Element'
  if (type === 'IfcSpace') return 'Space'
  if (type === 'IfcMechanicalEquipment') return 'Equipment'
  if (type.includes('Terminal')) return 'Terminal'
  return type.replace(/^Ifc/, '')
}

function getPrimaryLabel(item) {
  return item.name || item.objectType || item.type || item.globalId
}

export default function GlobalSearch({ metadataUrl, onSelectResult }) {
  const [searchIndex, setSearchIndex] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!metadataUrl) {
      setSearchIndex([])
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setError(null)

    fetch(metadataUrl, { signal: controller.signal, credentials: 'include' })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load search index')
        return res.json()
      })
      .then(data => {
        setSearchIndex(buildSearchIndex(data))
      })
      .catch(err => {
        if (err.name === 'AbortError') return
        console.error('Error loading global search metadata:', err)
        setError(err.message || 'Search is unavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      })

    return () => controller.abort()
  }, [metadataUrl])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!rootRef.current) return
      if (!rootRef.current.contains(event.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const trimmedQuery = query.trim()

  const results = useMemo(() => {
    if (trimmedQuery.length < 2) return []
    const normalized = trimmedQuery.toLowerCase()

    return searchIndex
      .filter(item => item.searchText.includes(normalized))
      .map(item => ({ ...item, score: scoreResult(item, normalized) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
  }, [searchIndex, trimmedQuery])

  const shouldShowDropdown = open && (trimmedQuery.length >= 2 || loading || error)

  const handleSelect = (item) => {
    if (!item?.globalId) return
    onSelectResult?.(item)
    setOpen(false)
  }

  return (
    <div ref={rootRef} style={styles.wrapper}>
      <input
        type="text"
        value={query}
        placeholder="Search all model data (e.g., AHU-01, steel, IfcSpace)"
        style={styles.input}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false)
            setQuery('')
          }
          if (event.key === 'Enter' && results.length > 0) {
            event.preventDefault()
            handleSelect(results[0])
          }
        }}
      />

      {shouldShowDropdown && (
        <div style={styles.dropdown}>
          {loading && <div style={styles.infoRow}>Loading search index...</div>}
          {error && !loading && <div style={styles.errorRow}>{error}</div>}

          {!loading && !error && trimmedQuery.length >= 2 && results.length === 0 && (
            <div style={styles.infoRow}>No matches found.</div>
          )}

          {!loading && !error && results.length > 0 && (
            <ul style={styles.resultList}>
              {results.map(item => (
                <li key={item.globalId}>
                  <button
                    type="button"
                    className="global-search-item"
                    style={styles.resultButton}
                    onClick={() => handleSelect(item)}
                    title={item.globalId}
                  >
                    <div style={styles.resultTopRow}>
                      <span style={styles.resultPrimary}>{getPrimaryLabel(item)}</span>
                      <span style={styles.resultTypeTag}>{getTypeTag(item.type)}</span>
                    </div>
                    <div style={styles.resultMeta}>
                      <span>{item.globalId}</span>
                      {item.storey && <span>Storey: {item.storey}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

const softShadow = 'rgb(255, 255, 255) 1px 1px 1px 0px inset, rgba(0, 0, 0, 0.15) -1px -1px 1px 0px inset, rgba(0, 0, 0, 0.26) 0.444584px 0.444584px 0.628737px -1px, rgba(0, 0, 0, 0.22) 1.21324px 1.21324px 1.38357px -2px, rgba(0, 0, 0, 0.15) 2.60599px 2.60599px 2.68477px -3px, rgba(0, 0, 0, 0.04) 6px 6px 6px -4px'

const styles = {
  wrapper: {
    position: 'relative',
    width: '100%',
    minWidth: 0
  },
  input: {
    width: '100%',
    height: '36px',
    borderRadius: '10px',
    border: 'none',
    padding: '0 12px',
    background: '#e8e8ec',
    color: '#1d1d1f',
    fontSize: '12px',
    outline: 'none',
    boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.08), inset -1px -1px 2px rgba(255,255,255,0.6)'
  },
  dropdown: {
    position: 'absolute',
    top: '42px',
    left: 0,
    right: 0,
    background: '#f4f4f4',
    borderRadius: '10px',
    boxShadow: softShadow,
    maxHeight: '360px',
    overflowY: 'auto',
    zIndex: 120
  },
  resultList: {
    listStyle: 'none',
    padding: '6px',
    margin: 0
  },
  resultButton: {
    width: '100%',
    border: 'none',
    borderRadius: '8px',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    padding: '8px 10px',
    color: '#1d1d1f'
  },
  resultTopRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    alignItems: 'center'
  },
  resultPrimary: {
    fontSize: '12px',
    fontWeight: 600,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis'
  },
  resultTypeTag: {
    flexShrink: 0,
    fontSize: '10px',
    color: '#636366',
    background: 'rgba(0, 0, 0, 0.06)',
    borderRadius: '6px',
    padding: '2px 6px'
  },
  resultMeta: {
    marginTop: '4px',
    display: 'flex',
    flexWrap: 'wrap',
    gap: '10px',
    fontSize: '10px',
    color: '#86868b'
  },
  infoRow: {
    padding: '10px 12px',
    fontSize: '12px',
    color: '#86868b'
  },
  errorRow: {
    padding: '10px 12px',
    fontSize: '12px',
    color: '#ff3b30'
  }
}

if (typeof document !== 'undefined' && !document.querySelector('#global-search-styles')) {
  const styleSheet = document.createElement('style')
  styleSheet.id = 'global-search-styles'
  styleSheet.textContent = `
    .global-search-item:hover {
      background: rgba(0, 113, 227, 0.08);
    }
  `
  document.head.appendChild(styleSheet)
}
